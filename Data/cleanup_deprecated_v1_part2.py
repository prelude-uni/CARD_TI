"""
cleanup_deprecated_v1_part2.py

목적:
  cleanup_deprecated_v1.py 실행 시 경로 가정이 잘못되어 "건너뜀"으로 처리된
  4개 파일을 실제 경로 기준으로 다시 찾아 Data/_deprecated_v1/로 이동한다.

  실제 확인된 경로:
    [프로젝트]/Data/supabase_uploader.py   (output/ 밑이 아니라 Data/ 바로 아래)
    [프로젝트]/DB/schema.sql               (Data/DB/가 아니라 프로젝트 루트의 DB/)
    [프로젝트]/DB/reset_schema.sql
    [프로젝트]/DB/verify_schema.sql

  삭제(os.remove)는 사용하지 않고 shutil.move로 이동만 수행한다.

경로 규칙:
  이 스크립트는 "<project>/Data/" 안에 위치한다고 가정한다. __file__ 기준으로
  Data/의 부모 폴더(프로젝트 루트)를 계산해 DB/ 폴더를 찾는다.

실행 방법:
  python "<project>/Data/cleanup_deprecated_v1_part2.py"

결과:
  Data/_deprecated_v1/supabase_uploader.py
  Data/_deprecated_v1/DB/schema.sql
  Data/_deprecated_v1/DB/reset_schema.sql
  Data/_deprecated_v1/DB/verify_schema.sql
"""
import os
import shutil

DATA_DIR = os.path.dirname(os.path.abspath(__file__))     # .../Project/Data
PROJECT_ROOT = os.path.dirname(DATA_DIR)                    # .../Project
DEPRECATED_DIR = os.path.join(DATA_DIR, "_deprecated_v1")

# (원본 절대경로 조합용 베이스, 원본 상대경로, 이동 후 _deprecated_v1 하위 상대경로)
MOVE_PLAN = [
    (DATA_DIR, "supabase_uploader.py", "supabase_uploader.py"),
    (PROJECT_ROOT, "DB/schema.sql", "DB/schema.sql"),
    (PROJECT_ROOT, "DB/reset_schema.sql", "DB/reset_schema.sql"),
    (PROJECT_ROOT, "DB/verify_schema.sql", "DB/verify_schema.sql"),
]


def move_item(base_dir, src_rel, dst_rel, log):
    src = os.path.join(base_dir, src_rel)
    dst = os.path.join(DEPRECATED_DIR, dst_rel)

    if not os.path.exists(src):
        log.append(f"건너뜀 (원본 없음): {src}")
        return

    os.makedirs(os.path.dirname(dst), exist_ok=True)

    if os.path.exists(dst):
        log.append(f"건너뜀 (대상에 이미 존재): {dst_rel}")
        return

    shutil.move(src, dst)
    log.append(f"이동 완료: {src} -> _deprecated_v1/{dst_rel}")


def main():
    os.makedirs(DEPRECATED_DIR, exist_ok=True)
    log = []

    for base_dir, src_rel, dst_rel in MOVE_PLAN:
        move_item(base_dir, src_rel, dst_rel, log)

    print("=== cleanup_deprecated_v1_part2.py 실행 결과 ===")
    for line in log:
        print(line)
    print(f"\n총 {len(MOVE_PLAN)}건 중 이동 처리: "
          f"{sum(1 for l in log if l.startswith('이동 완료'))}건, "
          f"건너뜀: {sum(1 for l in log if l.startswith('건너뜀'))}건")
    print(f"\n격리 폴더 위치: {DEPRECATED_DIR}")
    print("삭제된 파일은 없습니다. 전부 이동(shutil.move)만 수행했습니다.")


if __name__ == "__main__":
    main()
