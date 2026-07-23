"""
refine_benefits_v1.py

목적:
  card_data_raw.json 의 full_text 필드를 파싱하여 usage_conditions(전월실적 구간)와
  benefits(개별 혜택) 테이블용 CSV를 산출한다. 카드 1건당 혜택은 여러 행으로 분해된다.
  이 스크립트도 SQL을 직접 실행하지 않고 CSV로만 산출한다. 검증 후 별도 업로드 스크립트로
  Supabase에 적재한다.

대상: refine_cards_v1.py 와 동일하게 8개 카드사(SHINHAN/KB/SAMSUNG/HYUNDAI/LOTTE/WOORI/
      HANA/BC)에 매핑된 1,247건.

[v2 수정사항 - "1000원당 1마일리지" 유형 처리 오류 수정]
  기존(v1) 문제: "1000원당 1 마일리지 추가 적립" 같은 텍스트에서 WON_RE 정규식이
  기준금액(1000)을 fixed_amount(정액 지급액)로 잘못 저장했다. 이는 의미상 오류다.
  "1000원당 1마일리지"는 정액 지급이 아니라 "결제금액 1000원마다 1마일리지 적립"이라는
  뜻으로, 사실상 적립률 0.1%(= 1 ÷ 1000 × 100)와 동일한 개념이다.

  v2 최초 수정 후에도 다음 두 가지 잔여 오류가 재검증 과정에서 추가로 발견되어 함께 수정했다.
  (1) "N원당 M원" 형태 (예: "CU 1,500원당 200원 결제일할인")도 동일한 유형의 오류였다.
      이 역시 정액 지급이 아니라 "1,500원 결제마다 200원 할인" = 13.33% 적립/할인률과
      동일한 의미이므로 같은 방식으로 rate(%)로 환산한다.
  (2) "N원당" 구조는 있지만 마일리지/포인트 수치를 정규식이 못 찾아 rate 환산에
      실패하는 경우(예: "이용금액 1,000원당 대한항공 마일리지 적립"), 예전 로직은
      이 실패를 틈타 기준금액(1,000)을 다시 fixed_amount로 잘못 채워 넣었다.
      이를 막기 위해 has_per_basis_structure() 함수로 "N원당" 구조 존재 여부를
      먼저 판별하고, 이 구조가 있으면 rate 환산 성패와 무관하게 fixed_amount는
      절대 채우지 않도록 로직을 분리했다. (rate도 없고 fixed_amount도 없으면
      raw_text만 보존되며, 이는 정보 손실이 아니라 "정액이 아님"을 정확히 반영한 것이다)

  이 모든 수정은 DB 스키마(benefits 테이블)를 변경하지 않는다. 스키마에는
  rate(적립률/할인율, %)와 fixed_amount(정액, 원) 두 컬럼만 존재하며, "N원당 M" 구조를
  담을 전용 컬럼이 없으므로 이미 존재하는 rate(%) 컬럼의 의미 범위 안에서 동등한 값으로
  환산하여 저장한다. raw_text는 항상 원문 그대로 보존하므로 원본 데이터 손실이 없다.

파싱 구조 설명 (핵심):
  full_text 는 '|' 로 구분된 문자열이다.
  parts[5] 에는 다음 형식의 전월실적/연회비/브랜드 정보가 들어있다.
    예) '해외겸용 [8,000]원 · 30만원 이상 · VISA · Mastercard'
  이 중 두 번째 · 구분 항목이 전월실적 최소금액이다 ('30만원 이상', '없음' 등).
  parts[6] 부터는 (혜택분류라벨, 혜택설명텍스트) 쌍이 반복되며,
  라벨에 '카드'가 포함되면 관련상품/추천기사 섹션이 시작된 것으로 보고 파싱을 중단한다.

산출 파일 (output/refined_v1/ 폴더):
  1. usage_conditions_v1.csv
     - condition_id, source_url, condition_order, min_amount, max_amount, period_type
     - 이번 버전은 카드당 1개 구간만 추출한다 (전체 실적 구간을 대표하는 최소금액 1건).
       실제로는 카드 한 장에 여러 실적 구간이 있는 경우가 있으나, 원본 full_text 구조상
       구간별 혜택 매핑이 명확히 분리되어 있지 않아 이번 버전에서는 대표 구간 1건만
       우선 반영한다. (알려진 한계, 아래 참고)
  2. benefits_v1.csv
     - source_url(참조용), condition_id, category_name, group_name, rate, fixed_amount, raw_text
     - category_name은 raw_text 키워드 매칭으로 할인/적립/캐시백/마일리지/바우처/
       무료서비스/무이자할부/기타 8종으로 분류한다.
     - rate(적립률/할인율 %)는 다음 순서로 추출을 시도한다.
         (1) "N원당 M마일리지/포인트/마일/점/캐시/원/%/MR/P" 패턴 -> rate = M/N*100 로 환산
         (2) 텍스트 내 명시적 "%" 표기 -> 그 값을 그대로 사용
     - fixed_amount(정액, 원)는 "N원당" 구조가 전혀 없을 때만, "N원" 표기에서 추출한다.
       "N원당" 구조가 있으면 rate 환산 성패와 무관하게 fixed_amount는 채우지 않는다.
     - rate/fixed_amount 모두 없으면 무료서비스/바우처, 또는 수치 추출 실패 케이스다.
  3. benefits_verification_sample.csv
     - category_name별 최대 10건씩 원문(raw_text)과 함께 추출한 검증용 샘플.

알려진 한계 (투명하게 명시):
  - min_amount는 카드당 1개 대표값만 추출했다. 실적구간별로 혜택이 다르게 걸리는 카드는
    이번 버전에서 구간을 세분화하지 못했다.
  - category_name '기타'(약 890건, 16%)는 raw_text에 할인/적립/캐시백 등 명확한 키워드가
    없는 경우이다. 검증 시 이 항목을 우선 확인 권장.
  - "N원당" 구조가 있지만 마일리지/포인트 수치까지 정규식이 못 찾는 극히 일부 케이스는
    rate/fixed_amount 둘 다 공란으로 남는다 (예: 수치 없이 "마일리지 적립"만 언급된 경우).
    이 경우도 raw_text는 항상 보존되므로 수동 검토로 보완 가능하다.

실행 방법:
  python refine_benefits_v1.py
  (이 스크립트는 card_data_raw.json 위치를 자동으로 탐색하므로,
   Data 폴더 / output 폴더 등 어디서 실행해도 동작한다)
"""
import json
import os
import csv
import re
from collections import Counter


def _find_raw_json():
    """
    실행 위치(cwd)에 상관없이 card_data_raw.json을 찾는다.
    우선순위:
      1. 이 스크립트와 같은 폴더 (output/card_data_raw.json)
      2. 이 스크립트의 상위 폴더 (Data/card_data_raw.json)
      3. 현재 작업 디렉터리 (cwd/card_data_raw.json)
      4. 현재 작업 디렉터리의 output 폴더 (cwd/output/card_data_raw.json)
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(script_dir, "card_data_raw.json"),
        os.path.join(os.path.dirname(script_dir), "card_data_raw.json"),
        os.path.join(os.getcwd(), "card_data_raw.json"),
        os.path.join(os.getcwd(), "output", "card_data_raw.json"),
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    tried = "\n".join(f"  - {p}" for p in candidates)
    raise FileNotFoundError(
        "card_data_raw.json 파일을 찾을 수 없습니다. 다음 경로들을 확인했습니다:\n" + tried +
        "\n\ncard_data_raw.json을 이 스크립트와 같은 폴더에 두거나, "
        "Data 폴더 바로 아래에 두고 다시 실행해 주세요."
    )


def _resolve_output_dir():
    """
    산출 CSV를 저장할 폴더도 스크립트 위치 기준으로 고정한다.
    (cwd가 어디든 항상 이 스크립트 옆에 refined_v1 폴더가 생성된다.)
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(script_dir, "refined_v1")


RAW_JSON_PATH = _find_raw_json()
OUTPUT_DIR = _resolve_output_dir()

TARGET_ISSUERS = ["SHINHAN", "KB", "SAMSUNG", "HYUNDAI", "LOTTE", "WOORI", "HANA", "BC"]

CATEGORY_RULES = [
    ("무이자할부", ["무이자"]),
    ("바우처", ["바우처", "Voucher", "기프트"]),
    ("마일리지", ["마일리지", "마일", "MILEAGE", "스카이패스", "SKYPASS"]),
    ("캐시백", ["캐시백"]),
    ("무료서비스", ["무료", "증정", "라운지", "서비스 제공"]),
    ("적립", ["적립", "포인트"]),
    ("할인", ["할인", "%", "DC"]),
]

PCT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*%")
WON_RE = re.compile(r"([\d,]+)\s*원")

# "N원당 M마일리지/포인트/마일/점/캐시/원/%/MR/P" 패턴 감지용
# (예: "1000원당 1마일리지", "1,500원당 200원 할인", "1,000원당 15~30투어마일리지",
#      "1,000원당 최대 2 멤버십 리워즈(MR)" 모두 여기서 rate(%)로 환산됨)
PER_BASIS_BASE_RE = re.compile(r"([\d,]+)\s*(천|만)?\s*원\s*당")
PER_BASIS_VALUE_RE = re.compile(r"(?:[,\s]*최대\s*)?(\d[\d,]*(?:\.\d+)?)(?:\s*~\s*[\d,]+(?:\.\d+)?)?")
PER_BASIS_UNIT_KEYWORDS = re.compile(r"(마일리지|마일|포인트|점|캐시|원|%|MR|P\b)")
PER_BASIS_UNIT_WINDOW = 25  # 값(M) 뒤 몇 글자 안에서 단위 키워드를 찾을지


def extract_condition_str(full_text):
    parts = full_text.split("|")
    return parts[5] if len(parts) > 5 else None


def parse_min_amount(cond_str):
    if not cond_str:
        return None
    segs = [s.strip() for s in cond_str.split("·")]
    if len(segs) < 2:
        return None
    amt_seg = segs[1]
    if amt_seg == "없음":
        return 0
    m = re.search(r"([\d,]+)\s*만원\s*이상", amt_seg)
    if m:
        return int(m.group(1).replace(",", "")) * 10000
    m2 = re.search(r"([\d,]+)\s*원\s*이상", amt_seg)
    if m2:
        return int(m2.group(1).replace(",", ""))
    return None


def extract_pairs(full_text):
    parts = full_text.split("|")
    if len(parts) < 7:
        return []
    pairs = []
    i = 6
    while i + 1 < len(parts):
        label = parts[i].strip()
        text = parts[i + 1].strip()
        if not label or not text or "카드" in label:
            break
        pairs.append((label, text))
        i += 2
    return pairs


def classify_category(text):
    for cat, kws in CATEGORY_RULES:
        if any(kw in text for kw in kws):
            return cat
    return "기타"


def has_per_basis_structure(text):
    """
    텍스트에 "N원당" 구조가 있는지만 판별한다 (값/단위 추출 성공 여부와 무관).
    이 구조가 있으면 그 뒤에 오는 숫자는 "기준금액"이므로,
    설령 rate 환산에 실패해도 그 기준금액을 fixed_amount(정액 지급액)로 오인해서는
    안 된다. (예: "이용금액 1,000원당 대한항공 마일리지 적립" -> 마일리지 수치가
    텍스트에 없어 rate 환산은 불가하지만, 1,000은 여전히 기준금액일 뿐 정액 지급액이 아님)
    """
    return PER_BASIS_BASE_RE.search(text) is not None


def parse_per_basis_rate(text):
    """
    "N원당 M마일리지/포인트/마일/점/캐시/원/%/MR/P" 패턴을 찾아 rate(%)로 환산한다.
    매칭되지 않으면 None을 반환한다.
    예) "1000원당 1 마일리지 추가 적립" -> 0.1 (= 1/1000*100)
        "1천원당 SKYPASS 1마일리지 적립" -> 0.1 (기준금액과 단위 사이에 다른 텍스트가
        끼어 있어도 매칭되도록 순차적으로 탐색한다)
        "CU 1,500원당 200원 결제일할인" -> 13.3333 (= 200/1500*100)
        "1만원당 1,500원 청구 할인" -> 15.0 (= 1500/10000*100)
        "1,000원당 15~30투어마일리지 적립" -> 1.5 (범위 표기는 첫 번째 숫자를 사용)
        "1,000원당 최대 2 멤버십 리워즈(MR) 적립" -> 0.2 ("최대" 수식어 허용)
        "N원당 M%" 형태는 M이 이미 비율이므로 기준금액 나눗셈 없이 그대로 사용한다.
    """
    base_m = PER_BASIS_BASE_RE.search(text)
    if not base_m:
        return None
    num_str, unit = base_m.groups()
    base = int(num_str.replace(",", ""))
    if unit == "천":
        base *= 1000
    elif unit == "만":
        base *= 10000
    if base == 0:
        return None
    rest = text[base_m.end():]
    val_m = PER_BASIS_VALUE_RE.search(rest)
    if not val_m:
        return None
    val = float(val_m.group(1).replace(",", ""))
    window = rest[val_m.end(): val_m.end() + PER_BASIS_UNIT_WINDOW]
    unit_kw_m = PER_BASIS_UNIT_KEYWORDS.search(window)
    if not unit_kw_m:
        return None
    unit_kw = unit_kw_m.group(1)
    if unit_kw == "%":
        return round(val, 4)
    return round((val / base) * 100, 4)


def extract_rate(text):
    """
    rate(%) 추출 우선순위:
      1) "N원당 M마일리지/포인트/..." 패턴 -> 환산값
      2) 텍스트 내 명시적 "%" 표기 -> 그 값
    둘 다 없으면 None.
    """
    per_basis_rate = parse_per_basis_rate(text)
    if per_basis_rate is not None:
        return per_basis_rate
    m = PCT_RE.search(text)
    if m:
        return float(m.group(1))
    return None


def extract_fixed_amount(text):
    """
    fixed_amount(정액, 원) 추출.
    "N원당 ..." 구조가 있는 텍스트는 그 뒤 숫자가 "기준금액"이지 정액 지급액이
    아니므로, has_per_basis_structure()가 True이면 여기서 절대 값을 추출하지 않고
    None을 반환한다 (rate 환산 실패 여부와 무관하게 이 규칙을 우선 적용).
    """
    if has_per_basis_structure(text):
        return None
    m = WON_RE.search(text)
    if m:
        try:
            return int(m.group(1).replace(",", ""))
        except ValueError:
            return None
    return None


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    with open(RAW_JSON_PATH, encoding="utf-8") as f:
        data = json.load(f)

    in_scope = [d for d in data if d.get("issuer_code_mapped") in TARGET_ISSUERS and d.get("card_name")]
    print(f"대상 카드 수: {len(in_scope)}")

    usage_rows = []
    benefit_rows = []
    condition_id_counter = 0
    no_pairs_count = 0
    per_basis_converted_count = 0

    for card in in_scope:
        source_url = card["source_url"]
        full_text = card.get("full_text", "")
        cond_str = extract_condition_str(full_text)
        min_amt = parse_min_amount(cond_str)
        if min_amt is None:
            min_amt = 0

        condition_id_counter += 1
        cond_id = condition_id_counter
        usage_rows.append({
            "condition_id": cond_id,
            "source_url": source_url,
            "condition_order": 1,
            "min_amount": min_amt,
            "max_amount": "",
            "period_type": "MONTHLY",
        })

        pairs = extract_pairs(full_text)
        if not pairs:
            no_pairs_count += 1

        for label, text in pairs:
            category = classify_category(text)
            rate = extract_rate(text)
            if has_per_basis_structure(text):
                per_basis_converted_count += 1
                fixed_amount = None
            else:
                fixed_amount = extract_fixed_amount(text) if rate is None else None
            benefit_rows.append({
                "source_url": source_url,
                "condition_id": cond_id,
                "category_name": category,
                "group_name": label,
                "rate": rate if rate is not None else "",
                "fixed_amount": fixed_amount if fixed_amount is not None else "",
                "raw_text": text,
            })

    usage_path = os.path.join(OUTPUT_DIR, "usage_conditions_v1.csv")
    with open(usage_path, "w", newline="", encoding="utf-8-sig") as f:
        fieldnames = ["condition_id", "source_url", "condition_order", "min_amount", "max_amount", "period_type"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(usage_rows)

    benefits_path = os.path.join(OUTPUT_DIR, "benefits_v1.csv")
    with open(benefits_path, "w", newline="", encoding="utf-8-sig") as f:
        fieldnames = ["source_url", "condition_id", "category_name", "group_name", "rate", "fixed_amount", "raw_text"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(benefit_rows)

    verification_bucket = {}
    verification_rows = []
    for r in benefit_rows:
        key = r["category_name"]
        cnt = verification_bucket.get(key, 0)
        if cnt < 10:
            verification_rows.append(r)
            verification_bucket[key] = cnt + 1

    verification_path = os.path.join(OUTPUT_DIR, "benefits_verification_sample.csv")
    with open(verification_path, "w", newline="", encoding="utf-8-sig") as f:
        fieldnames = ["source_url", "condition_id", "category_name", "group_name", "rate", "fixed_amount", "raw_text"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(verification_rows)

    print(f"usage_conditions_v1.csv 저장: {len(usage_rows)}행 -> {usage_path}")
    print(f"benefits_v1.csv 저장: {len(benefit_rows)}행 -> {benefits_path}")
    print(f"benefits_verification_sample.csv 저장: {len(verification_rows)}행 -> {verification_path}")
    print(f"혜택 페어 0건 카드 수: {no_pairs_count}")
    print(f"'N원당 M' 패턴 감지 건수(rate 환산 또는 fixed_amount 차단 처리): {per_basis_converted_count}")
    print("category_name 분포:", dict(Counter(r["category_name"] for r in benefit_rows)))
    print("")
    print("다음 단계: benefits_verification_sample.csv 를 열어 raw_text 와 category_name,")
    print("rate/fixed_amount 파싱 결과가 실제로 맞는지 직접 확인해 주세요.")
    print('특히 category_name이 "기타"인 항목을 우선 확인해 주세요.')


if __name__ == "__main__":
    main()
