-- 로그인 없는 CARD-TI 클라이언트에서 publishable key로 조회하기 위한 읽기 전용 정책
-- Supabase SQL Editor에서 한 번 실행합니다.

GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON TABLE
  public.issuers,
  public.cards,
  public.card_brands,
  public.card_images,
  public.usage_conditions,
  public.merchant_groups,
  public.benefit_categories,
  public.benefits
TO anon;

ALTER TABLE public.issuers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benefit_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benefits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CARD_TI public read issuers" ON public.issuers;
CREATE POLICY "CARD_TI public read issuers"
ON public.issuers FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "CARD_TI public read cards" ON public.cards;
CREATE POLICY "CARD_TI public read cards"
ON public.cards FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "CARD_TI public read card_brands" ON public.card_brands;
CREATE POLICY "CARD_TI public read card_brands"
ON public.card_brands FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "CARD_TI public read card_images" ON public.card_images;
CREATE POLICY "CARD_TI public read card_images"
ON public.card_images FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "CARD_TI public read usage_conditions" ON public.usage_conditions;
CREATE POLICY "CARD_TI public read usage_conditions"
ON public.usage_conditions FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "CARD_TI public read merchant_groups" ON public.merchant_groups;
CREATE POLICY "CARD_TI public read merchant_groups"
ON public.merchant_groups FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "CARD_TI public read benefit_categories" ON public.benefit_categories;
CREATE POLICY "CARD_TI public read benefit_categories"
ON public.benefit_categories FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "CARD_TI public read benefits" ON public.benefits;
CREATE POLICY "CARD_TI public read benefits"
ON public.benefits FOR SELECT TO anon USING (true);
