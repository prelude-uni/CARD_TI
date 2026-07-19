"""
benefits_unit_pattern_fix_v2.py

목적:
  benefits_patched.csv / benefits_recovered_patched.csv 안에서 MILEAGE 타입인데
  unit_basis가 NULL로 남아있는 13건을 대상으로, 아래 세 가지 미처리 패턴을 추가 인식하여 보강한다.

  1) "1,000원당 (스카이패스) 1 마일리지" - 쉼표 포함 원화 표기 + 브랜드명 괄호가 숫자 사이에 끼어있어 미매칭
  2) "1천원당 1마일리지" - 한글 혼합 숫자표기(천원당)
  3) "리터당 3마일리지" - 원화가 아닌 부피(리터) 단위 -> unit_basis(원화 전용 컬럼)에 넣지 않고
     unit_type='LITER' 로 별도 표기하여 원화 단위와 혼동되지 않도록 분리

  나머지(기준금액 자체가 원문에 없는 카드: card_id 54, 2398)는 정상적으로 NULL로 유지한다(오류 아님).

원칙:
  - 기존 benefits_patched.csv, benefits_recovered_patched.csv는 절대 덮어쓰지 않는다.
  - 새 파일(benefits_patched_v2.csv, benefits_recovered_patched_v2.csv, unit_pattern_fix_log_v2.csv)만 생성한다.
  - unit_basis는 원화(KRW) 기준 금액 전용 컬럼으로 유지하고, 리터 등 비-원화 단위는
    새 컬럼 unit_type(WON/LITER/NULL)으로 구분한다. (기존 스키마에 컬럼 1개 추가 필요)

입력 경로:
  schema_output/benefits_patched.csv
  schema_output/benefits_recovered_patched.csv

출력 경로:
  schema_output/benefits_patched_v2.csv
  schema_output/benefits_recovered_patched_v2.csv
  schema_output/unit_pattern_fix_log_v2.csv
"""
import re, csv, os

INPUT_DIR = "schema_output"
OUTPUT_DIR = "schema_output"

# unit_type 컬럼이 신규 추가됨 (기존 9개 + unit_type = 11개 컬럼)
FIELDNAMES = ["card_id", "min_amount", "min_amount_source", "category_id",
              "group_name", "benefit_type", "rate", "fixed_amount", "unit_basis", "unit_type", "raw_text"]

# "1,000원당 (스카이패스) 1 마일리지" - 브랜드명 괄호가 숫자 사이에 끼어도 매칭
WON_MILEAGE_PATTERN = re.compile(r"([\d,]+)\s*원\s*당\s*(?:\([^)]*\)\s*)?(\d+(?:\.\d+)?)\s*마일리지")

# "1천원당 1마일리지" - 한글 혼합 숫자 표기(천원당)
CHEONWON_MILEAGE_PATTERN = re.compile(r"(\d+(?:\.\d+)?)\s*천\s*원\s*당\s*(\d+(?:\.\d+)?)\s*마일리지")

# "리터당 3마일리지" - 원화가 아닌 부피(리터) 단위
LITER_MILEAGE_PATTERN = re.compile(r"리터\s*당\s*(\d+(?:\.\d+)?)\s*마일리지")


def try_repatch_row(row):
    """
    MILEAGE 타입이면서 unit_basis가 비어있는 행만 대상으로 재파싱한다.
    반환값: (patched_row, reason) 또는 (None, None) - 교정 대상이 아니면 None.
    """
    if row.get("benefit_type") != "MILEAGE":
        return None, None
    if row.get("unit_basis") not in (None, "", "NaN"):
        return None, None

    text = row["raw_text"] or ""

    m = LITER_MILEAGE_PATTERN.search(text)
    if m:
        new_row = dict(row)
        new_row["rate"] = float(m.group(1))
        new_row["unit_basis"] = None
        new_row["unit_type"] = "LITER"
        return new_row, "LITER_UNIT_RECOVERED"

    m = CHEONWON_MILEAGE_PATTERN.search(text)
    if m:
        unit_won = float(m.group(1)) * 1000
        new_row = dict(row)
        new_row["rate"] = float(m.group(2))
        new_row["unit_basis"] = int(unit_won)
        new_row["unit_type"] = "WON"
        return new_row, "CHEONWON_UNIT_RECOVERED"

    m = WON_MILEAGE_PATTERN.search(text)
    if m:
        unit_won = int(m.group(1).replace(",", ""))
        new_row = dict(row)
        new_row["rate"] = float(m.group(2))
        new_row["unit_basis"] = unit_won
        new_row["unit_type"] = "WON"
        return new_row, "WON_UNIT_RECOVERED"

    return None, None


def patch_file(input_path):
    with open(input_path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    patched_rows = []
    log_entries = []

    for row in rows:
        # 기존 파일에는 unit_type 컬럼이 없으므로 기본값 부여 (MILEAGE/POINT_PER_UNIT + unit_basis 존재 시 WON, 그 외 NULL)
        if "unit_type" not in row or row.get("unit_type") in (None, ""):
            if row.get("benefit_type") in ("MILEAGE", "POINT_PER_UNIT") and row.get("unit_basis") not in (None, "", "NaN"):
                row["unit_type"] = "WON"
            else:
                row["unit_type"] = None

        new_row, reason = try_repatch_row(row)
        if new_row is not None:
            log_entries.append({
                "source_file": os.path.basename(input_path),
                "card_id": row["card_id"],
                "raw_text": row["raw_text"],
                "before_rate": row["rate"],
                "before_unit_basis": row.get("unit_basis"),
                "after_rate": new_row["rate"],
                "after_unit_basis": new_row["unit_basis"],
                "after_unit_type": new_row["unit_type"],
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
            writer.writerow({k: r.get(k) for k in fieldnames})


def main():
    targets = [
        ("benefits_patched.csv", "benefits_patched_v2.csv"),
        ("benefits_recovered_patched.csv", "benefits_recovered_patched_v2.csv"),
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

    log_path = os.path.join(OUTPUT_DIR, "unit_pattern_fix_log_v2.csv")
    log_fieldnames = ["source_file", "card_id", "raw_text", "before_rate", "before_unit_basis",
                       "after_rate", "after_unit_basis", "after_unit_type", "reason"]
    write_csv(all_logs, log_path, log_fieldnames)
    print(f"교정 로그: {log_path} ({len(all_logs)}건)")


if __name__ == "__main__":
    main()
