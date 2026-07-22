"""
supabase_uploader.py

목적:
  schema_output/final/ 안의 최종 4개 CSV 파일을 Supabase의 4개 테이블에 업로드한다.

  - merchant_groups.csv        -> merchant_groups 테이블 (38건)
  - cards_corrected_v2.csv     -> cards 테이블         (1,274건)
  - card_brands_v2.csv         -> card_brands 테이블   (1,830건)
  - benefits_consolidated.csv  -> benefits 테이블      (3,369건)

  FK(외래키) 제약 때문에 반드시 이 순서로 업로드해야 한다.
  (merchant_groups, cards가 먼저 있어야 card_brands, benefits가 참조 가능)

  Supabase REST API(PostgREST)는 한 번에 너무 많은 행을 보내면 실패할 수 있으므로
  배치(batch) 단위로 나누어 insert한다. 이미 존재하는 데이터와 충돌하지 않도록
  실행 전 각 테이블을 TRUNCATE(비우기)한 뒤 새로 적재한다(재실행 가능하게 함).

사전 준비:
  pip install supabase python-dotenv pandas
  Data/.env 파일에 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY가 설정되어 있어야 한다.
  (service_role 키를 사용해야 RLS 정책과 무관하게 적재 가능)

경로 규칙:
  이 파일은 "<project>/Data/" 안에 위치한다고 가정한다. __file__ 기준으로
  .env와 schema_output/final/ 경로를 계산하므로 실행 위치와 무관하게 동작한다.

실행 방법:
  python "<project>/Data/supabase_uploader.py"
"""
import os
import math
import pandas as pd
from dotenv import load_dotenv
from supabase import create_client

BASE_DIR = os.path.dirname(os.path.abspath(__file__))          # .../Data
FINAL_DIR = os.path.join(BASE_DIR, "output", "schema_output", "final")
ENV_PATH = os.path.join(BASE_DIR, ".env")

load_dotenv(ENV_PATH)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError(".env에서 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY를 찾을 수 없습니다.")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

BATCH_SIZE = 500

TABLES = [
    {
        "csv": "merchant_groups.csv",
        "table": "merchant_groups",
        "columns": ["group_id", "group_name"],
    },
    {
        "csv": "cards_corrected_v2.csv",
        "table": "cards",
        "columns": ["card_id", "issuer_code", "card_name", "card_type", "status", "official_url"],
    },
    {
        "csv": "card_brands_v2.csv",
        "table": "card_brands",
        "columns": ["card_id", "brand_name", "annual_fee_domestic", "annual_fee_overseas"],
    },
    {
        "csv": "benefits_consolidated.csv",
        "table": "benefits",
        "columns": ["benefit_id", "card_id", "min_amount", "min_amount_source", "category_id",
                    "group_name", "benefit_type", "rate", "fixed_amount", "unit_basis",
                    "unit_type", "raw_text", "classification_status"],
    },
]


def clean_records(df, columns):
    """NaN을 JSON 호환 None으로 변환하고, 필요한 컬럼만 남긴다."""
    df = df[columns].copy()
    df = df.where(pd.notnull(df), None)
    return df.to_dict(orient="records")


def upload_table(spec):
    csv_path = os.path.join(FINAL_DIR, spec["csv"])
    df = pd.read_csv(csv_path)
    records = clean_records(df, spec["columns"])
    total = len(records)
    table_name = spec["table"]

    print(f"[{table_name}] 기존 데이터 삭제 중...")
    supabase.table(table_name).delete().neq(spec["columns"][0], -999999999).execute()

    print(f"[{table_name}] 총 {total}건 업로드 시작 (배치 크기 {BATCH_SIZE})")
    n_batches = math.ceil(total / BATCH_SIZE)
    for i in range(n_batches):
        batch = records[i * BATCH_SIZE : (i + 1) * BATCH_SIZE]
        supabase.table(table_name).insert(batch).execute()
        print(f"  배치 {i+1}/{n_batches} 완료 ({len(batch)}건)")

    count_result = supabase.table(table_name).select("*", count="exact").limit(1).execute()
    print(f"[{table_name}] 업로드 완료. DB 내 현재 행 수: {count_result.count}건 (기대값: {total}건)")
    assert count_result.count == total, f"{table_name} 건수 불일치! DB={count_result.count}, CSV={total}"
    print()


def main():
    for spec in TABLES:
        upload_table(spec)
    print("=== 전체 업로드 완료 ===")


if __name__ == "__main__":
    main()
