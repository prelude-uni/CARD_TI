"""
validate_benefits_ready.py
목적: benefits_ready_to_insert.csv가 benefits 테이블 스키마 제약을
      실제로 위반하지 않는지, DB에 쓰기 전에 로컬에서 사전 검증한다.
      DB 연결 없이 순수 로컬 파일 검증만 수행한다.
"""

import sys
from pathlib import Path

import pandas as pd

BASE_DIR = Path(__file__).resolve().parent  # Data/output/refined_v1
IN_PATH = BASE_DIR / "sql_ready" / "benefits_ready_to_insert.csv"
OUT_DIR = BASE_DIR / "sql_ready"

VALID_CAP_PERIODS = {"DAILY", "MONTHLY", "QUARTERLY", "YEARLY", "PER_USE"}
RATE_MAX_ABS = 999.99  # DECIMAL(5,2) 최대치


def log(msg: str) -> None:
    print(f"[INFO] {msg}")


def warn(msg: str) -> None:
    print(f"[WARN] {msg}")


def is_int_convertible(val) -> bool:
    if pd.isna(val):
        return True
    try:
        f = float(val)
        return f == int(f)
    except (ValueError, TypeError):
        return False


def check_decimal_scale(val, max_abs: float, max_decimals: int = 2) -> bool:
    if pd.isna(val):
        return True
    try:
        f = float(val)
    except (ValueError, TypeError):
        return False
    if abs(f) > max_abs:
        return False
    scaled = round(f * (10 ** max_decimals))
    return abs(scaled - f * (10 ** max_decimals)) < 1e-6


def main():
    if not IN_PATH.exists():
        sys.exit(f"[ERROR] 파일을 찾을 수 없습니다: {IN_PATH}")

    df = pd.read_csv(IN_PATH)
    log(f"검증 대상 행 수 = {len(df)}")

    issues = []  # (row_index, source_url, column, reason)

    for idx, row in df.iterrows():
        src = row.get("source_url", "")

        if pd.isna(row.get("card_id")) or not is_int_convertible(row.get("card_id")):
            issues.append((idx, src, "card_id", "NULL 또는 정수 변환 불가 (NOT NULL 위반)"))

        if pd.isna(row.get("category_id")) or not is_int_convertible(row.get("category_id")):
            issues.append((idx, src, "category_id", "NULL 또는 정수 변환 불가 (NOT NULL 위반)"))

        if not is_int_convertible(row.get("condition_id")):
            issues.append((idx, src, "condition_id", "정수 변환 불가"))

        if not is_int_convertible(row.get("group_id")):
            issues.append((idx, src, "group_id", "정수 변환 불가"))

        rate = row.get("rate")
        if not check_decimal_scale(rate, RATE_MAX_ABS, 2):
            issues.append(
                (idx, src, "rate", f"DECIMAL(5,2) 범위/정밀도 초과 (값={rate})")
            )

        if not is_int_convertible(row.get("fixed_amount")):
            issues.append((idx, src, "fixed_amount", "정수 변환 불가"))

        if "cap_amount" in df.columns and not is_int_convertible(row.get("cap_amount")):
            issues.append((idx, src, "cap_amount", "정수 변환 불가"))

        if "cap_period" in df.columns:
            cap_period = row.get("cap_period")
            if pd.notna(cap_period) and str(cap_period).strip().upper() not in VALID_CAP_PERIODS:
                issues.append(
                    (idx, src, "cap_period", f"CHECK 제약 위반 (값={cap_period}, 허용값={VALID_CAP_PERIODS})")
                )

        raw_text = row.get("raw_text")
        if pd.isna(raw_text) or str(raw_text).strip() == "":
            issues.append((idx, src, "raw_text", "원문 비어 있음 (스키마상 필수 권장 필드)"))

    if not issues:
        log("검증 통과: 스키마 제약 위반 없음. --execute 실행에 문제 없습니다.")
        return

    issues_df = pd.DataFrame(issues, columns=["row_index", "source_url", "column", "reason"])
    out_path = OUT_DIR / "benefits_validation_issues.csv"
    issues_df.to_csv(out_path, index=False, encoding="utf-8-sig")

    summary = issues_df["column"].value_counts()
    warn(f"검증 실패: 총 {len(issues_df)}건의 위반 발견 -> {out_path.name}")
    for col, cnt in summary.items():
        warn(f"  - {col}: {cnt}건")
    warn("위 파일을 검토하여 원본 데이터를 수정한 후 다시 검증을 실행하세요.")
    warn("문제를 해결하기 전까지 --execute 실행을 권장하지 않습니다.")


if __name__ == "__main__":
    main()