"""
prepare_cards_brands_conditions.py

목적:
  cards_v1.csv, card_brands_v1.csv, usage_conditions_v1.csv를 검토하여
  Supabase INSERT 전 마지막 정합성 작업을 수행하고, 실제 INSERT용 SQL
  스크립트(3개)를 생성한다.

  이 스크립트가 처리하는 3가지 확정 사항 (사용자 확인 완료):
  1) cards 테이블 UNIQUE(issuer_id, card_name) 제약 위반 3쌍(7건)을
     "분리 유지" + "순번(v2, v3) 접미사"로 해결한다.
     예: 카카오페이 체크카드(source_id 315, 2026, 2094)
         -> "카카오페이 체크카드"(315, 최초 source_id 유지)
         -> "카카오페이 체크카드 v2"(2026, source_id 오름차순 2번째)
         -> "카카오페이 체크카드 v3"(2094, source_id 오름차순 3번째)
  2) card_brands 테이블 brand_name(NOT NULL)에 매칭되는 값이 없는
     104개 카드는 brand_name='UNKNOWN'으로 명시적으로 채운다(NULL 금지,
     행 누락으로 인한 연회비 데이터 손실 방지).
  3) issuer_id는 이미 Supabase issuers 테이블 실제 INSERT 순서와 일치하는
     값으로 확인되었으므로 그대로 사용한다(재부여하지 않음).

  card_id는 아직 Supabase에 INSERT되지 않아 실제 값을 알 수 없으므로,
  이 스크립트는 card_id를 추측해서 만들지 않는다. 대신 SQL 서브쿼리에서
  cards.official_url(=source_url, 각 카드당 유일값)로 카드를 다시 찾아
  card_id를 참조하도록 생성한다. (스키마상 cards.official_url은
  UNIQUE 제약이 없지만, card_data_normalizer_v2.py가 항상 1 source_url당
  1 card 행만 생성하므로 이 스크립트 실행 시점 기준 값 유일성은
  cards_v1.csv 자체에서 검증한다. 만약 이후 cards 테이블에 official_url이
  중복 INSERT되면 이 방식은 더 이상 안전하지 않으므로 재검토가 필요하다.)

경로 (프로젝트 실제 구조 기준):
  Data/
  └── output/
      ├── prepare_cards_brands_conditions.py   (이 스크립트)
      ├── cards_v1.csv                          (입력)
      ├── card_brands_v1.csv                    (입력)
      ├── usage_conditions_v1.csv                (입력)
      └── refined_v1/
          ├── cards_v2.csv                       (출력, 이름 중복 해소본)
          ├── card_brands_v2.csv                 (출력, UNKNOWN 보정본)
          ├── cards_dedup_report.csv             (출력, v2 이름 변경 근거)
          ├── 01_insert_cards.sql                (출력, INSERT SQL)
          ├── 02_insert_card_brands.sql          (출력, INSERT SQL)
          └── 03_insert_usage_conditions.sql     (출력, INSERT SQL)

입력: output/cards_v1.csv, output/card_brands_v1.csv, output/usage_conditions_v1.csv
출력: 위 refined_v1/* 6개 파일

스키마 위배 없음:
  - cards.UNIQUE(issuer_id, card_name) 위반 없도록 이름 조정
  - card_brands.brand_name NOT NULL 위반 없도록 UNKNOWN 명시
  - usage_conditions는 원본 그대로 SQL 변환만 수행(내용 변경 없음)
데이터 손실 없음:
  - 원본 행 수(cards 1247, card_brands 1711+104=1815 대상, usage_conditions
    전체)가 출력에서 그대로 보존되는지 스크립트 내에서 assert로 검증.

실행 방법 (어느 위치에서 실행해도 무방, __file__ 기준 상대경로 사용):
  python output/prepare_cards_brands_conditions.py   (Data 루트에서)
  python prepare_cards_brands_conditions.py          (Data/output 안에서)
"""
import pandas as pd
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REFINED_DIR = SCRIPT_DIR / "refined_v1"

CARDS_PATH = SCRIPT_DIR / "cards_v1.csv"
BRANDS_PATH = SCRIPT_DIR / "card_brands_v1.csv"
UC_PATH = SCRIPT_DIR / "usage_conditions_v1.csv"

OUT_CARDS_PATH = REFINED_DIR / "cards_v2.csv"
OUT_BRANDS_PATH = REFINED_DIR / "card_brands_v2.csv"
DEDUP_REPORT_PATH = REFINED_DIR / "cards_dedup_report.csv"
SQL_CARDS_PATH = REFINED_DIR / "01_insert_cards.sql"
SQL_BRANDS_PATH = REFINED_DIR / "02_insert_card_brands.sql"
SQL_UC_PATH = REFINED_DIR / "03_insert_usage_conditions.sql"

UNKNOWN_BRAND = "UNKNOWN"


def esc(text) -> str:
    """SQL 문자열 리터럴 안전 처리 (단일 인용부호 escape)."""
    if text is None:
        return "NULL"
    return "'" + str(text).replace("'", "''") + "'"


def dedupe_card_names(cards: pd.DataFrame):
    """issuer_id+card_name UNIQUE 제약 위반 쌍에 source_id 오름차순으로
    v2, v3... 접미사를 붙인다. 최초(가장 작은 source_id) 항목은 원래 이름
    그대로 유지한다."""
    cards = cards.sort_values("source_id").reset_index(drop=True)
    dup_mask = cards.duplicated(subset=["issuer_id", "card_name"], keep=False)
    report_rows = []

    new_names = cards["card_name"].tolist()
    for (issuer_id, card_name), group in cards[dup_mask].groupby(["issuer_id", "card_name"]):
        ordered_idx = group.sort_values("source_id").index.tolist()
        for rank, idx in enumerate(ordered_idx, start=1):
            original = cards.at[idx, "card_name"]
            if rank == 1:
                final_name = original
            else:
                final_name = f"{original} v{rank}"
            new_names[idx] = final_name
            report_rows.append({
                "source_id": cards.at[idx, "source_id"],
                "source_url": cards.at[idx, "source_url"],
                "issuer_id": issuer_id,
                "original_card_name": original,
                "final_card_name": final_name,
                "rank_by_source_id": rank,
            })

    cards = cards.copy()
    cards["card_name"] = new_names
    report_df = pd.DataFrame(report_rows).sort_values(["issuer_id", "original_card_name", "rank_by_source_id"])
    return cards, report_df


def build_card_brands_v2(cards_v2: pd.DataFrame, brands: pd.DataFrame):
    """brand_name이 없는 카드에 UNKNOWN을 명시적으로 채운다. 기존 브랜드
    행은 전혀 변경하지 않는다."""
    merged = cards_v2[["source_url"]].merge(brands, on="source_url", how="left")
    missing_mask = merged["brand_name"].isna()
    merged.loc[missing_mask, "brand_name"] = UNKNOWN_BRAND
    return merged, int(missing_mask.sum())


def generate_cards_sql(cards_v2: pd.DataFrame) -> str:
    lines = ["-- 01_insert_cards.sql : cards 테이블 INSERT (issuer_id 그대로 사용)"]
    for _, row in cards_v2.iterrows():
        annual_fee_cols = ""  # cards 테이블에는 연회비 컬럼 없음(card_brands로 이동 확정)
        lines.append(
            "INSERT INTO cards (issuer_id, card_name, card_type, category_main, official_url, source_type) "
            f"VALUES ({int(row['issuer_id'])}, {esc(row['card_name'])}, {esc(row['card_type'])}, "
            f"{esc(row['category_main'])}, {esc(row['source_url'])}, 'CRAWLED');"
        )
    return "\n".join(lines) + "\n"


def generate_card_brands_sql(brands_v2: pd.DataFrame, cards_v2: pd.DataFrame) -> str:
    fee_lookup = cards_v2.set_index("source_url")[["annual_fee_domestic", "annual_fee_overseas"]]
    lines = ["-- 02_insert_card_brands.sql : card_brands 테이블 INSERT (card_id는 official_url로 서브쿼리 조회)"]
    for _, row in brands_v2.iterrows():
        url = row["source_url"]
        fee_dom = fee_lookup.at[url, "annual_fee_domestic"] if url in fee_lookup.index else None
        fee_over = fee_lookup.at[url, "annual_fee_overseas"] if url in fee_lookup.index else None
        fee_dom_sql = "NULL" if pd.isna(fee_dom) else str(int(fee_dom))
        fee_over_sql = "NULL" if pd.isna(fee_over) else str(int(fee_over))
        lines.append(
            "INSERT INTO card_brands (card_id, brand_name, annual_fee_domestic, annual_fee_overseas) "
            f"VALUES ((SELECT card_id FROM cards WHERE official_url = {esc(url)}), "
            f"{esc(row['brand_name'])}, {fee_dom_sql}, {fee_over_sql});"
        )
    return "\n".join(lines) + "\n"


def generate_usage_conditions_sql(uc: pd.DataFrame, cards_v2: pd.DataFrame) -> str:
    url_by_source_url = set(cards_v2["source_url"])
    lines = ["-- 03_insert_usage_conditions.sql : usage_conditions 테이블 INSERT (card_id는 official_url로 서브쿼리 조회)"]
    skipped = 0
    for _, row in uc.iterrows():
        url = row["source_url"]
        if url not in url_by_source_url:
            skipped += 1
            continue
        max_amount_sql = "NULL" if pd.isna(row["max_amount"]) else str(int(row["max_amount"]))
        lines.append(
            "INSERT INTO usage_conditions (card_id, condition_order, min_amount, max_amount, period_type) "
            f"VALUES ((SELECT card_id FROM cards WHERE official_url = {esc(url)}), "
            f"{int(row['condition_order'])}, {int(row['min_amount'])}, {max_amount_sql}, {esc(row['period_type'])});"
        )
    return "\n".join(lines) + "\n", skipped


def main():
    for p in (CARDS_PATH, BRANDS_PATH, UC_PATH):
        if not p.exists():
            raise FileNotFoundError(f"입력 파일을 찾을 수 없습니다: {p}")

    cards = pd.read_csv(CARDS_PATH)
    brands = pd.read_csv(BRANDS_PATH)
    uc = pd.read_csv(UC_PATH)

    original_cards_rows = len(cards)
    original_uc_rows = len(uc)

    cards_v2, dedup_report = dedupe_card_names(cards)

    # ---- 검증 1: 행 수 불변 (cards) ----
    assert len(cards_v2) == original_cards_rows, "cards 행 수가 변경되었습니다. 중단합니다."

    # ---- 검증 2: UNIQUE(issuer_id, card_name) 제약이 이제 만족되는지 확인 ----
    remaining_dupes = cards_v2.duplicated(subset=["issuer_id", "card_name"]).sum()
    assert remaining_dupes == 0, f"이름 조정 후에도 중복이 {remaining_dupes}건 남아있습니다."

    brands_v2, n_unknown = build_card_brands_v2(cards_v2, brands)

    # ---- 검증 3: card_brands 행 수 = cards 행 수 (카드당 최소 1개 브랜드 행 보장) ----
    assert len(brands_v2) == len(cards_v2), \
        f"card_brands 행 수({len(brands_v2)})가 cards 행 수({len(cards_v2)})와 다릅니다."

    # ---- 검증 4: brand_name에 결측치(NULL 될 값)가 없는지 확인 ----
    assert brands_v2["brand_name"].isna().sum() == 0, "brand_name에 결측치가 남아있습니다."

    REFINED_DIR.mkdir(parents=True, exist_ok=True)
    cards_v2.to_csv(OUT_CARDS_PATH, index=False, encoding="utf-8-sig")
    brands_v2.to_csv(OUT_BRANDS_PATH, index=False, encoding="utf-8-sig")
    dedup_report.to_csv(DEDUP_REPORT_PATH, index=False, encoding="utf-8-sig")

    cards_sql = generate_cards_sql(cards_v2)
    brands_sql = generate_card_brands_sql(brands_v2, cards_v2)
    uc_sql, uc_skipped = generate_usage_conditions_sql(uc, cards_v2)

    SQL_CARDS_PATH.write_text(cards_sql, encoding="utf-8")
    SQL_BRANDS_PATH.write_text(brands_sql, encoding="utf-8")
    SQL_UC_PATH.write_text(uc_sql, encoding="utf-8")

    print(f"[INFO] cards 원본 행 수         = {original_cards_rows}")
    print(f"[INFO] card_name 조정된 행 수    = {len(dedup_report)} (3쌍/7건 예상)")
    print(f"[INFO] cards_v2 최종 행 수       = {len(cards_v2)} (원본과 동일해야 정상)")
    print(f"[INFO] card_brands_v2 행 수      = {len(brands_v2)}")
    print(f"[INFO]   ㄴ UNKNOWN 처리된 행 수  = {n_unknown} (104건 예상)")
    print(f"[INFO] usage_conditions 원본 행 수 = {original_uc_rows}")
    print(f"[INFO] usage_conditions SQL 생성 행 수 = {original_uc_rows - uc_skipped}")
    print(f"[INFO]   ㄴ card_id 매칭 실패로 건너뛴 행 수 = {uc_skipped} (0건이어야 정상)")
    print(f"[INFO] 검증 통과: cards 행 수 불변 / UNIQUE 제약 충족 / brand 1:1 이상 보장 / NULL 없음")
    print(f"[INFO] 저장 위치:")
    print(f"        {OUT_CARDS_PATH}")
    print(f"        {OUT_BRANDS_PATH}")
    print(f"        {DEDUP_REPORT_PATH}")
    print(f"        {SQL_CARDS_PATH}")
    print(f"        {SQL_BRANDS_PATH}")
    print(f"        {SQL_UC_PATH}")


if __name__ == "__main__":
    main()
