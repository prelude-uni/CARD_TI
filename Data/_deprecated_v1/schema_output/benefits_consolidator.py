"""
benefits_consolidator.py

목적:
  Supabase에 하나의 benefits 테이블로 적재하기 위해, 서로 다른 컬럼 구성을 가진
  4개의 benefits 파생 파일을 하나의 통일된 스키마로 병합한다.

  - benefits_patched_v3_dedup.csv          (2,130건, unit_type 컬럼 있음)
  - benefits_recovered_patched_v2_dedup.csv (86건,   unit_type 컬럼 있음)
  - benefits_semi_structured_dedup.csv      (433건,  unit_type 컬럼 없음)
  - benefits_needs_ai_review_v3_dedup.csv   (720건,  unit_type 컬럼 없음)

  4개 파일은 원래 처리 단계가 달라 컬럼 구성이 미세하게 다르다(semi/still에는
  unit_type이 없음). Supabase 테이블은 컬럼 구성이 고정되어야 하므로, 이 스크립트가
  다음을 수행한다.

  1) 4개 파일 전체에 unit_type 컬럼을 통일 (없으면 NULL로 채움)
  2) 각 행이 어느 단계에서 왔는지 추적할 수 있도록 classification_status 컬럼 추가
     - CONFIRMED            : benefits_patched_v3_dedup.csv (정규식으로 완전 확정)
     - RECOVERED            : benefits_recovered_patched_v2_dedup.csv (패턴 재처리로 복구)
     - SEMI_STRUCTURED      : benefits_semi_structured_dedup.csv (부분 구조화, AI 검토 권장)
     - NEEDS_AI_REVIEW      : benefits_needs_ai_review_v3_dedup.csv (미분류, AI 분류 대상)
  3) 4개 파일을 세로로 합쳐 benefit_id(1부터 시작하는 surrogate key)를 부여
  4) 병합 결과의 건수가 4개 파일의 합과 정확히 일치하는지 자체 검증 후 저장

  이 스크립트는 4개 입력 파일을 수정하지 않고, 새 파일 하나만 생성한다.

경로 규칙:
  이 파일은 "<project>/Data/output/schema_output/" 안에 위치하고, 입력 파일은
  같은 폴더의 final/ 하위에 있다. __file__ 기준 경로 계산으로 실행 위치와 무관하게 동작.

실행 방법:
  python "<project>/Data/output/schema_output/benefits_consolidator.py"

입력 경로:
  schema_output/final/benefits_patched_v3_dedup.csv
  schema_output/final/benefits_recovered_patched_v2_dedup.csv
  schema_output/final/benefits_semi_structured_dedup.csv
  schema_output/final/benefits_needs_ai_review_v3_dedup.csv

출력 경로:
  schema_output/final/benefits_consolidated.csv
"""
import csv, os

SCHEMA_DIR = os.path.dirname(os.path.abspath(__file__))
FINAL_DIR = os.path.join(SCHEMA_DIR, "final")

SOURCES = [
    ("benefits_patched_v3_dedup.csv", "CONFIRMED"),
    ("benefits_recovered_patched_v2_dedup.csv", "RECOVERED"),
    ("benefits_semi_structured_dedup.csv", "SEMI_STRUCTURED"),
    ("benefits_needs_ai_review_v3_dedup.csv", "NEEDS_AI_REVIEW"),
]

OUTPUT_FIELDS = [
    "benefit_id", "card_id", "min_amount", "min_amount_source", "category_id",
    "group_name", "benefit_type", "rate", "fixed_amount", "unit_basis", "unit_type",
    "raw_text", "classification_status",
]


def load_rows(path, status_label):
    with open(path, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    for row in rows:
        if "unit_type" not in row or row.get("unit_type") == "":
            row["unit_type"] = None
        row["classification_status"] = status_label
    return rows


def main():
    all_rows, counts = [], {}
    for filename, status_label in SOURCES:
        path = os.path.join(FINAL_DIR, filename)
        rows = load_rows(path, status_label)
        counts[filename] = len(rows)
        all_rows.extend(rows)

    for idx, row in enumerate(all_rows, start=1):
        row["benefit_id"] = idx

    expected_total = sum(counts.values())
    assert len(all_rows) == expected_total, (
        f"병합 건수 불일치: 합계 {expected_total}건 vs 실제 {len(all_rows)}건"
    )

    output_path = os.path.join(FINAL_DIR, "benefits_consolidated.csv")
    with open(output_path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()
        for row in all_rows:
            writer.writerow({k: row.get(k) for k in OUTPUT_FIELDS})

    print("=== 병합 결과 ===")
    for filename, cnt in counts.items():
        print(f"{filename}: {cnt}건")
    print(f"합계(기대값): {expected_total}건")
    print(f"실제 병합 건수: {len(all_rows)}건 (일치 확인됨)")
    print(f"저장 경로: {output_path}")


if __name__ == "__main__":
    main()
