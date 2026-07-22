"""
bc_issuer_recovery.py

목적:
  card_data_normalizer_v2.py는 issuer_name_raw 필드만으로 발급사를 판별하기 때문에,
  "바로카드", "덤카드", "홈쇼핑카드", "kt SUPER 카드" 등 BC카드의 하위 브랜드/제휴 채널명이
  issuer_name_raw에 기록된 카드들이 8개사(신한/KB/삼성/현대/롯데/우리/하나/BC)에 매칭되지 못하고
  전부 unresolved_issuer_cards.csv로 빠지는 문제가 있었다.

  issuer_mismatch_resolver.py가 사용한 것과 동일한 방식으로, 원본 full_text의
  타이틀 세그먼트(3번, "카드명 · 실제발급사")를 대조하면 이 카드들의 실제 발급사가
  전부 "BC 바로카드"(BC카드의 제휴 발급 브랜드)임을 확인할 수 있다.

경로 규칙 (중요, 이번 수정 사항):
  이 파일은 "<project>/Data/output/schema_output/" 안에 위치하고,
  card_data_normalizer_v2.py와 card_data_raw.json은 한 단계 위인
  "<project>/Data/output/" 안에 위치한다. 실행 위치(현재 작업 디렉터리)가
  어디든 항상 올바르게 동작하도록, 모든 경로를 이 스크립트 파일 자신의
  위치(__file__)를 기준으로 동적으로 계산한다.

실행 방법:
  경로/실행 위치에 관계없이 다음처럼 실행하면 된다.
  python "<project>/Data/output/schema_output/bc_issuer_recovery.py"

출력 경로 (모두 output/schema_output/ 안에 생성):
  cards_corrected_v2.csv          (기존 1247건 + BC 신규 27건)
  card_brands_v2.csv              (기존 + BC 신규분)
  benefits_patched_v3.csv         (기존 2049건 + BC 확정 혜택)
  benefits_needs_ai_review_v3.csv (기존 696건 + BC AI검토대상 혜택)
  unresolved_issuer_cards_v2.csv  (BC로 복구된 27건 제외)
  bc_recovery_log.csv             (복구 상세 로그)
"""
import json, csv, os, sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))   # .../output/schema_output
BASE_DIR = os.path.dirname(SCRIPT_DIR)                    # .../output
SCHEMA_DIR = SCRIPT_DIR
RAW_PATH = os.path.join(BASE_DIR, "card_data_raw.json")

if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from card_data_normalizer_v2 import (
    parse_fee_segment, extract_category_pairs, is_noise_text,
    extract_inline_condition, parse_benefit_value,
)

BC_TARGET_ISSUER_LABEL = "BC 바로카드"
BC_ISSUER_CODE = "BC"


def get_true_issuer_from_title_segment(full_text):
    segs = [s.strip() for s in full_text.split("|")]
    if len(segs) > 3 and "·" in segs[3]:
        return segs[3].split("·")[-1].strip()
    return None


def load_raw_lookup(raw_path):
    with open(raw_path, encoding="utf-8") as f:
        records = json.load(f)
    return {rec["source_id"]: rec for rec in records}


def load_category_master(merchant_groups_path):
    name_to_id, max_id = {}, 0
    with open(merchant_groups_path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            name_to_id[row["group_name"]] = int(row["group_id"])
            max_id = max(max_id, int(row["group_id"]))
    return name_to_id, max_id


def find_bc_card_ids(unresolved_path, raw_lookup):
    bc_ids, other_rows = [], []
    with open(unresolved_path, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            cid = int(row["card_id"])
            rec = raw_lookup.get(cid)
            issuer_label = get_true_issuer_from_title_segment(rec["full_text"]) if rec else None
            if issuer_label == BC_TARGET_ISSUER_LABEL:
                bc_ids.append(cid)
            else:
                other_rows.append(row)
    return bc_ids, other_rows


def build_bc_rows(bc_ids, raw_lookup, name_to_id, max_category_id):
    cards_rows, brand_rows, confirmed_rows, review_rows, log_rows = [], [], [], [], []

    for cid in bc_ids:
        rec = raw_lookup[cid]
        card_name = rec.get("card_name") or ""

        cards_rows.append({
            "card_id": cid, "issuer_code": BC_ISSUER_CODE, "card_name": card_name,
            "card_type": "CREDIT", "status": "ACTIVE", "official_url": rec.get("source_url"),
        })

        fee_domestic, fee_overseas, card_level_min_amount, brands_found = parse_fee_segment(rec.get("full_text", ""))
        if not brands_found:
            brands_found = rec.get("brands", [])
        if brands_found:
            for b in brands_found:
                brand_rows.append({"card_id": cid, "brand_name": b,
                                    "annual_fee_domestic": fee_domestic, "annual_fee_overseas": fee_overseas})
        else:
            brand_rows.append({"card_id": cid, "brand_name": None,
                                "annual_fee_domestic": fee_domestic, "annual_fee_overseas": fee_overseas})

        n_confirmed = n_review = 0
        for group_name, desc in extract_category_pairs(rec.get("full_text", "")):
            if is_noise_text(desc):
                continue
            if group_name not in name_to_id:
                max_category_id += 1
                name_to_id[group_name] = max_category_id
            category_id = name_to_id[group_name]

            inline_min = extract_inline_condition(desc)
            effective_min_amount = inline_min if inline_min is not None else card_level_min_amount
            parsed = parse_benefit_value(desc)

            row = {
                "card_id": cid, "min_amount": effective_min_amount,
                "min_amount_source": "INLINE" if inline_min is not None else "CARD_LEVEL",
                "category_id": category_id, "group_name": group_name,
                "benefit_type": parsed["benefit_type"], "rate": parsed["rate"],
                "fixed_amount": parsed["fixed_amount"], "unit_basis": parsed["unit_basis"],
                "raw_text": desc,
            }
            if parsed["needs_review"]:
                review_rows.append(row)
                n_review += 1
            else:
                confirmed_rows.append(row)
                n_confirmed += 1

        log_rows.append({
            "card_id": cid, "card_name": card_name, "issuer_code_assigned": BC_ISSUER_CODE,
            "resolution": "AUTO_RECOVERED_FROM_TITLE_SEGMENT",
            "confirmed_benefits_added": n_confirmed, "review_benefits_added": n_review,
        })

    return cards_rows, brand_rows, confirmed_rows, review_rows, log_rows


def append_csv(existing_path, new_rows, output_path, fieldnames):
    with open(existing_path, encoding="utf-8-sig") as f:
        existing_rows = list(csv.DictReader(f))
    combined = existing_rows + new_rows
    with open(output_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(combined)
    return len(existing_rows), len(combined)


def write_csv(rows, path, fieldnames):
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main():
    raw_lookup = load_raw_lookup(RAW_PATH)
    name_to_id, max_category_id = load_category_master(os.path.join(SCHEMA_DIR, "merchant_groups.csv"))

    unresolved_path = os.path.join(SCHEMA_DIR, "unresolved_issuer_cards.csv")
    bc_ids, other_unresolved_rows = find_bc_card_ids(unresolved_path, raw_lookup)

    cards_rows, brand_rows, confirmed_rows, review_rows, log_rows = build_bc_rows(
        bc_ids, raw_lookup, name_to_id, max_category_id
    )

    before_cards, after_cards = append_csv(
        os.path.join(SCHEMA_DIR, "cards_corrected.csv"), cards_rows,
        os.path.join(SCHEMA_DIR, "cards_corrected_v2.csv"),
        ["card_id", "issuer_code", "card_name", "card_type", "status", "official_url"],
    )
    before_brands, after_brands = append_csv(
        os.path.join(SCHEMA_DIR, "card_brands.csv"), brand_rows,
        os.path.join(SCHEMA_DIR, "card_brands_v2.csv"),
        ["card_id", "brand_name", "annual_fee_domestic", "annual_fee_overseas"],
    )
    benefit_fields = ["card_id", "min_amount", "min_amount_source", "category_id",
                       "group_name", "benefit_type", "rate", "fixed_amount", "unit_basis", "unit_type", "raw_text"]
    for r in confirmed_rows:
        r["unit_type"] = "WON" if (r["benefit_type"] in ("MILEAGE", "POINT_PER_UNIT") and r["unit_basis"]) else None
    before_conf, after_conf = append_csv(
        os.path.join(SCHEMA_DIR, "benefits_patched_v2.csv"), confirmed_rows,
        os.path.join(SCHEMA_DIR, "benefits_patched_v3.csv"), benefit_fields,
    )

    review_fields = ["card_id", "min_amount", "min_amount_source", "category_id",
                      "group_name", "benefit_type", "rate", "fixed_amount", "unit_basis", "raw_text"]
    before_rev, after_rev = append_csv(
        os.path.join(SCHEMA_DIR, "benefits_needs_ai_review_v2.csv"), review_rows,
        os.path.join(SCHEMA_DIR, "benefits_needs_ai_review_v3.csv"), review_fields,
    )

    write_csv(other_unresolved_rows, os.path.join(SCHEMA_DIR, "unresolved_issuer_cards_v2.csv"),
               ["card_id", "raw_issuer", "card_name", "source_url"])
    write_csv(log_rows, os.path.join(SCHEMA_DIR, "bc_recovery_log.csv"),
               ["card_id", "card_name", "issuer_code_assigned", "resolution",
                "confirmed_benefits_added", "review_benefits_added"])

    print(f"BC카드로 복구된 카드 수: {len(bc_ids)}건")
    print(f"cards_corrected: {before_cards}건 -> {after_cards}건")
    print(f"card_brands: {before_brands}건 -> {after_brands}건")
    print(f"benefits(확정): {before_conf}건 -> {after_conf}건")
    print(f"benefits_needs_ai_review: {before_rev}건 -> {after_rev}건")
    print(f"unresolved_issuer_cards: 326건 -> {len(other_unresolved_rows)}건")
    print("BC 복구 로그: schema_output/bc_recovery_log.csv")


if __name__ == "__main__":
    main()