"""
cleanup_deprecated_v1.py

목적:
  Supabase 스키마 사고(단순화된 4테이블 스키마로 원본 3NF 스키마를 덮어썼던 사고) 이후,
  옛 단순화 스키마를 전제로 만들어졌던 파서/스크립트/CSV를 삭제하지 않고
  Data/_deprecated_v1/ 폴더로 격리 이동한다.

  삭제(os.remove)는 절대 사용하지 않으며, shutil.move로 이동만 수행한다.
  이동 대상 파일이 실제로 없는 경우는 건너뛰고 로그에 남긴다.

  유지되는 것 (이동하지 않음):
    - output/card_data_raw.json (원본 크롤링 데이터, 재사용)
    - output/failed_targets.json
    - output/unmapped_issuers.json, unmapped_issuers_for_schema_review.csv
    - DB/카드DB_스키마.sql, DB/카드DB_스키마_속성표.csv (정본 스키마)
    - test/, venv/ (무관)

경로 규칙:
  이 스크립트는 "<project>/Data/" 안에 위치한다고 가정한다. __file__ 기준으로
  이동 대상 경로를 계산하므로 실행 위치와 무관하게 동작한다.

실행 방법:
  python "<project>/Data/cleanup_deprecated_v1.py"

결과:
  Data/_deprecated_v1/ 폴더가 생성되고, 아래 구조로 파일들이 이동된다.
    _deprecated_v1/
      card_data_normalizer_v2.py
      issuer_mismatch_resolver.py
      issuers.csv
      supabase_uploader.py
      DB/
        schema.sql
        reset_schema.sql
        verify_schema.sql
      temp/
        card_data_normalizer.py
      schema_output/   (output/schema_output/ 폴더 전체가 그대로 이동)
"""
import os
import shutil

BASE_DIR = os.path.dirname(os.path.abspath(__file__))   # .../Data
DEPRECATED_DIR = os.path.join(BASE_DIR, "_deprecated_v1")

# (원본 상대경로, 이동 후 _deprecated_v1 하위 상대경로)
MOVE_PLAN = [
    ("output/card_data_normalizer_v2.py", "card_data_normalizer_v2.py"),
    ("output/issuer_mismatch_resolver.py", "issuer_mismatch_resolver.py"),
    ("output/issuers.csv", "issuers.csv"),
    ("output/supabase_uploader.py", "supabase_uploader.py"),
    ("DB/schema.sql", "DB/schema.sql"),
    ("DB/reset_schema.sql", "DB/reset_schema.sql"),
    ("DB/verify_schema.sql", "DB/verify_schema.sql"),
    ("output/temp/card_data_normalizer.py", "temp/card_data_normalizer.py"),
    ("output/schema_output", "schema_output"),   # 폴더 전체 이동
]


def move_item(src_rel, dst_rel, log):
    src = os.path.join(BASE_DIR, src_rel)
    dst = os.path.join(DEPRECATED_DIR, dst_rel)

    if not os.path.exists(src):
        log.append(f"건너뜀 (원본 없음): {src_rel}")
        return

    os.makedirs(os.path.dirname(dst), exist_ok=True)

    if os.path.exists(dst):
        log.append(f"건너뜀 (대상에 이미 존재): {dst_rel}")
        return

    shutil.move(src, dst)
    log.append(f"이동 완료: {src_rel} -> _deprecated_v1/{dst_rel}")


def main():
    os.makedirs(DEPRECATED_DIR, exist_ok=True)
    log = []

    for src_rel, dst_rel in MOVE_PLAN:
        move_item(src_rel, dst_rel, log)

    print("=== cleanup_deprecated_v1.py 실행 결과 ===")
    for line in log:
        print(line)
    print(f"\n총 {len(MOVE_PLAN)}건 중 이동 처리: "
          f"{sum(1 for l in log if l.startswith('이동 완료'))}건, "
          f"건너뜀: {sum(1 for l in log if l.startswith('건너뜀'))}건")
    print(f"\n격리 폴더 위치: {DEPRECATED_DIR}")
    print("삭제된 파일은 없습니다. 전부 이동(shutil.move)만 수행했습니다.")


if __name__ == "__main__":
    main()
