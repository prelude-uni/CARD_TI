"""
update_card_official_url.py
목적: cards.official_url을 해당 카드의 issuer(카드사)의
      issuers.homepage_url 값으로 일괄 매핑한다.

기본 실행은 --dry-run (DB에 아무것도 쓰지 않고 백업/리포트만 생성).
실제 반영은 --execute 플래그를 명시해야만 수행된다.
"""

import argparse
import os
import sys
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from supabase import create_client, Client

BASE_DIR = Path(__file__).resolve().parent  # Data/output/refined_v1
ENV_PATH = BASE_DIR.parent.parent / ".env"   # Data/.env
OUT_DIR = BASE_DIR / "sql_ready"
OUT_DIR.mkdir(parents=True, exist_ok=True)

BACKUP_PATH = OUT_DIR / "cards_official_url_backup.csv"
SKIPPED_ISSUERS_PATH = OUT_DIR / "official_url_skipped_issuers.csv"
PLAN_PATH = OUT_DIR / "official_url_update_plan.csv"


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


def build_plan(client: Client):
    cards_df = fetch_all_rows(client, "cards", "card_id,issuer_id,official_url")
    issuers_df = fetch_all_rows(client, "issuers", "issuer_id,issuer_name,homepage_url")

    cards_df.to_csv(BACKUP_PATH, index=False, encoding="utf-8-sig")
    log(f"기존 cards.official_url 백업 완료 -> {BACKUP_PATH.name}")

    missing = issuers_df[
        issuers_df["homepage_url"].isna() | (issuers_df["homepage_url"].astype(str).str.strip() == "")
    ]
    if not missing.empty:
        missing.to_csv(SKIPPED_ISSUERS_PATH, index=False, encoding="utf-8-sig")
        warn(
            f"homepage_url이 비어 있는 issuer {len(missing)}건 발견 -> "
            f"{SKIPPED_ISSUERS_PATH.name} (해당 카드사 소속 카드는 업데이트에서 제외)"
        )

    valid_issuers = issuers_df[~issuers_df["issuer_id"].isin(missing["issuer_id"])]

    plan_rows = []
    for _, row in valid_issuers.iterrows():
        n_cards = (cards_df["issuer_id"] == row["issuer_id"]).sum()
        plan_rows.append(
            {
                "issuer_id": row["issuer_id"],
                "issuer_name": row["issuer_name"],
                "homepage_url": row["homepage_url"],
                "affected_card_count": n_cards,
            }
        )
    plan_df = pd.DataFrame(plan_rows)
    plan_df.to_csv(PLAN_PATH, index=False, encoding="utf-8-sig")
    log(f"업데이트 계획 저장 -> {PLAN_PATH.name}")
    log(f"총 {plan_df['affected_card_count'].sum()}건의 카드가 업데이트 대상입니다.")

    return plan_df


def execute_update(client: Client, plan_df: pd.DataFrame):
    total_updated = 0
    for _, row in plan_df.iterrows():
        resp = (
            client.table("cards")
            .update({"official_url": row["homepage_url"]})
            .eq("issuer_id", int(row["issuer_id"]))
            .execute()
        )
        updated = len(resp.data)
        total_updated += updated
        log(f"issuer_id={row['issuer_id']} ({row['issuer_name']}) -> {updated}건 업데이트")
    log(f"[완료] 총 {total_updated}건의 cards.official_url 업데이트 성공")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--execute",
        action="store_true",
        help="실제로 UPDATE를 수행한다. 지정하지 않으면 dry-run(백업/계획만 생성).",
    )
    args = parser.parse_args()

    client = get_client()
    plan_df = build_plan(client)

    if not args.execute:
        log("[DRY-RUN 모드] 실제 UPDATE는 수행하지 않았습니다.")
        log(f"{PLAN_PATH.name}과 {BACKUP_PATH.name}을 검토한 후, 문제가 없으면 --execute로 재실행하세요.")
        return

    if plan_df.empty or plan_df["affected_card_count"].sum() == 0:
        warn("업데이트 대상이 없습니다. issuers.homepage_url 값을 먼저 채워주세요.")
        return

    execute_update(client, plan_df)


if __name__ == "__main__":
    main()