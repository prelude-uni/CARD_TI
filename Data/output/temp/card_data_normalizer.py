
"""
카드 데이터 정규화 스크립트
목적: 수집된 원본(card_data_raw.json)을 Supabase 스키마(issuers, cards, card_brands,
      usage_conditions, benefit_categories, merchant_groups, benefits)에 맞게 변환
입력: card_data_raw.json (원본 수집 데이터)
출력: schema_output/ 폴더에 테이블별 CSV (Supabase Table Editor Import 용)
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

# 대체 발급사명 -> 정식 발급사명 매핑 (실제 unmapped_issuers 검토 결과 반영해 계속 보강)
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
    "영화","카페","생활","테마파크","주유","통신","쇼핑","기타","모든가맹점","대중교통",
    "프리미엄","편의점","주유소","선택형","대형마트","교통","푸드","온라인쇼핑","해외",
    "카페/디저트","항공마일리지","여행/숙박","정비","프리미엄 서비스","패밀리레스토랑",
    "바우처","해외이용","무이자할부","마트/편의점","금융","백화점","외식","숙박","반려동물",
    "골프","공연","병원","약국","교육","통신비","주차","렌터카","키즈","뷰티","서점","면세점",
}
NOISE_SUBSTR = ["추천", "BEST", "인터뷰", "떠나볼까", "TOP", "vs", "완전히 매혹", "카드타입차트", "결산", "순위"]
GENERIC_MEANINGLESS = {"적립", "할인", "캐시백", "통합할인한도", "없음", "혜택"}

BRAND_KEYWORDS = ["VISA", "Mastercard", "UnionPay", "JCB", "AMEX", "BC"]

PCT_RANGE_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*[~\-]\s*(\d+(?:\.\d+)?)\s*%")
PCT_SINGLE_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*%")
AMOUNT_PATTERN = re.compile(r"([\d,]+)\s*원")
CONDITION_AMOUNT_PATTERN = re.compile(r"([\d,]+)\s*만원\s*이상")
FEE_LINE_PATTERN = re.compile(
    r"(?:국내겸용\s*\[?([\d,]+)\]?원)?\s*/?\s*(?:해외겸용\s*\[?([\d,]+)\]?원)?"
)


# ---------------------------------------------------------------------------
# 1. 발급사 판별 및 카드 타입/발급사 정정
# ---------------------------------------------------------------------------

def normalize_issuer(raw_name, card_name):
    name = raw_name.strip() if raw_name else ""
    name = ISSUER_ALIAS.get(name, name)
    if name in KNOWN_ISSUERS_SET:
        return KNOWN_ISSUERS[name], name

    # raw_name이 무의미(체크카드 등)하면 card_name에서 재추출
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
# 2. 연회비 및 실적조건 파싱 (brands 세그먼트에서 함께 추출)
# ---------------------------------------------------------------------------

def parse_fee_segment(full_text):
    """
    예: '해외겸용 [8,000]원 · 20만원 이상 · VISA · Mastercard'
        '국내겸용 [10,000]원 / 해외겸용 [13,000]원 · 없음 · VISA · Mastercard'
    """
    segs = [s.strip() for s in full_text.split("|")]
    fee_seg = segs[5] if len(segs) > 5 else ""

    domestic = re.search(r"국내겸용\s*\[?([\d,]+)\]?원", fee_seg)
    overseas = re.search(r"해외겸용\s*\[?([\d,]+)\]?원", fee_seg)
    condition = CONDITION_AMOUNT_PATTERN.search(fee_seg)

    fee_domestic = int(domestic.group(1).replace(",", "")) if domestic else None
    fee_overseas = int(overseas.group(1).replace(",", "")) if overseas else None
    min_amount = int(condition.group(1)) * 10000 if condition else 0

    brands_found = [b for b in BRAND_KEYWORDS if b in fee_seg]
    return fee_domestic, fee_overseas, min_amount, brands_found


# ---------------------------------------------------------------------------
# 3. 카테고리-혜택 설명 쌍 추출 (핵심 구조 규칙)
# ---------------------------------------------------------------------------

def is_category_label(s):
    s = s.strip()
    if not s or len(s) > 10:
        return False
    if re.search(r"\d", s):
        return False
    if s in KNOWN_ISSUERS_SET:
        return False
    if any(n in s for n in NOISE_SUBSTR):
        return False
    return True


def extract_category_pairs(full_text):
    segs = [s.strip() for s in full_text.split("|")]
    pairs = []
    i = 6
    n = len(segs)
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
# 4. 혜택 텍스트에서 수치 추출 (rate / fixed_amount)
# ---------------------------------------------------------------------------

def is_noise_text(text):
    if not text or text.strip() in GENERIC_MEANINGLESS:
        return True
    if any(n in text for n in NOISE_SUBSTR):
        return True
    return False


def parse_benefit_value(text):
    """
    반환: (rate, fixed_amount, needs_review)
    - '0.2~2.0%' -> 대표값으로 상한(2.0) 채택, 구간 정보는 raw_text로 보존
    - '60원/L' -> fixed_amount=60 (단위: 원/L)
    - 수치 추출이 애매하면 needs_review=True (Upstage 보완 대상)
    """
    range_match = PCT_RANGE_PATTERN.search(text)
    if range_match:
        return float(range_match.group(2)), None, False

    single_match = PCT_SINGLE_PATTERN.search(text)
    if single_match:
        return float(single_match.group(1)), None, False

    amount_match = AMOUNT_PATTERN.search(text)
    if amount_match:
        return None, int(amount_match.group(1).replace(",", "")), False

    return None, None, True


# ---------------------------------------------------------------------------
# 5. 전체 정규화 파이프라인
# ---------------------------------------------------------------------------

def normalize_all(records):
    cards_rows = []
    brands_rows = []
    benefits_rows = []
    review_rows = []          # Upstage 보완이 필요한 애매한 케이스
    unresolved_issuer_rows = []  # 8개사 매핑 실패 카드

    category_master = OrderedDict()  # category_name -> category_id

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
            unresolved_issuer_rows.append({
                "card_id": card_id, "raw_issuer": raw_issuer,
                "card_name": card_name, "source_url": rec.get("source_url"),
            })
            continue  # 발급사 불명 카드는 스키마에 아직 넣지 않고 별도 검토

        fee_domestic, fee_overseas, min_amount, brands_found = parse_fee_segment(rec.get("full_text", ""))
        if not brands_found:
            brands_found = rec.get("brands", [])

        cards_rows.append({
            "card_id": card_id,
            "issuer_code": issuer_code,
            "card_name": card_name,
            "card_type": card_type,
            "status": "ACTIVE",
            "official_url": rec.get("source_url"),
        })

        if brands_found:
            for b in brands_found:
                brands_rows.append({
                    "card_id": card_id, "brand_name": b,
                    "annual_fee_domestic": fee_domestic,
                    "annual_fee_overseas": fee_overseas,
                })
        else:
            brands_rows.append({
                "card_id": card_id, "brand_name": None,
                "annual_fee_domestic": fee_domestic,
                "annual_fee_overseas": fee_overseas,
            })

        pairs = extract_category_pairs(rec.get("full_text", ""))
        for group_name, desc in pairs:
            if is_noise_text(desc):
                continue
            rate, fixed_amount, needs_review = parse_benefit_value(desc)
            category_id = get_category_id(group_name)

            row = {
                "card_id": card_id,
                "min_amount": min_amount,
                "category_id": category_id,
                "group_name": group_name,
                "rate": rate,
                "fixed_amount": fixed_amount,
                "raw_text": desc,
            }
            if needs_review:
                review_rows.append(row)
            else:
                benefits_rows.append(row)

    return {
        "cards": cards_rows,
        "card_brands": brands_rows,
        "benefits": benefits_rows,
        "needs_ai_review": review_rows,
        "unresolved_issuers": unresolved_issuer_rows,
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

    write_csv(result["benefits"], os.path.join(output_dir, "benefits.csv"),
              ["card_id", "min_amount", "category_id", "group_name", "rate", "fixed_amount", "raw_text"])

    write_csv(result["needs_ai_review"], os.path.join(output_dir, "benefits_needs_ai_review.csv"),
              ["card_id", "min_amount", "category_id", "group_name", "rate", "fixed_amount", "raw_text"])

    write_csv(result["unresolved_issuers"], os.path.join(output_dir, "unresolved_issuer_cards.csv"),
              ["card_id", "raw_issuer", "card_name", "source_url"])

    print(f"cards: {len(result['cards'])}건")
    print(f"card_brands: {len(result['card_brands'])}건")
    print(f"merchant_groups(=benefit categories 후보): {len(result['merchant_groups'])}건")
    print(f"benefits(정규식으로 확정 처리): {len(result['benefits'])}건")
    print(f"benefits_needs_ai_review(Upstage 보완 필요): {len(result['needs_ai_review'])}건")
    print(f"unresolved_issuer_cards(발급사 미확정, 스키마 추가 검토): {len(result['unresolved_issuers'])}건")


if __name__ == "__main__":
    with open(INPUT_PATH, encoding="utf-8") as f:
        records = json.load(f)
    result = normalize_all(records)
    export_all(result)
