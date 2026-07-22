"""
benefits_review_refiner.py
schema_output/benefits_needs_ai_review.csv (1,216건)을 대상으로
1단계: 한글 혼합 숫자표기(2천원, 6천원 등) 정규식 보강 -> 확정 benefits로 승격
2단계: 키워드 기반 유형 분류 (수치 없이 benefit_type만 확정) -> benefits_semi_structured로 분리
3단계: 그래도 분류 불가한 순수 서술형만 -> benefits_needs_ai_review_v2.csv (AI/Upstage 처리 대상)

기존 파일(cards_corrected.csv, card_brands.csv, benefits.csv, merchant_groups.csv 등)은
전혀 읽거나 덮어쓰지 않는다. 입력은 benefits_needs_ai_review.csv 하나뿐이며,
출력은 아래 3개 신규 파일뿐이다.

입력 경로: schema_output/benefits_needs_ai_review.csv
출력 경로:
  schema_output/benefits_recovered.csv        (1단계 결과, benefits.csv에 UNION 하여 적재)
  schema_output/benefits_semi_structured.csv  (2단계 결과, 별도 신규 테이블 benefits_semi_structured 로 적재)
  schema_output/benefits_needs_ai_review_v2.csv (3단계, AI 검토 최종 대상)
"""
import re, csv, os

INPUT_PATH = "schema_output/benefits_needs_ai_review.csv"
OUTPUT_DIR = "schema_output"

FIELDNAMES_BASE = ["card_id", "min_amount", "min_amount_source", "category_id",
                    "group_name", "benefit_type", "rate", "fixed_amount", "unit_basis", "raw_text"]

MANWON_PATTERN = re.compile(r"([\d,]+)\s*만\s*원")
WON_PATTERN = re.compile(r"([\d,]{3,})\s*원")
PCT_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*%")

KEYWORD_RULES = [
    ("PREMIUM_SERVICE", re.compile(r"라운지|발렛|컨시어지|프리미엄\s*투어|플래티넘|Platinum|VIP")),
    ("INSTALLMENT_SERVICE", re.compile(r"무이자|할부")),
    ("VOUCHER_GIFT", re.compile(r"바우처|쿠폰|기프트|상품권|증정")),
    ("MILEAGE_UNSPECIFIED", re.compile(r"마일리지|마일\b")),
    ("POINT_UNSPECIFIED", re.compile(r"포인트|리워드|적립")),
    ("MEMBERSHIP_BENEFIT", re.compile(r"멤버십|제휴|우대\s*서비스")),
    ("DISCOUNT_SERVICE_GENERIC", re.compile(r"환급|면제|할인\s*서비스")),
]


def recover_amount_or_rate(text):
    """1단계: 한글 혼합 숫자표기를 정규식으로 회복. (type, rate, fixed_amount) 반환, 없으면 (None, None, None)."""
    m = MANWON_PATTERN.search(text)
    if m:
        amount = int(m.group(1).replace(",", "")) * 10000
        return "FIXED_AMOUNT", None, amount
    m = WON_PATTERN.search(text)
    if m:
        amount = int(m.group(1).replace(",", ""))
        return "FIXED_AMOUNT", None, amount
    m = PCT_PATTERN.search(text)
    if m:
        return "RATE_DISCOUNT", float(m.group(1)), None
    return None, None, None


def keyword_classify(text):
    """2단계: 수치 없이 유형만 분류. 매칭되는 benefit_type 문자열, 없으면 None."""
    for benefit_type, pattern in KEYWORD_RULES:
        if pattern.search(text):
            return benefit_type
    return None


def refine(input_path=INPUT_PATH):
    with open(input_path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    recovered_rows, semi_rows, still_review_rows = [], [], []

    for row in rows:
        text = row["raw_text"] or ""

        btype, rate, fixed_amount = recover_amount_or_rate(text)
        if btype is not None:
            new_row = dict(row)
            new_row["benefit_type"] = btype
            new_row["rate"] = rate
            new_row["fixed_amount"] = fixed_amount
            recovered_rows.append(new_row)
            continue

        kw_type = keyword_classify(text)
        if kw_type is not None:
            new_row = dict(row)
            new_row["benefit_type"] = kw_type
            semi_rows.append(new_row)
            continue

        still_review_rows.append(row)

    return recovered_rows, semi_rows, still_review_rows


def write_csv(rows, path, fieldnames):
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in rows:
            writer.writerow(r)


def export(recovered_rows, semi_rows, still_review_rows, output_dir=OUTPUT_DIR):
    os.makedirs(output_dir, exist_ok=True)
    write_csv(recovered_rows, os.path.join(output_dir, "benefits_recovered.csv"), FIELDNAMES_BASE)
    write_csv(semi_rows, os.path.join(output_dir, "benefits_semi_structured.csv"), FIELDNAMES_BASE)
    write_csv(still_review_rows, os.path.join(output_dir, "benefits_needs_ai_review_v2.csv"), FIELDNAMES_BASE)

    print(f"입력 총 건수: {len(recovered_rows) + len(semi_rows) + len(still_review_rows)}건")
    print(f"1단계 회복 (benefits_recovered.csv): {len(recovered_rows)}건")
    print(f"2단계 키워드 분류 (benefits_semi_structured.csv): {len(semi_rows)}건")
    print(f"3단계 AI 검토 최종 대상 (benefits_needs_ai_review_v2.csv): {len(still_review_rows)}건")


if __name__ == "__main__":
    recovered, semi, still_review = refine()
    export(recovered, semi, still_review)
