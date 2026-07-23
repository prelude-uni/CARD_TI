"""
correct_misclassified_categories.py  (v2)

목적:
  benefits_v2.csv 중 category_name='기타'로 분류된 890건을 재검토한다.
  원본 파서는 rate/fixed_amount를 정규식으로 추출하지 못한 텍스트를
  전부 '기타'로 분류했다. 이 중 raw_text에 명확한 카테고리 키워드가
  포함된 행은 파서가 놓친 것으로 보고 해당 카테고리로 재분류하고,
  키워드가 없는 나머지는 그대로 '기타'로 유지한다(임의 재분류/삭제 없음).

  ** v1 -> v2 변경 사항 **
  v1에서는 '무이자할부' 판정 키워드로 ["무이자", "할부"]를 사용해,
  "할부"라는 단어만 있어도(예: "롯데백화점 12개월 할부서비스",
  "KT Super 할부") 무이자 여부와 무관하게 재분류되는 과매칭 오류가
  있었다(17건). v2에서는 '무이자'가 명시적으로 포함된 경우에만
  '무이자할부'로 재분류하도록 규칙을 좁혔다. "할부"만 있고 "무이자"가
  없는 17건은 '기타'로 되돌린다(재분류하지 않음).

  ** 주의 (반드시 확인 필요) **
  - 아래 키워드 목록은 raw_text 표층 문자열 매칭 규칙이며, 문맥을
    완전히 이해한 분류가 아니다. category_correction_report.csv에서
    RECLASSIFIED로 표시된 행을 사용자가 직접 검토하는 것을 권장한다.
  - 이 스크립트를 실행하기 전에 benefit_categories 테이블에 8종
    (적립/캐시백/마일리지/할인/무료서비스/바우처/무이자할부/기타)이
    이미 INSERT되어 있어야 한다(benefit_categories_seed.sql +
    benefit_categories_seed_addendum.sql 실행 완료 — 이 프로젝트에서는
    완료된 상태로 확인됨).

경로 (프로젝트 실제 구조 기준):
  Data/
  └── output/
      ├── correct_misclassified_categories.py   (이 스크립트)
      ├── card_data_raw.json
      └── refined_v1/
          ├── benefits_v2.csv          (입력, patch_usage_conditions_v2.py 산출물)
          ├── benefits_v3.csv          (출력, 이 스크립트 산출물 — 재실행 시 덮어씀)
          └── category_correction_report.csv  (출력, 변경 내역 추적용)

입력: output/refined_v1/benefits_v2.csv
출력: output/refined_v1/benefits_v3.csv, output/refined_v1/category_correction_report.csv

스키마 위배 없음: category_name 값만 변경하며, benefit_categories 테이블에
  이미 INSERT되어 있는 8종 중 하나로만 재배정한다. 행 삭제·추가 없음
  (원본 데이터 유실 없음 — 실행 시 입력/출력 행수 일치를 스크립트 내에서 검증).

실행 방법 (어느 위치에서 실행해도 무방, __file__ 기준 상대경로 사용):
  python output/correct_misclassified_categories.py   (Data 루트에서)
  python correct_misclassified_categories.py           (Data/output 안에서)
"""
import pandas as pd
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REFINED_DIR = SCRIPT_DIR / "refined_v1"

BV_PATH = REFINED_DIR / "benefits_v2.csv"
OUT_BV_PATH = REFINED_DIR / "benefits_v3.csv"
REPORT_PATH = REFINED_DIR / "category_correction_report.csv"

VALID_CATEGORIES = {"적립", "캐시백", "마일리지", "할인", "무료서비스", "바우처", "무이자할부", "기타"}

# raw_text 표층 키워드 매칭 규칙. 여러 카테고리에 동시 매칭되는 경우
# 리스트 순서상 먼저 오는 카테고리를 우선 적용한다(위→아래 우선순위).
# v2: '무이자할부'는 '무이자'가 명시된 경우에만 매칭 (v1의 '할부' 단독 매칭 제거)
KEYWORD_RULES = [
    ("무이자할부", ["무이자"]),
    ("바우처", ["바우처", "기프트", "상품권", "교환권"]),
    ("무료서비스", ["무료", "서비스 제공", "우대 서비스", "라운지", "발렛파킹"]),
]


def classify_row(raw_text: str):
    """raw_text에서 키워드 규칙에 매칭되는 카테고리명을 반환. 없으면 None."""
    text = str(raw_text)
    for category, keywords in KEYWORD_RULES:
        if any(kw in text for kw in keywords):
            return category
    return None


def main():
    if not BV_PATH.exists():
        raise FileNotFoundError(f"입력 파일을 찾을 수 없습니다: {BV_PATH}")

    bv = pd.read_csv(BV_PATH)
    original_rows = len(bv)
    original_non_category_cols = bv.drop(columns=["category_name"]).copy()

    target_mask = bv["category_name"] == "기타"
    bv_v3 = bv.copy()

    report_rows = []
    reclassified_count = 0
    kept_as_gita_count = 0

    for idx in bv[target_mask].index:
        raw_text = bv.at[idx, "raw_text"]
        new_category = classify_row(raw_text)
        if new_category is not None:
            bv_v3.at[idx, "category_name"] = new_category
            report_rows.append({
                "source_url": bv.at[idx, "source_url"],
                "condition_id": bv.at[idx, "condition_id"],
                "group_name": bv.at[idx, "group_name"],
                "raw_text": raw_text,
                "original_category": "기타",
                "new_category": new_category,
                "action": "RECLASSIFIED",
            })
            reclassified_count += 1
        else:
            report_rows.append({
                "source_url": bv.at[idx, "source_url"],
                "condition_id": bv.at[idx, "condition_id"],
                "group_name": bv.at[idx, "group_name"],
                "raw_text": raw_text,
                "original_category": "기타",
                "new_category": "기타",
                "action": "KEPT_AS_GITA_NO_KEYWORD_MATCH",
            })
            kept_as_gita_count += 1

    # ---- 검증 1: 행 수 불변 (원본 데이터 유실 없음) ----
    assert len(bv_v3) == original_rows, \
        f"행 수가 변경되었습니다({original_rows} -> {len(bv_v3)}). 원본 데이터 유실 가능성이 있어 중단합니다."

    # ---- 검증 2: category_name 외 컬럼은 절대 변경되지 않았는지 확인 ----
    changed_other_cols = bv_v3.drop(columns=["category_name"]).compare(original_non_category_cols)
    assert changed_other_cols.empty, \
        "category_name 외 다른 컬럼이 변경되었습니다. 로직 오류이므로 중단합니다."

    # ---- 검증 3: 최종 category_name이 8종 화이트리스트 안에만 있는지 확인 ----
    invalid_categories = set(bv_v3["category_name"].unique()) - VALID_CATEGORIES
    assert not invalid_categories, \
        f"화이트리스트 밖의 category_name이 발견되었습니다: {invalid_categories}"

    REFINED_DIR.mkdir(parents=True, exist_ok=True)
    bv_v3.to_csv(OUT_BV_PATH, index=False, encoding="utf-8-sig")

    report_df = pd.DataFrame(report_rows)
    report_df.to_csv(REPORT_PATH, index=False, encoding="utf-8-sig")

    reclassified_df = report_df[report_df["action"] == "RECLASSIFIED"]
    n_installment = int((reclassified_df["new_category"] == "무이자할부").sum())
    n_voucher = int((reclassified_df["new_category"] == "바우처").sum())
    n_free = int((reclassified_df["new_category"] == "무료서비스").sum())

    print(f"[INFO] BV_PATH         = {BV_PATH}")
    print(f"[INFO] 입력 총 행 수     = {original_rows}")
    print(f"[INFO] '기타' 대상 행 수  = {int(target_mask.sum())}")
    print(f"[INFO] 재분류된 행 수    = {reclassified_count}")
    print(f"[INFO]   -> 무이자할부   = {n_installment}")
    print(f"[INFO]   -> 바우처       = {n_voucher}")
    print(f"[INFO]   -> 무료서비스   = {n_free}")
    print(f"[INFO] '기타' 유지 행 수  = {kept_as_gita_count}")
    print(f"[INFO] 출력 총 행 수     = {len(bv_v3)} (입력과 동일해야 정상)")
    print(f"[INFO] 검증 통과: 행 수 불변 / 다른 컬럼 불변 / 카테고리 화이트리스트 준수")
    print(f"[INFO] 결과 저장 위치    = {OUT_BV_PATH}")
    print(f"[INFO] 변경 내역 리포트  = {REPORT_PATH}")


if __name__ == "__main__":
    main()