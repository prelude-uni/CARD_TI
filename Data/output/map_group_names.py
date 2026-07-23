"""
map_group_names.py

목적:
  benefits_v3.csv의 group_name(원본 텍스트, 193종)을 merchant_groups_seed-2.sql에
  등록된 실제 노드(대분류7 + 중분류23 + 브랜드43 = 73개)의 이름으로 정규화한다.

  이 스크립트는 group_id(정수 PK)를 직접 생성하거나 추측하지 않는다. group_id는
  Supabase에 실제 INSERT된 후에만 확정되는 값이므로, 이 단계에서는 대신
  merchant_groups.group_name과 정확히 일치하는 "정규화된 이름"만 결정한다.
  최종 group_id 연결은 이후 SQL JOIN(resolved_group_name = merchant_groups.group_name)
  단계에서 수행해야 한다. (스키마의 SERIAL PK를 임의로 흉내내지 않기 위함)

처리 규칙 (우선순위 순):
  1) EXACT: group_name이 merchant_groups 노드 이름과 완전히 동일 -> 그대로 사용
  2) SYNONYM: 아래 SYNONYM_MAP에 등록된, 의미가 명확한 동의어만 치환
     (예: '주유'->'주유소', '카페/디저트'->'카페'). 이 목록은 draft이며
     반드시 사용자 검토가 필요하다. group_mapping_report.csv의
     action='SYNONYM_APPLIED' 행을 확인할 것.
  3) UNMAPPED: 위 두 경우에 해당하지 않는 모든 값은 신규 업종(예: 호텔, 렌터카,
     패스트푸드 등)일 수도 있고 크롤링 노이즈(기사 제목, 카드 상품명 등)일 수도
     있어 구분이 불가능하므로, 임의로 재분류하지 않고 사용자 지시에 따라
     중분류 '기타혜택'으로 fallback 처리한다.

  원본 group_name 컬럼은 절대 덮어쓰지 않고 보존한다. 새 컬럼
  'resolved_group_name'(정규화된 이름), 'mapping_action'(EXACT/SYNONYM_APPLIED/
  UNMAPPED_FALLBACK_기타혜택)을 추가한다. 행 삭제/추가 없음(원본 데이터 유실 없음).

경로 (프로젝트 실제 구조 기준):
  Data/
  └── output/
      ├── map_group_names.py                 (이 스크립트)
      └── refined_v1/
          ├── benefits_v3.csv                 (입력, correct_misclassified_categories.py 산출물)
          ├── benefits_v4.csv                 (출력, 이 스크립트 산출물)
          └── group_mapping_report.csv        (출력, 매핑 판정 근거 전체 로그)

입력: output/refined_v1/benefits_v3.csv
출력: output/refined_v1/benefits_v4.csv, output/refined_v1/group_mapping_report.csv

스키마 위배 없음: merchant_groups 테이블 구조를 변경하지 않으며, 이 스크립트는
  group_id를 채우지 않는다(추측 금지). CSV 파일 레벨에서 이름만 정규화한다.

실행 방법 (어느 위치에서 실행해도 무방, __file__ 기준 상대경로 사용):
  python output/map_group_names.py   (Data 루트에서)
  python map_group_names.py          (Data/output 안에서)
"""
import pandas as pd
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REFINED_DIR = SCRIPT_DIR / "refined_v1"

BV_PATH = REFINED_DIR / "benefits_v3.csv"
OUT_BV_PATH = REFINED_DIR / "benefits_v4.csv"
REPORT_PATH = REFINED_DIR / "group_mapping_report.csv"

FALLBACK_NODE = "기타혜택"  # merchant_groups 중분류 리프, parent=대분류'기타' (사용자 확정)

# merchant_groups_seed-2.sql에 실제 INSERT된 73개 노드 이름 전체
MERCHANT_GROUP_NODES = {
    "대분류": ["쇼핑", "외식카페", "문화여가", "교통자동차", "여행항공", "생활", "기타"],
    "중분류": [
        "백화점", "대형마트", "편의점", "온라인쇼핑", "드럭스토어", "카페", "배달앱", "영화",
        "디지털구독", "테마파크", "골프", "주유소", "대중교통", "택시", "항공", "공항라운지",
        "면세점", "통신", "간편결제", "병원약국", "교육육아", "모든가맹점", "기타혜택",
    ],
    "브랜드": [
        "롯데백화점", "신세계백화점", "현대백화점", "이마트", "롯데마트", "홈플러스", "코스트코",
        "GS25", "CU", "세븐일레븐", "이마트24", "쿠팡", "11번가", "G마켓", "SSG", "올리브영",
        "랄라블라", "스타벅스", "이디야", "투썸플레이스", "빽다방", "배달의민족", "요기요",
        "쿠팡이츠", "CGV", "롯데시네마", "메가박스", "넷플릭스", "유튜브프리미엄", "왓챠", "티빙",
        "S-OIL", "GS칼텍스", "SK에너지", "현대오일뱅크", "에이치디현대오일뱅크",
        "대한항공", "아시아나항공", "SK텔레콤", "KT", "LGU+", "카카오페이", "네이버페이",
    ],
}
ALL_NODES = set(sum(MERCHANT_GROUP_NODES.values(), []))

# 의미가 명확한 동의어만 등록한 draft 목록. 반드시 사용자 검토 필요.
# (좌: benefits_v3.csv 원본 group_name, 우: merchant_groups 실제 노드명)
SYNONYM_MAP = {
    "주유": "주유소",
    "카페/디저트": "카페",
    "항공마일리지": "항공",
    "병원/약국": "병원약국",
    "학원": "교육육아",
    "국내외가맹점": "모든가맹점",
}

# SYNONYM_MAP의 타겟이 실제 노드 목록에 있는지 스크립트 자체적으로 검증(안전장치)
_invalid_targets = {v for v in SYNONYM_MAP.values() if v not in ALL_NODES}
if _invalid_targets:
    raise ValueError(f"SYNONYM_MAP의 타겟이 실제 merchant_groups 노드에 없습니다: {_invalid_targets}")


def resolve(group_name: str):
    if group_name in ALL_NODES:
        return group_name, "EXACT"
    if group_name in SYNONYM_MAP:
        return SYNONYM_MAP[group_name], "SYNONYM_APPLIED"
    return FALLBACK_NODE, "UNMAPPED_FALLBACK_기타혜택"


def main():
    if not BV_PATH.exists():
        raise FileNotFoundError(f"입력 파일을 찾을 수 없습니다: {BV_PATH}")

    bv = pd.read_csv(BV_PATH)
    original_rows = len(bv)
    original_cols_snapshot = bv.copy()  # 원본 전체 컬럼 보존 확인용

    resolved_names = []
    actions = []
    for gname in bv["group_name"]:
        rname, action = resolve(str(gname))
        resolved_names.append(rname)
        actions.append(action)

    bv_v4 = bv.copy()
    bv_v4["resolved_group_name"] = resolved_names
    bv_v4["mapping_action"] = actions

    # ---- 검증 1: 행 수 불변 (원본 데이터 유실 없음) ----
    assert len(bv_v4) == original_rows, \
        f"행 수가 변경되었습니다({original_rows} -> {len(bv_v4)}). 중단합니다."

    # ---- 검증 2: 기존 컬럼(원본 group_name 포함) 전혀 변경되지 않았는지 확인 ----
    original_col_names = list(original_cols_snapshot.columns)
    unchanged_check = bv_v4[original_col_names].compare(original_cols_snapshot)
    assert unchanged_check.empty, "기존 컬럼이 변경되었습니다. 로직 오류이므로 중단합니다."

    # ---- 검증 3: resolved_group_name이 전부 실제 73개 노드 안에 있는지 확인 ----
    invalid_resolved = set(bv_v4["resolved_group_name"].unique()) - ALL_NODES
    assert not invalid_resolved, \
        f"73개 노드 목록 밖의 resolved_group_name이 발견되었습니다: {invalid_resolved}"

    report_df = bv_v4[[
        "source_url", "condition_id", "group_name", "resolved_group_name",
        "mapping_action", "raw_text",
    ]].copy()

    REFINED_DIR.mkdir(parents=True, exist_ok=True)
    bv_v4.to_csv(OUT_BV_PATH, index=False, encoding="utf-8-sig")
    report_df.to_csv(REPORT_PATH, index=False, encoding="utf-8-sig")

    action_counts = report_df["mapping_action"].value_counts()
    n_unique_unmapped_group_names = report_df.loc[
        report_df["mapping_action"] == "UNMAPPED_FALLBACK_기타혜택", "group_name"
    ].nunique()

    print(f"[INFO] BV_PATH           = {BV_PATH}")
    print(f"[INFO] 입력 총 행 수       = {original_rows}")
    print(f"[INFO] EXACT             = {int(action_counts.get('EXACT', 0))}")
    print(f"[INFO] SYNONYM_APPLIED   = {int(action_counts.get('SYNONYM_APPLIED', 0))}")
    print(f"[INFO] UNMAPPED_FALLBACK = {int(action_counts.get('UNMAPPED_FALLBACK_기타혜택', 0))}")
    print(f"[INFO]   ㄴ 미매핑 고유 group_name 종 수 = {n_unique_unmapped_group_names}")
    print(f"[INFO] 출력 총 행 수       = {len(bv_v4)} (입력과 동일해야 정상)")
    print(f"[INFO] 검증 통과: 행 수 불변 / 기존 컬럼 불변 / 73개 노드 화이트리스트 준수")
    print(f"[INFO] 결과 저장 위치      = {OUT_BV_PATH}")
    print(f"[INFO] 매핑 판정 리포트    = {REPORT_PATH}")
    print(f"[NOTICE] SYNONYM_MAP은 draft입니다. group_mapping_report.csv에서")
    print(f"[NOTICE] action='SYNONYM_APPLIED' 행을 반드시 검토해 주세요.")
    print(f"[NOTICE] UNMAPPED_FALLBACK_기타혜택으로 처리된 {n_unique_unmapped_group_names}개 원본")
    print(f"[NOTICE] group_name 종류는 report의 group_name 컬럼으로 확인 가능합니다.")


if __name__ == "__main__":
    main()
