"""
benefits_duplicate_remover.py

목적:
  benefits_semi_structured.csv 등 파생 파일에서 동일한 (card_id, category_id, raw_text,
  benefit_type, rate, fixed_amount, unit_basis) 조합이 완전히 중복된 행을 제거한다.
  현재 확인된 사례: card_id=281, raw_text="추가 포인트 적립" 행이 2건 중복.

  bc_issuer_recovery.py 실행 이후를 기준으로, benefits_patched_v3.csv(BC카드 27건 포함,
  2130건)와 benefits_needs_ai_review_v3.csv(720건)까지 포함한 4개 파일 전체를
  검사 대상으로 삼는다. 반드시 bc_issuer_recovery.py를 먼저 실행한 뒤 이 스크립트를
  실행해야 한다.

경로 규칙 (이번 수정 사항):
  스크립트 자신의 위치(__file__)를 기준으로 schema_output 폴더를 찾으므로,
  실행 위치(현재 작업 디렉터리)와 무관하게 동작한다.

실행 방법:
  python "<project>/Data/output/schema_output/benefits_duplicate_remover.py"

출력 경로 (모두 output/schema_output/ 안):
  benefits_patched_v3_dedup.csv
  benefits_recovered_patched_v2_dedup.csv
  benefits_semi_structured_dedup.csv
  benefits_needs_ai_review_v3_dedup.csv
  duplicate_removal_log.csv
"""
import csv, os

SCHEMA_DIR = os.path.dirname(os.path.abspath(__file__))

TARGET_FILES = [
    "benefits_patched_v3.csv",
    "benefits_recovered_patched_v2.csv",
    "benefits_semi_structured.csv",
    "benefits_needs_ai_review_v3.csv",
]


def dedup_file(input_path, output_path):
    with open(input_path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        rows = list(reader)

    seen, deduped_rows, removed_rows = set(), [], []
    for row in rows:
        key = tuple(row.get(k) for k in fieldnames)
        if key in seen:
            removed_rows.append(row)
            continue
        seen.add(key)
        deduped_rows.append(row)

    with open(output_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(deduped_rows)

    return len(rows), len(deduped_rows), removed_rows


def main():
    all_removed = []
    for filename in TARGET_FILES:
        input_path = os.path.join(SCHEMA_DIR, filename)
        if not os.path.exists(input_path):
            print(f"건너뜀 (파일 없음): {input_path}")
            continue
        name, ext = os.path.splitext(filename)
        output_path = os.path.join(SCHEMA_DIR, f"{name}_dedup{ext}")

        before, after, removed = dedup_file(input_path, output_path)
        for r in removed:
            r["source_file"] = filename
            all_removed.append(r)

        print(f"{filename}: 전체 {before}건 중 중복 {before-after}건 제거 -> {output_path}")

    log_path = os.path.join(SCHEMA_DIR, "duplicate_removal_log.csv")
    if all_removed:
        log_fieldnames = ["source_file"] + [k for k in all_removed[0].keys() if k != "source_file"]
        with open(log_path, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=log_fieldnames)
            writer.writeheader()
            for r in all_removed:
                writer.writerow({k: r.get(k) for k in log_fieldnames})
    else:
        with open(log_path, "w", newline="", encoding="utf-8-sig") as f:
            f.write("")

    print(f"중복 제거 로그: {log_path} ({len(all_removed)}건)")


if __name__ == "__main__":
    main()