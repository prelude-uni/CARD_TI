-- reset_schema.sql
-- 이전에 잘못 생성된 테이블을 전부 삭제한다.
-- FK로 얽혀 있으므로 CASCADE를 사용해 참조하는 테이블까지 함께 삭제한다.
-- 실행 위치: Supabase 대시보드 > SQL Editor > New query > 붙여넣고 Run

DROP TABLE IF EXISTS benefits CASCADE;
DROP TABLE IF EXISTS card_brands CASCADE;
DROP TABLE IF EXISTS cards CASCADE;
DROP TABLE IF EXISTS merchant_groups CASCADE;
