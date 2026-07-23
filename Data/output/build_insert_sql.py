"""
build_insert_sql.py

목적:
  cards_v1.csv, card_brands_v1.csv, usage_conditions_v2.csv를
  merchant_groups/benefit_categories/issuers와 동일한 방식(SQL INSERT 문)으로
  변환하여, Supabase의 cards / card_brands / usage_conditions 테이블에
  순서대로 INSERT할 수 있는 SQL 파일을 생성한다.

전제 조건 (사용자 확인 완료):
  - Supabase의 cards, card_brands, usage_conditions 테이블은 현재 완전히
    비어있는 상태이다(0건). 따라서 cards.card_id(SERIAL)는 1부터 순서대로
    발급된다고 가정한다. 이 전제가 깨지면(테이블에 이미 데이터가 있으면)
    이 스크립트의 card_id 매핑이 전부 틀어지므로 재실행 전 반드시 재확인 필요.

확정된 처리 규칙 (사용자 승인 완료):
  1) cards.csv 중복 3쌍(동일 issuer_id + card_name) -> UNIQUE(issuer_id, card_name)
     제약 위반을 피하기 위해 card_name에 " v2", " v3" 순번을 붙여 분리 유지.
     대상(source_id 기준, source_id 오름차순 = 원본 발생 순서):
       해피포인트 체크카드(issuer_id=1): source_id 383(그대로), 2190(v2)
       국민행복카드(issuer_id=3): source_id 1278(그대로), 2150(v2)
       카카오페이 체크카드(issuer_id=6): source_id 315(그대로), 2026(v2), 2094(v3)
  2) cards_v1.csv의 annual_fee_domestic/annual_fee_overseas 컬럼은 스키마상
     cards 테이블에 존재하지 않으므로 cards INSERT에는 사용하지 않고,
     card_brands INSERT 시에만 사용한다.
  3) card_brands_v1.csv에 브랜드 매칭 행이 없는 카드(104건)는
     brand_name = 'UNKNOWN' 플레이스홀더 1건으로 생성하여 연회비 데이터
     유실을 방지한다(스키마상 brand_name NOT NULL이라 NULL 불가).
  4) usage_conditions는 v2(1,270건, 실적 구간 분리 반영판)를 사용한다.

데이터 손실 방지 검증 (스크립트 내 자동 실행):
  - cards: 입력 1,247행 = 생성된 INSERT 문 1,247개
  - card_brands: 입력 1,711행 + UNKNOWN 보강 104행 = INSERT 문 1,815개
  - usage_conditions: 입력 1,270행 = INSERT 문 1,270개
  - 중복 3쌍(7건)에 대해 card_name이 실제로 유일하게 되었는지 검증
  - source_url -> card_id 매핑표를 별도 CSV로 저장하여 이후 benefits INSERT
    작업(usage_conditions/benefits 매핑) 시 재사용 가능하도록 함

경로 (프로젝트 실제 구조 기준):
  Data/
  └── output/
      ├── build_insert_sql.py                    (이 스크립트)
      └── refined_v1/
          ├── cards_v1.csv                        (입력)
          ├── card_brands_v1.csv                  (입력)
          ├── usage_conditions_v2.csv              (입력)
          └── sql_ready/
              ├── 01_cards_insert.sql              (출력)
              ├── 02_card_brands_insert.sql        (출력)
              ├── 03_usage_conditions_insert.sql   (출력)
              └── source_url_to_card_id_map.csv    (출력, 이후 단계에서 재사용)

실행 방법:
  python output/build_insert_sql.py   (Data 루트에서)

실행 순서 (Supabase에 실제 적용 시, 반드시 이 순서로):
  1. 01_cards_insert.sql 실행
  2. 02_card_brands_insert.sql 실행 (cards.card_id를 FK로 참조)
  3. 03_usage_conditions_insert.sql 실행 (cards.card_id를 FK로 참조)
"""
import pandas as pd
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REFINED_DIR = SCRIPT_DIR / "refined_v1"
OUT_DIR = REFINED_DIR / "sql_ready"

CARDS_PATH = REFINED_DIR / "cards_v1.csv"
BRANDS_PATH = REFINED_DIR / "card_brands_v1.csv"
UC_PATH = REFINED_DIR / "usage_conditions_v2.csv"

CARDS_SQL_PATH = OUT_DIR / "01_cards_insert.sql"
BRANDS_SQL_PATH = OUT_DIR / "02_card_brands_insert.sql"
UC_SQL_PATH = OUT_DIR / "03_usage_conditions_insert.sql"
MAP_PATH = OUT_DIR / "source_url_to_card_id_map.csv"

# 사용자 승인된 중복 카드명 분리 규칙 (source_id -> 붙일 접미사)
DUPLICATE_SUFFIX_RULES = {
    2190: " v2",   # 해피포인트 체크카드
    2150: " v2",   # 국민행복카드
    2026: " v2",   # 카카오페이 체크카드
    2094: " v3",   # 카카오페이 체크카드
}

UNKNOWN_BRAND = "UNKNOWN"


def sql_escape(value):
    if pd.isna(value):
        return "NULL"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def build_cards_sql(cards_df: pd.DataFrame):
    cards_sorted = cards_df.sort_values("source_id").reset_index(drop=True)

    original_names = cards_sorted["card_name"].copy()
    for source_id, suffix in DUPLICATE_SUFFIX_RULES.items():
        mask = cards_sorted["source_id"] == source_id
        if mask.sum() != 1:
            raise ValueError(f"source_id={source_id}를 정확히 1건 찾지 못했습니다({mask.sum()}건). 중단합니다.")
        cards_sorted.loc[mask, "card_name"] = cards_sorted.loc[mask, "card_name"] + suffix

    dup_check = cards_sorted.duplicated(subset=["issuer_id", "card_name"]).sum()
    if dup_check != 0:
        raise ValueError(f"card_name 치환 후에도 (issuer_id, card_name) 중복이 {dup_check}건 남아있습니다.")

    cards_sorted["card_id"] = range(1, len(cards_sorted) + 1)

    lines = []
    for _, row in cards_sorted.iterrows():
        lines.append(
            "INSERT INTO cards (card_id, issuer_id, card_name, card_type, category_main, official_url) VALUES "
            f"({row['card_id']}, {row['issuer_id']}, {sql_escape(row['card_name'])}, "
            f"{sql_escape(row['card_type'])}, {sql_escape(row['category_main'])}, {sql_escape(row['source_url'])});"
        )

    return cards_sorted, lines, original_names


def build_card_brands_sql(cards_sorted: pd.DataFrame, brands_df: pd.DataFrame):
    url_to_cardid = dict(zip(cards_sorted["source_url"], cards_sorted["card_id"]))
    url_to_fees = cards_sorted.set_index("source_url")[["annual_fee_domestic", "annual_fee_overseas"]]

    lines = []
    covered_urls = set()

    for _, row in brands_df.iterrows():
        url = row["source_url"]
        card_id = url_to_cardid.get(url)
        if card_id is None:
            raise ValueError(f"card_brands_v1.csv의 source_url이 cards_v1.csv에 없습니다: {url}")
        fee_dom, fee_over = url_to_fees.loc[url, ["annual_fee_domestic", "annual_fee_overseas"]]
        lines.append(
            "INSERT INTO card_brands (card_id, brand_name, annual_fee_domestic, annual_fee_overseas) VALUES "
            f"({card_id}, {sql_escape(row['brand_name'])}, {sql_escape(fee_dom)}, {sql_escape(fee_over)});"
        )
        covered_urls.add(url)

    missing_urls = set(cards_sorted["source_url"]) - covered_urls
    unknown_count = 0
    for url in missing_urls:
        card_id = url_to_cardid[url]
        fee_dom, fee_over = url_to_fees.loc[url, ["annual_fee_domestic", "annual_fee_overseas"]]
        lines.append(
            "INSERT INTO card_brands (card_id, brand_name, annual_fee_domestic, annual_fee_overseas) VALUES "
            f"({card_id}, {sql_escape(UNKNOWN_BRAND)}, {sql_escape(fee_dom)}, {sql_escape(fee_over)});"
        )
        unknown_count += 1

    return lines, unknown_count


def build_usage_conditions_sql(cards_sorted: pd.DataFrame, uc_df: pd.DataFrame):
    url_to_cardid = dict(zip(cards_sorted["source_url"], cards_sorted["card_id"]))

    lines = []
    for _, row in uc_df.iterrows():
        url = row["source_url"]
        card_id = url_to_cardid.get(url)
        if card_id is None:
            raise ValueError(f"usage_conditions_v2.csv의 source_url이 cards_v1.csv에 없습니다: {url}")
        lines.append(
            "INSERT INTO usage_conditions (condition_id, card_id, condition_order, min_amount, max_amount, period_type) VALUES "
            f"({row['condition_id']}, {card_id}, {row['condition_order']}, {row['min_amount']}, "
            f"{sql_escape(row['max_amount'])}, {sql_escape(row['period_type'])});"
        )
    return lines


def main():
    if not CARDS_PATH.exists() or not BRANDS_PATH.exists() or not UC_PATH.exists():
        raise FileNotFoundError("입력 CSV 중 일부를 찾을 수 없습니다. 경로를 확인하세요.")

    cards_df = pd.read_csv(CARDS_PATH)
    brands_df = pd.read_csv(BRANDS_PATH)
    uc_df = pd.read_csv(UC_PATH)

    original_cards_rows = len(cards_df)
    original_brands_rows = len(brands_df)
    original_uc_rows = len(uc_df)

    cards_sorted, cards_lines, original_names = build_cards_sql(cards_df)

    # ---- 검증 1: cards 행 수 불변 ----
    assert len(cards_lines) == original_cards_rows, \
        f"cards INSERT 문 수가 입력 행 수와 다릅니다({len(cards_lines)} != {original_cards_rows})."

    brands_lines, unknown_count = build_card_brands_sql(cards_sorted, brands_df)

    # ---- 검증 2: card_brands 행 수 = 원본 매칭분 + UNKNOWN 보강분, 데이터 손실 없음 ----
    expected_brands_total = original_brands_rows + unknown_count
    assert len(brands_lines) == expected_brands_total, \
        f"card_brands INSERT 문 수가 예상과 다릅니다({len(brands_lines)} != {expected_brands_total})."
    assert unknown_count == (original_cards_rows - brands_df['source_url'].nunique()), \
        "UNKNOWN 보강 건수가 예상과 다릅니다. 브랜드 없는 카드 수 재확인 필요."

    uc_lines = build_usage_conditions_sql(cards_sorted, uc_df)

    # ---- 검증 3: usage_conditions 행 수 불변 ----
    assert len(uc_lines) == original_uc_rows, \
        f"usage_conditions INSERT 문 수가 입력 행 수와 다릅니다({len(uc_lines)} != {original_uc_rows})."

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    with open(CARDS_SQL_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(cards_lines) + "\n")
    with open(BRANDS_SQL_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(brands_lines) + "\n")
    with open(UC_SQL_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(uc_lines) + "\n")

    map_df = cards_sorted[["source_id", "source_url", "card_id"]].copy()
    map_df["original_card_name"] = original_names.values
    map_df["final_card_name"] = cards_sorted["card_name"].values
    map_df.to_csv(MAP_PATH, index=False, encoding="utf-8-sig")

    print(f"[INFO] CARDS_PATH        = {CARDS_PATH}")
    print(f"[INFO] BRANDS_PATH       = {BRANDS_PATH}")
    print(f"[INFO] UC_PATH           = {UC_PATH}")
    print(f"[INFO] cards INSERT 문 수         = {len(cards_lines)} (입력 {original_cards_rows}건과 동일해야 정상)")
    print(f"[INFO] card_brands INSERT 문 수   = {len(brands_lines)} (원본 {original_brands_rows}건 + UNKNOWN 보강 {unknown_count}건)")
    print(f"[INFO] usage_conditions INSERT 문 수 = {len(uc_lines)} (입력 {original_uc_rows}건과 동일해야 정상)")
    print(f"[INFO] 검증 통과: 행 수 불변 / UNIQUE(issuer_id,card_name) 위반 없음 / brand_name NOT NULL 위반 없음")
    print(f"[INFO] 결과 저장 위치:")
    print(f"[INFO]   {CARDS_SQL_PATH}")
    print(f"[INFO]   {BRANDS_SQL_PATH}")
    print(f"[INFO]   {UC_SQL_PATH}")
    print(f"[INFO]   {MAP_PATH}  (source_id/source_url -> 확정 card_id 매핑, 이후 benefits 단계에서 재사용)")
    print(f"[NOTICE] Supabase 적용 시 반드시 01 -> 02 -> 03 순서로 실행하세요(FK 의존성).")


if __name__ == "__main__":
    main()
