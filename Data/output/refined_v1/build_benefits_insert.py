"""
build_benefits_insert.py
목적: benefits_v4.csv + source_url_to_card_id_map.csv를 Supabase의
      benefit_categories / merchant_groups / usage_conditions와 대조하여
      benefits 테이블에 안전하게 INSERT한다.

기본 실행은 --dry-run (DB에 아무것도 쓰지 않음).
실제 반영은 --execute 플래그를 명시해야만 수행된다.

[수정 내역]
- rate가 DECIMAL(5,2)로 정확히 표현 불가능한 경우(예: 0.0667),
  반올림으로 값을 왜곡하는 대신 rate를 NULL로 처리하고
  raw_text에 원문을 보존한다 (사용자 결정: 방안 B).
"""

import argparse
import os
import sys
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from supabase import create_client, Client

# ------------------------------------------------------------------
# 경로 설정
# ------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent  # Data/output/refined_v1
ENV_PATH = BASE_DIR.parent.parent / ".env"   # Data/.env
BENEFITS_PATH = BASE_DIR / "benefits_v4.csv"
MAP_PATH = BASE_DIR / "sql_ready" / "source_url_to_card_id_map.csv"
OUT_DIR = BASE_DIR / "sql_ready"
OUT_DIR.mkdir(parents=True, exist_ok=True)

ERROR_UNMAPPED_CARD = OUT_DIR / "benefits_error_unmapped_card.csv"
ERROR_UNMAPPED_CATEGORY = OUT_DIR / "benefits_error_unmapped_category.csv"
ERROR_UNMAPPED_GROUP = OUT_DIR / "benefits_error_unmapped_group.csv"
ERROR_CONDITION_MISMATCH = OUT_DIR / "benefits_error_condition_mismatch.csv"
ERROR_DUP_GROUP_NAME = OUT_DIR / "benefits_error_duplicate_group_name.csv"
ERROR_RATE_NULLED = OUT_DIR / "benefits_rate_nulled_report.csv"
VALID_ROWS_PATH = OUT_DIR / "benefits_ready_to_insert.csv"

RATE_DECIMAL_PLACES = 2  # benefits.rate 컬럼 = DECIMAL(5,2)


def log(msg: str) -> None:
    print(f"[INFO] {msg}")


def warn(msg: str) -> None:
    print(f"[WARN] {msg}")


def get_client() -> Client:
    if not ENV_PATH.exists():
        sys.exit(f"[ERROR] .env 파일을 찾을 수 없습니다: {ENV_PATH}")
    load_dotenv(ENV_PATH)

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit(
            "[ERROR] SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 "
            f".env({ENV_PATH})에 설정되어 있지 않습니다."
        )
    return create_client(url, key)


def fetch_all_rows(client: Client, table: str, columns: str) -> pd.DataFrame:
    """Supabase는 기본 1000행 제한이 있어 range()로 전량 페이징 조회한다."""
    all_rows = []
    page_size = 1000
    start = 0
    while True:
        resp = (
            client.table(table)
            .select(columns)
            .range(start, start + page_size - 1)
            .execute()
        )
        rows = resp.data
        if not rows:
            break
        all_rows.extend(rows)
        if len(rows) < page_size:
            break
        start += page_size
    df = pd.DataFrame(all_rows)
    log(f"{table} 테이블에서 {len(df)}건 조회 완료")
    return df


def load_input_files() -> tuple[pd.DataFrame, pd.DataFrame]:
    if not BENEFITS_PATH.exists():
        sys.exit(f"[ERROR] 파일을 찾을 수 없습니다: {BENEFITS_PATH}")
    if not MAP_PATH.exists():
        sys.exit(f"[ERROR] 파일을 찾을 수 없습니다: {MAP_PATH}")

    benefits = pd.read_csv(BENEFITS_PATH)
    card_map = pd.read_csv(MAP_PATH)

    log(f"benefits_v4.csv 원본 행 수 = {len(benefits)}")
    log(f"source_url_to_card_id_map.csv 행 수 = {len(card_map)}")
    return benefits, card_map


def build_mappings(client: Client):
    cat_df = fetch_all_rows(client, "benefit_categories", "category_id,category_name")
    cat_map = dict(zip(cat_df["category_name"], cat_df["category_id"]))

    grp_df = fetch_all_rows(client, "merchant_groups", "group_id,group_name")
    dup_names = grp_df["group_name"][grp_df["group_name"].duplicated(keep=False)].unique()
    if len(dup_names) > 0:
        warn(
            f"merchant_groups에 이름이 중복된 group_name이 {len(dup_names)}개 있습니다. "
            "resolved_group_name 매핑 시 첫 번째 값으로만 매핑되므로, "
            "이 이름들을 사용하는 혜택 행은 별도 리포트로 분리하여 수동 확인이 필요합니다."
        )
        pd.DataFrame({"duplicate_group_name": dup_names}).to_csv(
            ERROR_DUP_GROUP_NAME, index=False, encoding="utf-8-sig"
        )
    grp_map = dict(zip(grp_df["group_name"], grp_df["group_id"]))

    cond_df = fetch_all_rows(client, "usage_conditions", "condition_id,card_id")
    cond_valid_pairs = set(zip(cond_df["condition_id"], cond_df["card_id"]))

    return cat_map, grp_map, cond_valid_pairs, dup_names


def fix_rate_precision(df: pd.DataFrame) -> pd.DataFrame:
    """
    rate가 DECIMAL(5,2)로 정확히 표현 불가능한 경우(예: 0.0667),
    반올림으로 값을 왜곡하는 대신 rate를 NULL로 처리하고
    raw_text에 원문을 보존한다 (사용자 결정: 방안 B).
    """
    def is_exact_2dp(v):
        if pd.isna(v):
            return True
        scaled = v * (10 ** RATE_DECIMAL_PLACES)
        return abs(scaled - round(scaled)) < 1e-6

    mask_bad = ~df["rate"].apply(is_exact_2dp)
    nulled = df[mask_bad].copy()

    if not nulled.empty:
        nulled.to_csv(ERROR_RATE_NULLED, index=False, encoding="utf-8-sig")
        warn(
            f"rate가 DECIMAL(5,2) 정밀도를 초과하여 NULL 처리된 행 {len(nulled)}건 -> "
            f"{ERROR_RATE_NULLED.name} (raw_text는 그대로 보존됨)"
        )
        df.loc[mask_bad, "rate"] = None

    return df


def transform(
    benefits: pd.DataFrame,
    card_map: pd.DataFrame,
    cat_map: dict,
    grp_map: dict,
    cond_valid_pairs: set,
    dup_group_names,
):
    df = benefits.merge(
        card_map[["source_url", "card_id"]], on="source_url", how="left"
    )

    unmapped_card = df[df["card_id"].isna()].copy()
    if not unmapped_card.empty:
        unmapped_card.to_csv(ERROR_UNMAPPED_CARD, index=False, encoding="utf-8-sig")
        warn(f"card_id 매핑 실패 {len(unmapped_card)}건 -> {ERROR_UNMAPPED_CARD.name}")
    df = df[df["card_id"].notna()].copy()
    df["card_id"] = df["card_id"].astype(int)

    df["category_id"] = df["category_name"].map(cat_map)
    unmapped_category = df[df["category_id"].isna()].copy()
    if not unmapped_category.empty:
        unmapped_category.to_csv(
            ERROR_UNMAPPED_CATEGORY, index=False, encoding="utf-8-sig"
        )
        warn(
            f"category_id 매핑 실패 {len(unmapped_category)}건 -> "
            f"{ERROR_UNMAPPED_CATEGORY.name}"
        )
    df = df[df["category_id"].notna()].copy()
    df["category_id"] = df["category_id"].astype(int)

    group_col = "resolved_group_name" if "resolved_group_name" in df.columns else "group_name"

    is_dup = df[group_col].isin(dup_group_names)
    dup_rows = df[is_dup].copy()
    if not dup_rows.empty:
        dup_rows.to_csv(
            OUT_DIR / "benefits_error_ambiguous_group.csv",
            index=False,
            encoding="utf-8-sig",
        )
        warn(
            f"group_name이 여러 group_id에 중복되어 모호한 행 {len(dup_rows)}건 -> "
            "benefits_error_ambiguous_group.csv (수동 확인 필요)"
        )
    df = df[~is_dup].copy()

    df["group_id"] = df[group_col].map(grp_map)
    has_group_name = df[group_col].notna() & (df[group_col].astype(str).str.strip() != "")
    unmapped_group = df[has_group_name & df["group_id"].isna()].copy()
    if not unmapped_group.empty:
        unmapped_group.to_csv(ERROR_UNMAPPED_GROUP, index=False, encoding="utf-8-sig")
        warn(f"group_id 매핑 실패 {len(unmapped_group)}건 -> {ERROR_UNMAPPED_GROUP.name}")
    df = df[~(has_group_name & df["group_id"].isna())].copy()
    df["group_id"] = df["group_id"].where(df["group_id"].notna(), None)

    def condition_ok(row):
        cid = row.get("condition_id")
        if pd.isna(cid):
            return True
        return (int(cid), int(row["card_id"])) in cond_valid_pairs

    mask_ok = df.apply(condition_ok, axis=1)
    mismatch = df[~mask_ok].copy()
    if not mismatch.empty:
        mismatch.to_csv(ERROR_CONDITION_MISMATCH, index=False, encoding="utf-8-sig")
        warn(
            f"condition_id가 해당 card_id에 속하지 않는 행 {len(mismatch)}건 -> "
            f"{ERROR_CONDITION_MISMATCH.name}"
        )
    df = df[mask_ok].copy()
    df["condition_id"] = df["condition_id"].where(df["condition_id"].notna(), None)

    total_error = (
        len(unmapped_card)
        + len(unmapped_category)
        + len(dup_rows)
        + len(unmapped_group)
        + len(mismatch)
    )
    log(f"매핑 성공 {len(df)}건 + 오류/보류 {total_error}건 = {len(df) + total_error}건 (원본과 일치해야 정상)")

    df = fix_rate_precision(df)

    return df


def to_records(df: pd.DataFrame) -> list[dict]:
    records = []
    for _, row in df.iterrows():
        rec = {
            "card_id": int(row["card_id"]),
            "category_id": int(row["category_id"]),
            "condition_id": None if row["condition_id"] is None else int(row["condition_id"]),
            "group_id": None if row["group_id"] is None else int(row["group_id"]),
            "rate": None if pd.isna(row.get("rate")) else float(row.get("rate")),
            "fixed_amount": None if pd.isna(row.get("fixed_amount")) else int(row.get("fixed_amount")),
            "raw_text": None if pd.isna(row.get("raw_text")) else str(row.get("raw_text")),
        }
        records.append(rec)
    return records


def insert_records(client: Client, records: list[dict], batch_size: int = 500) -> int:
    inserted = 0
    for i in range(0, len(records), batch_size):
        chunk = records[i : i + batch_size]
        client.table("benefits").insert(chunk).execute()
        inserted += len(chunk)
        log(f"benefits INSERT 진행: {inserted}/{len(records)}")
    return inserted


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--execute",
        action="store_true",
        help="실제로 Supabase에 INSERT를 수행한다. 지정하지 않으면 dry-run(검증만 수행).",
    )
    parser.add_argument("--batch-size", type=int, default=500)
    args = parser.parse_args()

    client = get_client()
    benefits, card_map = load_input_files()
    cat_map, grp_map, cond_valid_pairs, dup_group_names = build_mappings(client)
    valid_df = transform(benefits, card_map, cat_map, grp_map, cond_valid_pairs, dup_group_names)

    valid_df.to_csv(VALID_ROWS_PATH, index=False, encoding="utf-8-sig")
    log(f"매핑 완료된 유효 행 저장 -> {VALID_ROWS_PATH}")

    if not args.execute:
        log("[DRY-RUN 모드] 실제 INSERT는 수행하지 않았습니다.")
        log("검증 결과를 확인 후, 문제가 없으면 --execute 플래그로 다시 실행하세요.")
        return

    records = to_records(valid_df)
    log(f"실제 INSERT 시작: 총 {len(records)}건")
    inserted = insert_records(client, records, batch_size=args.batch_size)
    log(f"[완료] benefits 테이블에 {inserted}건 INSERT 성공")


if __name__ == "__main__":
    main()