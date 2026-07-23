"""
map_benefits_categories.py
------------------------------------------------------------
목적:
  refined_v1/benefits_v1.csv 의 category_name, group_name(문자열)을
  DB/benefit_categories_seed.sql, DB/merchant_groups_seed.sql 에 정의된
  실제 category_id / group_id (SERIAL, INSERT 순서 기준)로 매핑한다.

입력:
  ~/DB/benefit_categories_seed.sql
  ~/DB/merchant_groups_seed.sql
  ~/refined_v1/benefits_v1.csv

출력:
  ~/refined_v1/benefits_v2.csv              (category_id, group_id 컬럼 추가)
  ~/refined_v1/unmapped_categories.csv      (category_id 매핑 실패 행)
  ~/refined_v1/unmapped_groups.csv          (group_id 매핑 실패 행, 검토용)
  ~/refined_v1/group_mapping_report.csv     (매핑 방식별 통계: EXACT/ALIAS/NOISE/UNMAPPED)

주의:
  - category_id / group_id는 하드코딩하지 않고, seed SQL의 INSERT 순서를
    그대로 파싱해서 SERIAL 시퀀스와 동일하게 1부터 부여한다.
    (DB에 실제 적재된 순서와 반드시 동일해야 하므로, INSERT문 순서를
     절대 변경하지 말 것)
  - category_name은 화이트리스트 방식(정확히 일치해야 매핑)으로 처리한다.
    일치하지 않으면 무조건 unmapped_categories.csv 로 분리한다 (silent 처리 금지).
  - group_name은 3단계로 처리한다: ① 정확 일치 ② 별칭(alias) 사전 매칭
    ③ 노이즈(기사 제목/카드명이 잘못 들어간 값) 필터링 후 나머지는 unmapped 처리.
"""

import os
import re
import csv
import pandas as pd

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT_ROOT = os.path.dirname(BASE_DIR)

CATEGORY_SEED_PATH = os.path.join(PROJECT_ROOT, "DB", "benefit_categories_seed.sql")
GROUP_SEED_PATH = os.path.join(PROJECT_ROOT, "DB", "merchant_groups_seed.sql")
BENEFITS_V1_PATH = os.path.join(BASE_DIR, "output", "refined_v1", "benefits_v1.csv")
OUTPUT_DIR = os.path.join(BASE_DIR, "output", "refined_v1")

BENEFITS_V2_PATH = os.path.join(OUTPUT_DIR, "benefits_v2.csv")
UNMAPPED_CATEGORIES_PATH = os.path.join(OUTPUT_DIR, "unmapped_categories.csv")
UNMAPPED_GROUPS_PATH = os.path.join(OUTPUT_DIR, "unmapped_groups.csv")
GROUP_MAPPING_REPORT_PATH = os.path.join(OUTPUT_DIR, "group_mapping_report.csv")

# ------------------------------------------------------------
# 1. seed SQL 파싱 (INSERT INTO ... VALUES (...),(...),... 형태)
#    각 튜플의 "첫 번째 문자열 컬럼"을 name으로 간주하고, 등장 순서대로
#    1부터 id를 부여한다 (SERIAL PRIMARY KEY 기본 동작과 동일).
# ------------------------------------------------------------
TUPLE_PATTERN = re.compile(r"\(\s*'((?:[^'\\]|\\.)*)'")


def parse_seed_names(sql_path: str) -> dict:
    """seed SQL 파일에서 모든 INSERT VALUES 블록의 첫 컬럼(name)을 순서대로 추출."""
    if not os.path.exists(sql_path):
        raise FileNotFoundError(f"시드 파일을 찾을 수 없습니다: {sql_path}")

    with open(sql_path, encoding="utf-8-sig") as f:
        content = f.read()

    insert_matches = list(re.finditer(
        r"INSERT\s+INTO\s+\w+\s*\([^)]*\)\s*VALUES\s*(.+?);",
        content,
        re.IGNORECASE | re.DOTALL,
    ))
    if not insert_matches:
        raise ValueError(f"INSERT INTO ... VALUES 구문을 찾을 수 없습니다: {sql_path}")

    name_to_id = {}
    next_id = 1
    for m in insert_matches:
        values_block = m.group(1)
        names = TUPLE_PATTERN.findall(values_block)
        for name in names:
            clean_name = name.replace("\\'", "'").strip()
            if clean_name not in name_to_id:
                name_to_id[clean_name] = next_id
                next_id += 1

    if not name_to_id:
        raise ValueError(f"이름 컬럼을 파싱하지 못했습니다: {sql_path}")

    return name_to_id


# ------------------------------------------------------------
# 2. group_name 별칭(alias) 사전
#    seed에 없는 표기(약어/유사어)를 seed의 정식 명칭으로 치환한다.
#    ※ 실제 merchant_groups_seed.sql 내용에 따라 조정이 필요할 수 있음.
# ------------------------------------------------------------
GROUP_ALIAS_MAP = {
    "주유소": "주유", "카페/디저트": "카페", "패스트푸드": "푸드",
    "일반음식점": "푸드", "외식": "푸드", "점심": "푸드", "저녁": "푸드",
    "베이커리": "카페", "항공마일리지": "항공권", "해외이용": "해외",
    "해외직구": "해외", "마트/편의점": "대형마트", "병원/약국": "병원",
    "약국": "병원", "대중교통": "교통", "고속버스": "교통", "기차": "교통",
    "택시": "교통", "자동차/하이패스": "자동차", "하이패스": "자동차",
    "정비": "자동차", "교육/육아": "교육", "학원": "교육", "학습지": "교육",
    "온라인쇼핑": "쇼핑", "아울렛": "쇼핑", "백화점": "쇼핑", "홈쇼핑": "쇼핑",
    "소셜커머스": "쇼핑", "공항라운지/PP": "공항라운지", "PP": "공항라운지",
    "공항": "공항라운지", "프리미엄 서비스": "프리미엄",
    "우대서비스": "프리미엄 서비스", "우대 서비스": "프리미엄 서비스",
    "여행사": "여행/숙박", "온라인 여행사": "여행/숙박", "리조트": "여행/숙박",
    "호텔": "여행/숙박", "렌터카": "자동차", "골프": "레저/스포츠",
    "테마파크": "레저/스포츠", "뷰티/피트니스": "피트니스",
    "드럭스토어": "병원", "동물병원": "병원", "애완동물": "병원",
    "OTT/영화/문화": "영화", "디지털구독": "영화", "음원사이트": "영화",
    "공연/전시": "영화", "게임": "영화", "경기관람": "영화",
    "편의점": "마트/편의점", "대형마트": "마트/편의점", "SSM": "마트/편의점",
    "간편결제": "기타", "삼성페이": "기타", "카카오페이": "기타",
    "네이버페이": "기타", "수수료우대": "금융", "보험": "금융",
    "보험사": "금융", "급여이체": "금융", "연회비지원": "기타",
    "실적조건 없음": "기타", "무실적": "기타", "전통시장": "쇼핑",
    "인테리어": "생활", "충전소": "주유", "화장품": "뷰티/피트니스",
    "헤어": "뷰티/피트니스", "아이스크림": "푸드", "배달앱": "푸드",
    "지역": "기타", "직장인": "기타", "멤버십포인트": "적립",
    "해피포인트": "적립", "OK캐쉬백": "적립", "공과금": "금융",
    "공과금/렌탈": "금융", "렌탈": "생활", "문화센터": "생활",
    "아이행복": "생활", "국민행복": "생활", "비즈니스": "기타",
    "제휴/PLCC": "기타", "은행사": "금융", "더라운지": "공항라운지",
    "아시아나항공": "항공마일리지", "대한항공": "항공마일리지",
    "저가항공": "항공마일리지", "제주항공": "항공마일리지",
    "진에어": "항공마일리지", "국내가맹점": "모든가맹점",
    "국내외가맹점": "모든가맹점",
}

# ------------------------------------------------------------
# 3. 노이즈 판별 (기사 제목/카드명/시리즈명이 group_name 자리에 잘못
#    파싱된 경우). 이 패턴에 걸리면 unmapped 대신 별도 사유(NOISE)로 표시.
# ------------------------------------------------------------
NOISE_PATTERNS = [
    r"설문조사", r"꿀팁", r"BEST", r"추천", r"차트", r"혜택\s*좋은", r"\d+위",
    r"Edition\d*$", r"Card®", r"Classic$", r"Prime$", r"Centum$", r"Exclusive$",
    r"the OPUS|the Red|the black|SmileCard|Smilecard|RAUME|JADE|L\.CLASS",
    r"^LOCA |^NU |^NEW ", r"^\[.*\]", r"^\d", r"설문|후기|리뷰|비교|가성비|반전매력",
    r"HERITAGE|이지캐시백|국민행복체크|국내 가맹점 하나머니",
    r"^APP$|^KT$|^LGU\+$|^SKT$",
]
NOISE_REGEX = re.compile("|".join(NOISE_PATTERNS))


def is_noise(name: str) -> bool:
    return bool(NOISE_REGEX.search(name))


def resolve_group(name, canonical_groups: dict):
    """group_name(원문) -> (group_id, match_type) 반환."""
    if pd.isna(name):
        return None, "NULL"
    name = str(name).strip()
    if name in canonical_groups:
        return canonical_groups[name], "EXACT"
    alias = GROUP_ALIAS_MAP.get(name)
    if alias and alias in canonical_groups:
        return canonical_groups[alias], "ALIAS"
    if is_noise(name):
        return None, "NOISE"
    return None, "UNMAPPED"


def resolve_category(name, canonical_categories: dict):
    """category_name(원문) -> (category_id, match_type) 반환. 화이트리스트 방식."""
    if pd.isna(name):
        return None, "NULL"
    name = str(name).strip()
    if name in canonical_categories:
        return canonical_categories[name], "EXACT"
    return None, "UNMAPPED"


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    if not os.path.exists(BENEFITS_V1_PATH):
        raise FileNotFoundError(f"입력 파일이 없습니다: {BENEFITS_V1_PATH}")

    canonical_categories = parse_seed_names(CATEGORY_SEED_PATH)
    canonical_groups = parse_seed_names(GROUP_SEED_PATH)

    print(f"[INFO] benefit_categories 시드 {len(canonical_categories)}건 로드")
    print(f"[INFO] merchant_groups 시드 {len(canonical_groups)}건 로드")

    bv = pd.read_csv(BENEFITS_V1_PATH, encoding="utf-8-sig")
    required_cols = {"category_name", "group_name"}
    missing = required_cols - set(bv.columns)
    if missing:
        raise ValueError(f"benefits_v1.csv에 필수 컬럼이 없습니다: {missing}")

    cat_results = bv["category_name"].map(lambda n: resolve_category(n, canonical_categories))
    bv["category_id"] = cat_results.map(lambda x: x[0])
    bv["category_match_type"] = cat_results.map(lambda x: x[1])

    grp_results = bv["group_name"].map(lambda n: resolve_group(n, canonical_groups))
    bv["group_id"] = grp_results.map(lambda x: x[0])
    bv["group_match_type"] = grp_results.map(lambda x: x[1])

    # category_id는 NOT NULL FK이므로 매핑 실패 시 반드시 별도 분리 (DB 적재 차단)
    unmapped_cat_mask = bv["category_id"].isna()
    unmapped_categories = bv[unmapped_cat_mask].copy()
    if len(unmapped_categories) > 0:
        unmapped_categories.to_csv(UNMAPPED_CATEGORIES_PATH, index=False, encoding="utf-8-sig")
        print(f"[WARN] category_id 매핑 실패 {len(unmapped_categories)}건 -> {UNMAPPED_CATEGORIES_PATH}")

    # group_id는 NULL 허용 FK이므로 매핑 실패해도 DB 적재는 가능하지만,
    # 검토용으로 별도 저장 (UNMAPPED만 저장, NOISE/NULL은 정상 처리로 간주)
    unmapped_groups_mask = bv["group_match_type"] == "UNMAPPED"
    unmapped_groups = bv[unmapped_groups_mask].copy()
    if len(unmapped_groups) > 0:
        unmapped_groups.to_csv(UNMAPPED_GROUPS_PATH, index=False, encoding="utf-8-sig")
        print(f"[WARN] group_id 매핑 실패(UNMAPPED) {len(unmapped_groups)}건 -> {UNMAPPED_GROUPS_PATH}")

    # 매핑 방식별 통계 리포트
    report = (
        bv.groupby(["category_match_type", "group_match_type"])
        .size()
        .reset_index(name="row_count")
        .sort_values("row_count", ascending=False)
    )
    report.to_csv(GROUP_MAPPING_REPORT_PATH, index=False, encoding="utf-8-sig")

    # category_id 매핑 실패 행은 v2에서 제외 (NOT NULL 위반 방지),
    # group_id NOISE/UNMAPPED는 NULL로 유지한 채 v2에 포함 (FK NULL 허용)
    bv.loc[bv["group_match_type"].isin(["NOISE", "UNMAPPED"]), "group_id"] = None

    bv_valid = bv[~unmapped_cat_mask].drop(columns=["category_match_type", "group_match_type"])
    bv_valid.to_csv(BENEFITS_V2_PATH, index=False, encoding="utf-8-sig")

    print(f"[DONE] benefits_v2.csv 저장: {len(bv_valid)}행 -> {BENEFITS_V2_PATH}")
    print(f"[DONE] 매핑 리포트: {GROUP_MAPPING_REPORT_PATH}")


if __name__ == "__main__":
    main()
