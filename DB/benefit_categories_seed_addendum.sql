-- =========================================================
-- benefit_categories_seed_addendum.sql
-- 목적: benefit_categories_seed.sql(적립/캐시백/마일리지/할인, 4종) 실행 이후
--       benefits_v1.csv 실제 분포에서 발견된 나머지 4종 카테고리를 추가한다.
-- 근거: benefits_v1.csv(5,487행) 중 category_name이 아래 4종인 행이 1,300건(24%)
--       존재하며, 기존 4종 화이트리스트에 없어 매핑이 불가능했다.
--   - 기타       890건 (내용 재검토 결과 839건은 정량화되지 않는 정성적 혜택으로 확인)
--   - 무료서비스   257건
--   - 바우처       86건
--   - 무이자할부    67건
-- 실행 순서: benefit_categories_seed.sql 실행 이후, 이 파일을 Supabase SQL Editor에서 실행
-- 주의: CREATE TABLE 구조는 변경하지 않으며, INSERT만 추가 수행한다.
--       category_name은 UNIQUE 제약이 있으므로, 기존 4종과 이름이 중복되지 않는지
--       반드시 실행 전 확인한다.
-- =========================================================

INSERT INTO benefit_categories (category_name, category_group) VALUES
('무료서비스', '서비스형'),
('바우처', '교환형'),
('무이자할부', '할부형'),
('기타', '정보형');