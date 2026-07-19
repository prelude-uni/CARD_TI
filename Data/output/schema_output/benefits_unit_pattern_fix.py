"""
benefits_unit_pattern_fix.py

목적:
  기존 정규화 스크립트(card_data_normalizer_v2.py)의 마일리지/포인트 "원당" 패턴이
  "만원당"(예: '2만원당 400마일리지', '2만원당 스타벅스 리워드 별 1개 적립') 형태를
  인식하지 못해 발생한 오분류 3건을 정확히 재파싱하여 교정한다.

  - benefits.csv (card_id=2475, 마일리지 400을 rate=400.0으로 잘못 기록)
  - benefits_recovered.csv (card_id=2953, 2건. '2만원'을 fixed_amount=20000으로 잘못 기록)

원칙:
  - 기존 schema_output/benefits.csv, benefits_recovered.csv는 절대 덮어쓰지 않는다.
  - 새 파일(benefits_patched.csv, benefits_recovered_patched.csv, unit_pattern_fix_log.csv)만 생성한다.
  - 전체 재정규화를 하지 않고, "만원당" 패턴에 걸리는 행만 정밀 재파싱하여 교정한다.
  - 패턴에 걸리지 않는 나머지 행은 원본 그대로 복사한다(데이터 유실 없음 보장).

입력 경로:
  schema_output/benefits.csv
  schema_output/benefits_recovered.csv

출력 경로:
  schema_output/benefits_patched.csv
  schema_output/benefits_recovered_patched.csv
  schema_output/unit_pattern_fix_log.csv
"""
import re, csv, os

INPUT_DIR = "schema_output"
OUTPUT_DIR = "schema_output"

FIELDNAMES = ["card_id", "min_amount", "min_amount_source", "category_id",
              "group_name", "benefit_type", "rate", "fixed_amount", "unit_basis", "raw_text"]

# "2만원당 400마일리지" 형태 -> unit_basis=20000, rate=400 (개수), benefit_type=MILEAGE
MANWON_MILEAGE_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*만\s*원\s*당\s*(\d+(?:\.\d+)?)\s*(?:~\s*\d+(?:\.\d+)?\s*)?마일리지")

# "2만원당 스타벅스 리워드 별 1개 적립" 형태 -> unit_basis=20000, rate=1(개수), benefit_type=POINT_PER_UNIT
MANWON_COUNT_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*만\s*원\s*당\s*.{0,10}?(\d+(?:\.\d+)?)\s*개\s*적립")

# "1만원당 1,500원 청구 할인" 형태(정상 FIXED_AMOUNT, 오분류 아님) -> 그대로 유지, 오탐 방지용 제외 패턴
MANWON_FIXED_WON_PATTERN = re.compile(r"만\s*원\s*당\s*[\d,]+\s*원")


def try_repatch_row(row):
    """
    '만원당' 패턴에 걸리는 행만 정밀 재파싱한다.
    반환값: (patched_row, reason) 또는 (None, None) - 교정 대상이 아니면 None.
    """
    text = row["raw_text"] or ""

    if "만원당" not in text and "만 원 당" not in text and re.search(r"만\s*원\s*당", text) is None:
        return None, None

    # 이미 정상적으로 처리된 '만원당 OOO원 할인/캐시백' 형태는 오분류가 아니므로 건드리지 않음
    if MANWON_FIXED_WON_PATTERN.search(text) and row["benefit_type"] == "FIXED_AMOUNT":
        return None, None

    m = MANWON_MILEAGE_PATTERN.search(text)
    if m:
        unit_manwon = float(m.group(1))
        mileage_count = float(m.group(2))
        new_row = dict(row)
        new_row["benefit_type"] = "MILEAGE"
        new_row["rate"] = mileage_count
        new_row["fixed_amount"] = None
        new_row["unit_basis"] = int(unit_manwon * 10000)
        return new_row, "MANWON_MILEAGE_UNIT_RECOVERED"

    m = MANWON_COUNT_PATTERN.search(text)
    if m:
        unit_manwon = float(m.group(1))
        count = float(m.group(2))
        new_row = dict(row)
        new_row["benefit_type"] = "POINT_PER_UNIT"
        new_row["rate"] = count
        new_row["fixed_amount"] = None
        new_row["unit_basis"] = int(unit_manwon * 10000)
        return new_row, "MANWON_COUNT_UNIT_RECOVERED"

    return None, None


def patch_file(input_path):
    with open(input_path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    patched_rows = []
    log_entries = []

    for row in rows:
        new_row, reason = try_repatch_row(row)
        if new_row is not None:
            log_entries.append({
                "source_file": os.path.basename(input_path),
                "card_id": row["card_id"],
                "raw_text": row["raw_text"],
                "before_benefit_type": row["benefit_type"],
                "before_rate": row["rate"],
                "before_fixed_amount": row["fixed_amount"],
                "after_benefit_type": new_row["benefit_type"],
                "after_rate": new_row["rate"],
                "after_unit_basis": new_row["unit_basis"],
                "reason": reason,
            })
            patched_rows.append(new_row)
        else:
            patched_rows.append(row)

    return patched_rows, log_entries


def write_csv(rows, path, fieldnames):
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in rows:
            writer.writerow(r)


def main():
    targets = [
        ("benefits.csv", "benefits_patched.csv"),
        ("benefits_recovered.csv", "benefits_recovered_patched.csv"),
    ]

    all_logs = []
    for input_name, output_name in targets:
        input_path = os.path.join(INPUT_DIR, input_name)
        if not os.path.exists(input_path):
            print(f"건너뜀 (파일 없음): {input_path}")
            continue

        patched_rows, log_entries = patch_file(input_path)
        output_path = os.path.join(OUTPUT_DIR, output_name)
        write_csv(patched_rows, output_path, FIELDNAMES)
        all_logs.extend(log_entries)

        print(f"{input_name}: 전체 {len(patched_rows)}건 중 {len(log_entries)}건 교정 -> {output_path}")

    log_path = os.path.join(OUTPUT_DIR, "unit_pattern_fix_log.csv")
    log_fieldnames = ["source_file", "card_id", "raw_text", "before_benefit_type", "before_rate",
                       "before_fixed_amount", "after_benefit_type", "after_rate", "after_unit_basis", "reason"]
    write_csv(all_logs, log_path, log_fieldnames)
    print(f"교정 로그: {log_path} ({len(all_logs)}건)")


if __name__ == "__main__":
    main()
