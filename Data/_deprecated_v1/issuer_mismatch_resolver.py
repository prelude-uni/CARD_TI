
"""
issuer_mismatch_resolver.py
목적: card_data_normalizer.py가 생성한 schema_output/cards.csv 중,
      issuer_code와 card_name 표기 발급사가 불일치하는 59건을 검증하고 교정한다.

근본 원인:
  원본 수집 데이터(card_data_raw.json)의 issuer_name_raw 필드가 일부 카드에서
  잘못된 값으로 채워져 있었음 (예: card_id=109 -> issuer_name_raw='신한카드'로 잘못 기록됨).
  반면 full_text 안의 세그먼트 3번("카드명 · 실제발급사")에는 카드고릴라 페이지가
  직접 표기한 정확한 발급사명이 들어있음. 이를 실제 웹페이지(card-gorilla.com)와
  대조해 100% 일치함을 확인했으므로, 이 값을 최종 신뢰 소스로 사용한다.

이 스크립트는 card_data_normalizer.py 및 그 출력 파일을 직접 수정하지 않고,
schema_output/cards.csv를 읽어 새로운 보정 파일(cards_corrected.csv)을 별도로 생성한다.
"""

import json, re, csv, os

RAW_PATH = "card_data_raw.json"
CARDS_CSV_PATH = "schema_output/cards.csv"
OUTPUT_PATH = "schema_output/cards_corrected.csv"
MISMATCH_LOG_PATH = "schema_output/issuer_mismatch_log.csv"

KNOWN_ISSUERS = {
    "신한카드": "SHINHAN", "KB국민카드": "KB", "삼성카드": "SAMSUNG",
    "현대카드": "HYUNDAI", "롯데카드": "LOTTE", "우리카드": "WOORI",
    "하나카드": "HANA", "BC카드": "BC",
}
KNOWN_ISSUERS_SET = set(KNOWN_ISSUERS.keys())


def get_true_issuer_from_title_segment(full_text):
    """
    full_text의 세그먼트 구조: [...,카드명(idx2), '카드명 · 발급사'(idx3), 대표혜택(idx4), ...]
    idx3에서 '·' 뒤에 오는 문자열이 카드고릴라 페이지가 표기한 실제 발급사명이다.
    """
    segs = [s.strip() for s in full_text.split("|")]
    if len(segs) > 3 and "·" in segs[3]:
        candidate = segs[3].split("·")[-1].strip()
        if candidate in KNOWN_ISSUERS_SET:
            return candidate
    return None


def load_raw_lookup(raw_path):
    with open(raw_path, encoding="utf-8") as f:
        records = json.load(f)
    lookup = {}
    for rec in records:
        true_issuer_kor = get_true_issuer_from_title_segment(rec.get("full_text", ""))
        lookup[rec["source_id"]] = true_issuer_kor
    return lookup


def detect_mismatch(issuer_code, card_name):
    """issuer_code가 가리키는 발급사명이 card_name 안의 '다른' 발급사명과 충돌하는지 확인."""
    issuer_kor_map = {v: k for k, v in KNOWN_ISSUERS.items()}
    my_kor = issuer_kor_map.get(issuer_code)
    if my_kor is None:
        return False
    for kor in KNOWN_ISSUERS_SET:
        if kor != my_kor and kor in card_name:
            return True
    return False


def correct_cards_csv(cards_csv_path, raw_lookup, output_path, log_path):
    with open(cards_csv_path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        fieldnames = reader.fieldnames

    corrected_rows = []
    log_rows = []

    for row in rows:
        card_id = int(row["card_id"])
        original_code = row["issuer_code"]
        card_name = row["card_name"]

        is_mismatch = detect_mismatch(original_code, card_name)

        if is_mismatch:
            true_issuer_kor = raw_lookup.get(card_id)
            true_code = KNOWN_ISSUERS.get(true_issuer_kor)

            if true_code and true_code != original_code:
                log_rows.append({
                    "card_id": card_id, "card_name": card_name,
                    "issuer_code_before": original_code,
                    "issuer_code_after": true_code,
                    "resolution": "AUTO_CORRECTED_FROM_TITLE_SEGMENT",
                })
                row["issuer_code"] = true_code
            else:
                log_rows.append({
                    "card_id": card_id, "card_name": card_name,
                    "issuer_code_before": original_code,
                    "issuer_code_after": original_code,
                    "resolution": "UNRESOLVED_KEPT_ORIGINAL",
                })

        corrected_rows.append(row)

    with open(output_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(corrected_rows)

    with open(log_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=["card_id", "card_name", "issuer_code_before",
                                                "issuer_code_after", "resolution"])
        writer.writeheader()
        writer.writerows(log_rows)

    corrected_count = sum(1 for r in log_rows if r["resolution"] == "AUTO_CORRECTED_FROM_TITLE_SEGMENT")
    unresolved_count = sum(1 for r in log_rows if r["resolution"] == "UNRESOLVED_KEPT_ORIGINAL")

    print(f"전체 카드: {len(corrected_rows)}건")
    print(f"발급사 불일치 감지: {len(log_rows)}건")
    print(f"자동 교정 완료: {corrected_count}건")
    print(f"교정 불가(원본 유지): {unresolved_count}건")
    print(f"보정된 카드 파일: {output_path}")
    print(f"교정 로그: {log_path}")


if __name__ == "__main__":
    raw_lookup = load_raw_lookup(RAW_PATH)
    correct_cards_csv(CARDS_CSV_PATH, raw_lookup, OUTPUT_PATH, MISMATCH_LOG_PATH)
