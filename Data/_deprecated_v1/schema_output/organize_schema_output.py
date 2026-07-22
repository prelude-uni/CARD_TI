"""
organize_schema_output.py

목적:
  schema_output 폴더 안에 쌓인 중간 산출물(패치 이전 버전, 로그, 재처리 스크립트)을
  Supabase 적재 대상 파일과 분리해 폴더를 정리한다.

  - final/    : Supabase에 실제로 적재할 최종 7개 파일
  - _archive/ : 중간 버전 CSV, 각종 교정/복구 로그 (보관용, 적재 대상 아님)
  - _scripts/ : 이번 정제 과정에서 작성한 재처리 스크립트 (보관용)

이 스크립트는 파일을 이동만 하며 내용은 변경하지 않는다.

실행 방법:
  python "<project>/Data/output/schema_output/organize_schema_output.py"
"""
import os, shutil

SCHEMA_DIR = os.path.dirname(os.path.abspath(__file__))

FINAL_FILES = [
    "cards_corrected_v2.csv",
    "card_brands_v2.csv",
    "benefits_patched_v3_dedup.csv",
    "benefits_recovered_patched_v2_dedup.csv",
    "benefits_semi_structured_dedup.csv",
    "benefits_needs_ai_review_v3_dedup.csv",
    "merchant_groups.csv",
]

ARCHIVE_FILES = [
    "benefits.csv", "benefits_needs_ai_review.csv", "benefits_needs_ai_review_v2.csv",
    "benefits_needs_ai_review_v3.csv", "benefits_patched.csv", "benefits_patched_v2.csv",
    "benefits_patched_v3.csv", "benefits_recovered.csv", "benefits_recovered_patched.csv",
    "benefits_recovered_patched_v2.csv", "benefits_semi_structured.csv",
    "cards.csv", "cards_corrected.csv", "card_brands.csv",
    "bc_recovery_log.csv", "duplicate_removal_log.csv", "issuer_mismatch_log.csv",
    "unit_pattern_fix_log.csv", "unit_pattern_fix_log_v2.csv",
    "unresolved_issuer_cards.csv", "unresolved_issuer_cards_v2.csv",
]

SCRIPT_FILES = [
    "bc_issuer_recovery.py", "benefits_duplicate_remover.py", "benefits_review_refiner.py",
    "benefits_unit_pattern_fix.py", "benefits_unit_pattern_fix_v2.py",
]


def move_files(filenames, dest_subdir):
    dest_dir = os.path.join(SCHEMA_DIR, dest_subdir)
    os.makedirs(dest_dir, exist_ok=True)
    moved, skipped = [], []
    for name in filenames:
        src = os.path.join(SCHEMA_DIR, name)
        if os.path.exists(src):
            shutil.move(src, os.path.join(dest_dir, name))
            moved.append(name)
        else:
            skipped.append(name)
    return moved, skipped


def main():
    final_moved, final_skipped = move_files(FINAL_FILES, "final")
    archive_moved, archive_skipped = move_files(ARCHIVE_FILES, "_archive")
    script_moved, script_skipped = move_files(SCRIPT_FILES, "_scripts")

    print(f"final/ 로 이동: {len(final_moved)}건 {final_moved}")
    if final_skipped:
        print(f"  (파일 없어 건너뜀: {final_skipped})")
    print(f"_archive/ 로 이동: {len(archive_moved)}건")
    if archive_skipped:
        print(f"  (파일 없어 건너뜀: {archive_skipped})")
    print(f"_scripts/ 로 이동: {len(script_moved)}건")
    if script_skipped:
        print(f"  (파일 없어 건너뜀: {script_skipped})")

    print("\n정리 완료. schema_output/final/ 안의 7개 파일이 Supabase 적재 대상입니다.")


if __name__ == "__main__":
    main()