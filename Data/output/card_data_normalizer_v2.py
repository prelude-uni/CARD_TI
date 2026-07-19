
"""
카드 데이터 정규화 스크립트 (v2)
- 표준 라이브러리만 사용 (pip install 불필요)
- 발급사 재판별 -> 8개사 확정 카드만 cards.csv에 포함, 그 외는 unresolved로 분리
- 연회비 + 카드 전체 실적조건 + 브랜드 동시 추출
- 카테고리 화이트리스트 기반 merchant_groups 매핑 (오탐 방지)
- 혜택 텍스트 다단계 파싱:
    1) 퍼센트/원 단위 수치 추출
    2) 혜택별 개별 실적조건 "(전월실적 30만원 이상)" 인라인 추출 -> 카드 전체 조건과 다를 수 있음
    3) 마일리지/포인트 단위 적립("1천원당 1마일리지") 별도 규칙 처리
    4) 무이자할부/바우처/무료서비스 별도 유형(benefit_type) 태깅
    5) 그래도 수치화 불가능한 서술형만 AI 검토 대상으로 최종 분리
"""

import json, re, os, csv
from collections import OrderedDict

INPUT_PATH = "card_data_raw.json"
OUTPUT_DIR = "schema_output"

KNOWN_ISSUERS = {
    "신한카드": "SHINHAN", "KB국민카드": "KB", "삼성카드": "SAMSUNG",
    "현대카드": "HYUNDAI", "롯데카드": "LOTTE", "우리카드": "WOORI",
    "하나카드": "HANA", "BC카드": "BC",
}
KNOWN_ISSUERS_SET = set(KNOWN_ISSUERS.keys())

ISSUER_ALIAS = {
    "국민카드": "KB국민카드",
    "신한": "신한카드",
    "우리": "우리카드",
}

CARD_TYPE_KEYWORDS = {
    "체크카드": "CHECK",
    "체크": "CHECK",
    "신용카드": "CREDIT",
}

VALID_CATEGORY_WHITELIST = {
    "영화", "카페", "생활", "테마파크", "주유", "통신", "쇼핑", "기타", "모든가맹점", "대중교통",
    "프리미엄", "편의점", "주유소", "선택형", "대형마트", "교통", "푸드", "온라인쇼핑", "해외",
    "카페/디저트", "항공마일리지", "여행/숙박", "정비", "프리미엄 서비스", "패밀리레스토랑",
    "바우처", "해외이용", "무이자할부", "마트/편의점", "금융", "백화점", "외식", "숙박", "반려동물",
    "골프", "공연", "병원", "약국", "교육", "통신비", "주차", "렌터카", "키즈", "뷰티", "서점", "면세점",
}

NOISE_SUBSTR = ["추천", "BEST", "인터뷰", "떠나볼까", "TOP", "vs", "완전히 매혹", "카드타입차트", "결산", "순위"]
GENERIC_MEANINGLESS = {"적립", "할인", "캐시백", "통합할인한도", "없음", "혜택"}
BRAND_KEYWORDS = ["VISA", "Mastercard", "UnionPay", "JCB", "AMEX", "BC"]

PCT_RANGE_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*[~\-]\s*(\d+(?:\.\d+)?)\s*%")
PCT_SINGLE_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*%")
AMOUNT_PATTERN = re.compile(r"([\d,]+)\s*원(?!당)")
CONDITION_AMOUNT_PATTERN = re.compile(r"([\d,]+)\s*만원\s*이상")
INLINE_CONDITION_PATTERN = re.compile(r"전월\s*(?:실적\s*)?([\d,]+)\s*만원\s*이상")
MILEAGE_PER_UNIT_PATTERN = re.compile(r"([\d,]+)\s*원\s*당\s*(\d+(?:\.\d+)?)\s*(?:~\s*\d+(?:\.\d+)?\s*)?마일리지")
MILEAGE_SINGLE_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*마일리지")
POINT_PER_UNIT_PATTERN = re.compile(r"([\d,]+)\s*원\s*당\s*(\d+(?:\.\d+)?)\s*(?:P\b|포인트|보너스포인트)")
INSTALLMENT_PATTERN = re.compile(r"(\d+)\s*(?:~\s*(\d+)\s*)?개월\s*무이자")
VOUCHER_PATTERN = re.compile(r"([\d,]+)\s*(만원|원)\s*(?:상당\s*)?(?:권|바우처)")
FREE_SERVICE_PATTERN = re.compile(r"(무료|면제)")


# ---------------------------------------------------------------------------
# 1. 발급사 판별 및 카드 타입 정정
# ---------------------------------------------------------------------------

def normalize_issuer(raw_name, card_name):
    name = (raw_name or "").strip()
    name = ISSUER_ALIAS.get(name, name)
    if name in KNOWN_ISSUERS_SET:
        return KNOWN_ISSUERS[name], name
    for issuer_kor, code in KNOWN_ISSUERS.items():
        if issuer_kor in card_name:
            return code, issuer_kor
    return None, name


def detect_card_type(raw_name, card_name, default="CREDIT"):
    combined = f"{raw_name} {card_name}"
    for kw, ctype in CARD_TYPE_KEYWORDS.items():
        if kw in combined:
            return ctype
    return default


# ---------------------------------------------------------------------------
# 2. 연회비 + 카드 전체 실적조건 + 브랜드
# ---------------------------------------------------------------------------

def parse_fee_segment(full_text):
    segs = [s.strip() for s in full_text.split("|")]
    fee_seg = segs[5] if len(segs) > 5 else ""

    domestic = re.search(r"국내겸용\s*\[?([\d,]+)\]?원", fee_seg)
    overseas = re.search(r"해외겸용\s*\[?([\d,]+)\]?원", fee_seg)
    condition = CONDITION_AMOUNT_PATTERN.search(fee_seg)

    fee_domestic = int(domestic.group(1).replace(",", "")) if domestic else None
    fee_overseas = int(overseas.group(1).replace(",", "")) if overseas else None
    card_level_min_amount = int(condition.group(1)) * 10000 if condition else 0

    brands_found = [b for b in BRAND_KEYWORDS if b in fee_seg]
    return fee_domestic, fee_overseas, card_level_min_amount, brands_found


# ---------------------------------------------------------------------------
# 3. 카테고리-혜택 설명 쌍 추출
# ---------------------------------------------------------------------------

def is_category_label(s):
    return s.strip() in VALID_CATEGORY_WHITELIST


def extract_category_pairs(full_text):
    segs = [s.strip() for s in full_text.split("|")]
    pairs = []
    i, n = 6, len(segs)
    while i < n - 1:
        label, desc = segs[i], segs[i + 1]
        if is_category_label(label) and desc and not is_category_label(desc):
            if any(x in desc for x in NOISE_SUBSTR):
                i += 1
                continue
            pairs.append((label, desc))
            i += 2
        else:
            i += 1
    return pairs


# ---------------------------------------------------------------------------
# 4. 혜택 텍스트 다단계 파싱
# ---------------------------------------------------------------------------

def is_noise_text(text):
    if not text or text.strip() in GENERIC_MEANINGLESS:
        return True
    if any(n in text for n in NOISE_SUBSTR):
        return True
    return False


def extract_inline_condition(text):
    """혜택 문장 안에 개별적으로 박힌 실적조건. 카드 레벨 조건보다 우선 적용."""
    m = INLINE_CONDITION_PATTERN.search(text)
    return int(m.group(1)) * 10000 if m else None


def parse_benefit_value(text):
    """
    반환: dict(benefit_type, rate, fixed_amount, unit_basis, needs_review)
    단계적으로 아래 패턴을 순서대로 시도한다.
    """
    # 1) 원당 마일리지 (예: '1천원당 1마일리지')
    m = MILEAGE_PER_UNIT_PATTERN.search(text)
    if m:
        return {"benefit_type": "MILEAGE", "rate": float(m.group(2)),
                "fixed_amount": None, "unit_basis": int(m.group(1).replace(",", "")), "needs_review": False}

    # 2) 원당 포인트 (예: '리터당 40 보너스포인트')
    m = POINT_PER_UNIT_PATTERN.search(text)
    if m:
        return {"benefit_type": "POINT_PER_UNIT", "rate": float(m.group(2)),
                "fixed_amount": None, "unit_basis": int(m.group(1).replace(",", "")), "needs_review": False}

    # 3) 단독 마일리지 표현 (원당 기준 불명확하지만 수치는 있음)
    m = MILEAGE_SINGLE_PATTERN.search(text)
    if m:
        return {"benefit_type": "MILEAGE", "rate": float(m.group(1)),
                "fixed_amount": None, "unit_basis": None, "needs_review": False}

    # 4) 무이자할부
    m = INSTALLMENT_PATTERN.search(text)
    if m:
        max_month = m.group(2) or m.group(1)
        return {"benefit_type": "INSTALLMENT_FREE", "rate": None,
                "fixed_amount": int(max_month), "unit_basis": None, "needs_review": False}

    # 5) 바우처/상품권
    m = VOUCHER_PATTERN.search(text)
    if m:
        amt = int(m.group(1).replace(",", ""))
        if m.group(2) == "만원":
            amt *= 10000
        return {"benefit_type": "VOUCHER", "rate": None,
                "fixed_amount": amt, "unit_basis": None, "needs_review": False}

    # 6) 퍼센트 구간/단일
    m = PCT_RANGE_PATTERN.search(text)
    if m:
        return {"benefit_type": "RATE_DISCOUNT", "rate": float(m.group(2)),
                "fixed_amount": None, "unit_basis": None, "needs_review": False}
    m = PCT_SINGLE_PATTERN.search(text)
    if m:
        return {"benefit_type": "RATE_DISCOUNT", "rate": float(m.group(1)),
                "fixed_amount": None, "unit_basis": None, "needs_review": False}

    # 7) 정액(원)
    m = AMOUNT_PATTERN.search(text)
    if m:
        return {"benefit_type": "FIXED_AMOUNT", "rate": None,
                "fixed_amount": int(m.group(1).replace(",", "")), "unit_basis": None, "needs_review": False}

    # 8) 무료/면제 서비스 (수치 없음, 하지만 명확한 유형)
    if FREE_SERVICE_PATTERN.search(text):
        return {"benefit_type": "FREE_SERVICE", "rate": None,
                "fixed_amount": None, "unit_basis": None, "needs_review": False}

    # 9) 그 외 서술형 -> AI 검토
    return {"benefit_type": "UNCLASSIFIED", "rate": None,
            "fixed_amount": None, "unit_basis": None, "needs_review": True}


# ---------------------------------------------------------------------------
# 5. 전체 정규화 파이프라인
# ---------------------------------------------------------------------------

def normalize_all(records):
    cards_rows, brands_rows, benefits_rows, review_rows, unresolved_rows = [], [], [], [], []
    category_master = OrderedDict()

    def get_category_id(name):
        if name not in category_master:
            category_master[name] = len(category_master) + 1
        return category_master[name]

    for rec in records:
        card_id = rec["source_id"]
        card_name = rec.get("card_name") or ""
        raw_issuer = rec.get("issuer_name_raw") or ""

        issuer_code, issuer_kor = normalize_issuer(raw_issuer, card_name)
        card_type = detect_card_type(raw_issuer, card_name)

        if issuer_code is None:
            unresolved_rows.append({
                "card_id": card_id, "raw_issuer": raw_issuer,
                "card_name": card_name, "source_url": rec.get("source_url"),
            })
            continue  # 요청에 따라 8개사 외 발급사는 스키마에서 완전히 제외

        fee_domestic, fee_overseas, card_level_min_amount, brands_found = parse_fee_segment(rec.get("full_text", ""))
        if not brands_found:
            brands_found = rec.get("brands", [])

        cards_rows.append({
            "card_id": card_id, "issuer_code": issuer_code, "card_name": card_name,
            "card_type": card_type, "status": "ACTIVE", "official_url": rec.get("source_url"),
        })

        if brands_found:
            for b in brands_found:
                brands_rows.append({
                    "card_id": card_id, "brand_name": b,
                    "annual_fee_domestic": fee_domestic, "annual_fee_overseas": fee_overseas,
                })
        else:
            brands_rows.append({
                "card_id": card_id, "brand_name": None,
                "annual_fee_domestic": fee_domestic, "annual_fee_overseas": fee_overseas,
            })

        for group_name, desc in extract_category_pairs(rec.get("full_text", "")):
            if is_noise_text(desc):
                continue

            inline_min = extract_inline_condition(desc)
            effective_min_amount = inline_min if inline_min is not None else card_level_min_amount

            parsed = parse_benefit_value(desc)
            category_id = get_category_id(group_name)

            row = {
                "card_id": card_id,
                "min_amount": effective_min_amount,
                "min_amount_source": "INLINE" if inline_min is not None else "CARD_LEVEL",
                "category_id": category_id,
                "group_name": group_name,
                "benefit_type": parsed["benefit_type"],
                "rate": parsed["rate"],
                "fixed_amount": parsed["fixed_amount"],
                "unit_basis": parsed["unit_basis"],
                "raw_text": desc,
            }
            if parsed["needs_review"]:
                review_rows.append(row)
            else:
                benefits_rows.append(row)

    return {
        "cards": cards_rows,
        "card_brands": brands_rows,
        "benefits": benefits_rows,
        "needs_ai_review": review_rows,
        "unresolved_issuers": unresolved_rows,
        "merchant_groups": [{"group_id": v, "group_name": k} for k, v in category_master.items()],
    }


# ---------------------------------------------------------------------------
# 6. CSV 저장
# ---------------------------------------------------------------------------

def write_csv(rows, path, fieldnames):
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in rows:
            writer.writerow(r)


def export_all(result, output_dir=OUTPUT_DIR):
    os.makedirs(output_dir, exist_ok=True)

    write_csv(result["cards"], os.path.join(output_dir, "cards.csv"),
              ["card_id", "issuer_code", "card_name", "card_type", "status", "official_url"])

    write_csv(result["card_brands"], os.path.join(output_dir, "card_brands.csv"),
              ["card_id", "brand_name", "annual_fee_domestic", "annual_fee_overseas"])

    write_csv(result["merchant_groups"], os.path.join(output_dir, "merchant_groups.csv"),
              ["group_id", "group_name"])

    benefit_fields = ["card_id", "min_amount", "min_amount_source", "category_id", "group_name",
                       "benefit_type", "rate", "fixed_amount", "unit_basis", "raw_text"]
    write_csv(result["benefits"], os.path.join(output_dir, "benefits.csv"), benefit_fields)
    write_csv(result["needs_ai_review"], os.path.join(output_dir, "benefits_needs_ai_review.csv"), benefit_fields)

    write_csv(result["unresolved_issuers"], os.path.join(output_dir, "unresolved_issuer_cards.csv"),
              ["card_id", "raw_issuer", "card_name", "source_url"])

    print(f"cards: {len(result['cards'])}건")
    print(f"card_brands: {len(result['card_brands'])}건")
    print(f"merchant_groups: {len(result['merchant_groups'])}건")
    print(f"benefits(확정 처리): {len(result['benefits'])}건")
    print(f"benefits_needs_ai_review(AI 검토 필요, 최종): {len(result['needs_ai_review'])}건")
    print(f"unresolved_issuer_cards(8개사 외, 제외됨): {len(result['unresolved_issuers'])}건")


if __name__ == "__main__":
    with open(INPUT_PATH, encoding="utf-8") as f:
        records = json.load(f)
    result = normalize_all(records)
    export_all(result)
