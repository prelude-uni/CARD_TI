-- schema.sql
-- Supabase(PostgreSQL)에 카드 혜택 비교 서비스 스키마를 생성한다.
-- 실행 위치: Supabase 대시보드 > SQL Editor > New query > 전체 붙여넣기 > Run

-- 1) cards: 카드 기본 정보 (1,274건)
CREATE TABLE IF NOT EXISTS cards (
    card_id       INTEGER PRIMARY KEY,
    issuer_code   VARCHAR(20) NOT NULL
                  CHECK (issuer_code IN ('SHINHAN','KB','SAMSUNG','HYUNDAI','LOTTE','WOORI','HANA','BC')),
    card_name     TEXT NOT NULL,
    card_type     VARCHAR(10) NOT NULL CHECK (card_type IN ('CREDIT','CHECK')),
    status        VARCHAR(10) NOT NULL DEFAULT 'ACTIVE',
    official_url  TEXT
);

-- 2) card_brands: 카드 국제브랜드 및 연회비 (1,830건, 카드 1개당 여러 브랜드 가능)
CREATE TABLE IF NOT EXISTS card_brands (
    id                    BIGSERIAL PRIMARY KEY,
    card_id               INTEGER NOT NULL REFERENCES cards(card_id) ON DELETE CASCADE,
    brand_name            VARCHAR(20),
    annual_fee_domestic   INTEGER,
    annual_fee_overseas   INTEGER
);

-- 3) merchant_groups: 혜택 카테고리 마스터 (38건)
CREATE TABLE IF NOT EXISTS merchant_groups (
    group_id     INTEGER PRIMARY KEY,
    group_name   VARCHAR(50) NOT NULL UNIQUE
);

-- 4) benefits: 카드별 혜택 상세 (3,369건, benefits_consolidated.csv 전체)
CREATE TABLE IF NOT EXISTS benefits (
    benefit_id             INTEGER PRIMARY KEY,
    card_id                INTEGER NOT NULL REFERENCES cards(card_id) ON DELETE CASCADE,
    min_amount             INTEGER NOT NULL DEFAULT 0,
    min_amount_source      VARCHAR(20) CHECK (min_amount_source IN ('INLINE','CARD_LEVEL')),
    category_id            INTEGER NOT NULL REFERENCES merchant_groups(group_id),
    group_name             VARCHAR(50),
    benefit_type           VARCHAR(30) NOT NULL,
    rate                   NUMERIC(6,2),
    fixed_amount           INTEGER,
    unit_basis             INTEGER,
    unit_type              VARCHAR(10) CHECK (unit_type IN ('WON','LITER') OR unit_type IS NULL),
    raw_text               TEXT NOT NULL,
    classification_status  VARCHAR(20) NOT NULL
                            CHECK (classification_status IN ('CONFIRMED','RECOVERED','SEMI_STRUCTURED','NEEDS_AI_REVIEW'))
);

-- 조회 성능을 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_benefits_card_id ON benefits(card_id);
CREATE INDEX IF NOT EXISTS idx_benefits_category_id ON benefits(category_id);
CREATE INDEX IF NOT EXISTS idx_benefits_classification_status ON benefits(classification_status);
CREATE INDEX IF NOT EXISTS idx_card_brands_card_id ON card_brands(card_id);
CREATE INDEX IF NOT EXISTS idx_cards_issuer_code ON cards(issuer_code);
