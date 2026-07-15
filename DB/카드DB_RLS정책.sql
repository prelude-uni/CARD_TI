
-- 모든 테이블에 대해 '누구나 읽기 가능, 쓰기는 서버(service_role)만 가능' 정책
CREATE POLICY "public_read_issuers" ON issuers FOR SELECT USING (true);
CREATE POLICY "public_read_cards" ON cards FOR SELECT USING (true);
CREATE POLICY "public_read_card_brands" ON card_brands FOR SELECT USING (true);
CREATE POLICY "public_read_card_images" ON card_images FOR SELECT USING (true);
CREATE POLICY "public_read_usage_conditions" ON usage_conditions FOR SELECT USING (true);
CREATE POLICY "public_read_merchant_groups" ON merchant_groups FOR SELECT USING (true);
CREATE POLICY "public_read_benefit_categories" ON benefit_categories FOR SELECT USING (true);
CREATE POLICY "public_read_benefits" ON benefits FOR SELECT USING (true);
CREATE POLICY "public_read_card_tags" ON card_tags FOR SELECT USING (true);
-- crawl_logs는 공개 정책을 만들지 않음 (내부 운영용, RLS로 완전 차단 유지)
