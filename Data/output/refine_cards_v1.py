"""
refine_cards_v1.py

목적:
  card_data_raw.json 원본 데이터를 원본 3NF 스키마(카드DB_스키마.sql)의
  cards / card_brands 테이블 구조에 맞게 정제하여 CSV로 산출한다.

  이 스크립트는 Supabase에 SQL을 직접 실행하지 않는다. 정제 결과를 로컬
  CSV 파일로만 저장하며, 업로드는 사용자가 CSV를 검토한 뒤 별도 스크립트로
  진행한다. (SQL을 바로 실행하면 AI의 분류 판단이 검증 없이 DB에 들어가는
  문제를 방지하기 위함)

대상:
  전체 1,573건 중 issuer_code_mapped가 아래 8개사인 1,247건만 대상으로 한다.
  (SHINHAN, KB, SAMSUNG, HYUNDAI, LOTTE, WOORI, HANA, BC)
  나머지 326건(NH농협/IBK/씨티/지방은행 등)은 이번 프로젝트 스코프 밖이므로
  제외한다. 제외된 건은 삭제하지 않고 skipped_out_of_scope.csv로 별도 보존한다.

산출 파일 (전부 output/refined_v1/ 폴더에 저장):
  1. cards_v1.csv
     - card_name, issuer_id, issuer_code, card_type, category_main,
       annual_fee_domestic, annual_fee_overseas, source_url, source_id
  2. card_brands_v1.csv
     - source_url(참조용), brand_name
  3. skipped_out_of_scope.csv
     - 대상 8개사가 아니어서 제외된 326건 (source_id, card_name, issuer_name_raw)
  4. classification_verification_sample.csv
     - category_main / card_type 분류 결과를 사람이 검증할 수 있도록,
       분류 유형별로 최대 8건씩 원문 일부(raw_text_snippet)와 함께 추출
     - 이 파일을 열어 분류가 실제로 맞는지 직접 확인하는 용도

분류 규칙 (모두 키워드 매칭 기반, 정규식이 아닌 단순 in 연산자 사용):
  card_type:
    - 카드명 또는 본문에 '체크카드', 'CHECK카드' 포함 -> CHECK
    - '선불카드', '기프트카드', '충전카드' 포함 -> PREPAID
    - 그 외 -> CREDIT (신용카드 기본값)

  category_main (7종, 우선순위: 등장 키워드 개수가 가장 많은 카테고리):
    쇼핑, 외식카페, 문화여가, 교통자동차, 여행항공, 생활, 기타(매칭 없을 때)

주의:
  - 이 스크립트는 데이터를 삭제하지 않는다. 읽기(json)와 쓰기(csv)만 수행한다.
  - annual_fee_family, metal_plate, issue_fee_extra는 원본 데이터에 정보가
    없어 빈 값으로 남긴다. 임의로 추정하지 않는다.

실행 방법:
  python refine_cards_v1.py
  (card_data_raw.json이 같은 폴더 또는 output/ 폴더에 있어야 함. 아래
   RAW_JSON_PATH 변수를 실제 위치에 맞게 수정할 것)
"""
import json
import os
import csv
from collections import Counter

RAW_JSON_PATH = "output/card_data_raw.json"   # 실제 경로에 맞게 수정
OUTPUT_DIR = "output/refined_v1"

TARGET_ISSUERS = ['SHINHAN', 'KB', 'SAMSUNG', 'HYUNDAI', 'LOTTE', 'WOORI', 'HANA', 'BC']
ISSUER_ID_MAP = {code: idx + 1 for idx, code in enumerate(TARGET_ISSUERS)}

CHECK_KEYWORDS = ['체크카드', 'CHECK카드']
PREPAID_KEYWORDS = ['선불카드', '기프트카드', '충전카드']

CATEGORY_KEYWORDS = {
    '쇼핑': ['백화점', '대형마트', '편의점', '온라인쇼핑', '드럭스토어', '쿠팡', '이마트',
             '롯데마트', '홈플러스', 'GS25', 'CU', '세븐일레븐', '올리브영', 'SSG', '11번가', 'G마켓'],
    '외식카페': ['카페', '스타벅스', '이디야', '투썸', '빽다방', '배달의민족', '요기요',
                '쿠팡이츠', '외식', '푸드'],
    '문화여가': ['영화', 'CGV', '롯데시네마', '메가박스', '디지털구독', '넷플릭스', '유튜브',
                '왓챠', '티빙', '테마파크', '골프', '공연', '전시'],
    '교통자동차': ['주유', '대중교통', '택시', '자동차', '정비', 'S-OIL', 'GS칼텍스', 'SK에너지',
                  '오일뱅크', '고속도로'],
    '여행항공': ['항공', '대한항공', '아시아나', '공항라운지', '면세점', '여행', '숙박', '호텔', '마일리지'],
    '생활': ['통신', '간편결제', '병원', '약국', '교육', '육아', '카카오페이', '네이버페이',
             'SK텔레콤', 'KT', 'LGU+', '공���금', '보험'],
}


def classify_card_type(name, text):
    combined = f"{name} {text}"
    if any(k in combined for k in CHECK_KEYWORDS):
        return "CHECK"
    if any(k in combined for k in PREPAID_KEYWORDS):
        return "PREPAID"
    return "CREDIT"


def classify_category(text):
    scores = Counter()
    for category, keywords in CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw in text:
                scores[category] += 1
    if not scores:
        return "기타"
    return scores.most_common(1)[0][0]


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    with open(RAW_JSON_PATH, encoding="utf-8") as f:
        data = json.load(f)

    print(f"원본 전체 건수: {len(data)}")

    in_scope = []
    out_of_scope = []
    for d in data:
        code = d.get("issuer_code_mapped")
        if code in TARGET_ISSUERS:
            in_scope.append(d)
        else:
            out_of_scope.append(d)

    print(f"대상 8개사 매핑 건수: {len(in_scope)}")
    print(f"스코프 밖 제외 건수: {len(out_of_scope)}")

    cards_rows = []
    brand_rows = []
    verification_rows = []
    verification_bucket = {}  # (card_type, category_main) -> count

    skipped_no_name = 0

    for d in in_scope:
        name = d.get("card_name")
        if not name:
            skipped_no_name += 1
            continue

        fulltext = d.get("full_text") or ""
        issuer_code = d["issuer_code_mapped"]
        issuer_id = ISSUER_ID_MAP[issuer_code]

        card_type = classify_card_type(name, fulltext)
        category_main = classify_category(f"{name} {fulltext}")

        row = {
            "source_id": d.get("source_id"),
            "source_url": d.get("source_url"),
            "card_name": name,
            "issuer_id": issuer_id,
            "issuer_code": issuer_code,
            "card_type": card_type,
            "category_main": category_main,
            "annual_fee_domestic": d.get("annual_fee_domestic"),
            "annual_fee_overseas": d.get("annual_fee_overseas"),
        }
        cards_rows.append(row)

        for brand in (d.get("brands") or []):
            brand_rows.append({
                "source_url": d.get("source_url"),
                "brand_name": brand,
            })

        bucket_key = (card_type, category_main)
        bucket_count = verification_bucket.get(bucket_key, 0)
        if bucket_count < 8:
            verification_rows.append({
                "card_type": card_type,
                "category_main": category_main,
                "card_name": name,
                "source_url": d.get("source_url"),
                "raw_text_snippet": fulltext[:200],
            })
            verification_bucket[bucket_key] = bucket_count + 1

    # 1. cards_v1.csv
    cards_path = os.path.join(OUTPUT_DIR, "cards_v1.csv")
    with open(cards_path, "w", newline="", encoding="utf-8-sig") as f:
        fieldnames = ["source_id", "source_url", "card_name", "issuer_id", "issuer_code",
                      "card_type", "category_main", "annual_fee_domestic", "annual_fee_overseas"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(cards_rows)

    # 2. card_brands_v1.csv
    brands_path = os.path.join(OUTPUT_DIR, "card_brands_v1.csv")
    with open(brands_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=["source_url", "brand_name"])
        writer.writeheader()
        writer.writerows(brand_rows)

    # 3. skipped_out_of_scope.csv
    skipped_path = os.path.join(OUTPUT_DIR, "skipped_out_of_scope.csv")
    with open(skipped_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=["source_id", "card_name", "issuer_name_raw", "source_url"])
        writer.writeheader()
        for d in out_of_scope:
            writer.writerow({
                "source_id": d.get("source_id"),
                "card_name": d.get("card_name"),
                "issuer_name_raw": d.get("issuer_name_raw"),
                "source_url": d.get("source_url"),
            })

    # 4. classification_verification_sample.csv
    verification_path = os.path.join(OUTPUT_DIR, "classification_verification_sample.csv")
    with open(verification_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=["card_type", "category_main", "card_name",
                                                "source_url", "raw_text_snippet"])
        writer.writeheader()
        writer.writerows(verification_rows)

    print("\n=== 처리 결과 ===")
    print(f"cards_v1.csv 저장: {len(cards_rows)}행 -> {cards_path}")
    print(f"card_brands_v1.csv 저장: {len(brand_rows)}행 -> {brands_path}")
    print(f"skipped_out_of_scope.csv 저장: {len(out_of_scope)}행 -> {skipped_path}")
    print(f"classification_verification_sample.csv 저장: {len(verification_rows)}행 -> {verification_path}")
    print(f"카드명 누락으로 제외된 건수: {skipped_no_name}")

    type_dist = Counter(r["card_type"] for r in cards_rows)
    cat_dist = Counter(r["category_main"] for r in cards_rows)
    print("\ncard_type 분포:", dict(type_dist))
    print("category_main 분포:", dict(cat_dist))
    print("\n다음 단계: classification_verification_sample.csv를 열어 ��류가 실제로 맞는지 직접 확인해 주세요.")
    print("잘못된 분류가 있다면 CATEGORY_KEYWORDS 딕셔너리를 수정한 뒤 이 스크립트를 다시 실행하면 됩니다.")


if __name__ == "__main__":
    main()
