-- verify_schema.sql
-- benefits/cards/card_brands/merchant_groups 4개 테이블이 우리가 설계한 구조와
-- 정확히 일치하는지 확인한다. (다른 6개 테이블은 이번 CSV 업로드와 무관)
-- 실행 위치: Supabase SQL Editor > New query > Run

SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('cards', 'card_brands', 'merchant_groups', 'benefits')
ORDER BY table_name, ordinal_position;
