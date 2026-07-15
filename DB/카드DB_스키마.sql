
-- =========================================================
-- 카드 혜택 비교 서비스 통합 DB 스키마
-- 대상: 신한/KB국민/삼성/현대/롯데/우리/하나/BC카드 (8개사)
-- 설계 원칙: 3NF 정규화, 이력관리(soft delete), 확장성(카드사 추가 시 코드 변경 불필요)
-- =========================================================

-- 1. 카드사 마스터
CREATE TABLE issuers (
    issuer_id       SERIAL PRIMARY KEY,
    issuer_code     VARCHAR(10)  NOT NULL UNIQUE,   -- 'SHINHAN','KB','SAMSUNG','HYUNDAI','LOTTE','WOORI','HANA','BC'
    issuer_name     VARCHAR(50)  NOT NULL,
    homepage_url    VARCHAR(255),
    logo_url        VARCHAR(255),
    customer_center VARCHAR(30),
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);

-- 2. 카드 마스터 (1 카드 상품 = 1 row, 브랜드/연회비는 하위 테이블로 분리)
CREATE TABLE cards (
    card_id         SERIAL PRIMARY KEY,
    issuer_id       INT NOT NULL REFERENCES issuers(issuer_id),
    card_name       VARCHAR(100) NOT NULL,
    card_type       VARCHAR(10)  NOT NULL CHECK (card_type IN ('CREDIT','CHECK','PREPAID')),
    category_main   VARCHAR(30)  NOT NULL,           -- '생활','쇼핑','외식카페','주유교통','문화교육','여행항공','프리미엄','사업자','공공단체' 등
    category_sub    VARCHAR(30),                     -- 세부 태그
    series_name     VARCHAR(50),                     -- 'Deep 시리즈','Code9 시리즈','SOL Plan' 등 상위 시리즈명 (nullable)
    status          VARCHAR(10)  NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DISCONTINUED','UNLISTED')),
    official_url    VARCHAR(255),                     -- 카드사 공식 상세페이지 (하이브리드 방식의 핵심 필드)
    launch_date     DATE,
    discontinue_date DATE,
    description     TEXT,
    source_type     VARCHAR(20) DEFAULT 'CRAWLED',    -- 'CRAWLED','MANUAL','API'
    is_verified     BOOLEAN DEFAULT FALSE,             -- 수동 검증 여부 (품질관리용)
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE (issuer_id, card_name)
);
CREATE INDEX idx_cards_issuer ON cards(issuer_id);
CREATE INDEX idx_cards_category ON cards(category_main);
CREATE INDEX idx_cards_status ON cards(status);

-- 3. 카드별 브랜드/연회비 옵션 (Visa/Master/UnionPay 등 브랜드마다 연회비 상이)
CREATE TABLE card_brands (
    brand_id            SERIAL PRIMARY KEY,
    card_id             INT NOT NULL REFERENCES cards(card_id) ON DELETE CASCADE,
    brand_name          VARCHAR(20) NOT NULL,   -- 'VISA','MASTER','UNIONPAY','JCB','AMEX','BC'
    annual_fee_domestic INT,                     -- 국내전용 연회비
    annual_fee_overseas INT,                     -- 해외겸용 연회비
    annual_fee_family   INT,                     -- 가족카드 연회비
    metal_plate         BOOLEAN DEFAULT FALSE,
    issue_fee_extra     INT DEFAULT 0,            -- 메탈 플레이트 등 추가 발급수수료
    UNIQUE (card_id, brand_name)
);

-- 4. 카드 이미지 (디자인별로 여러 장 가능)
CREATE TABLE card_images (
    image_id     SERIAL PRIMARY KEY,
    card_id      INT NOT NULL REFERENCES cards(card_id) ON DELETE CASCADE,
    image_type   VARCHAR(20) DEFAULT 'MAIN',   -- 'MAIN','DESIGN_VARIANT','THUMBNAIL'
    image_url    VARCHAR(255) NOT NULL,
    source       VARCHAR(20)  DEFAULT 'OFFICIAL' -- 'OFFICIAL','SELF_HOSTED' (저작권 이슈 대비 출처 기록)
);

-- 5. 전월 실적 구간 (혜택은 실적 구간에 종속됨: 1 카드 : N 구간)
CREATE TABLE usage_conditions (
    condition_id    SERIAL PRIMARY KEY,
    card_id         INT NOT NULL REFERENCES cards(card_id) ON DELETE CASCADE,
    condition_order INT NOT NULL,                -- 구간 순서 (1,2,3...)
    min_amount      INT NOT NULL DEFAULT 0,       -- 최소 실적 (원)
    max_amount      INT,                          -- 최대 실적 (NULL = 무제한)
    period_type     VARCHAR(10) DEFAULT 'MONTHLY' CHECK (period_type IN ('MONTHLY','QUARTERLY','YEARLY')),
    UNIQUE (card_id, condition_order)
);

-- 6. 가맹점 그룹 (계층형: 예) '외식' > '커피전문점' > '스타벅스')
CREATE TABLE merchant_groups (
    group_id        SERIAL PRIMARY KEY,
    group_name      VARCHAR(50) NOT NULL,
    parent_group_id INT REFERENCES merchant_groups(group_id)
);

-- 7. 혜택 분류 코드 (마스터 코드성 테이블 -> 서비스 필터 UI에 직결)
CREATE TABLE benefit_categories (
    category_id    SERIAL PRIMARY KEY,
    category_name  VARCHAR(30) NOT NULL UNIQUE,  -- '캐시백','포인트적립','할인','마일리지'
    category_group VARCHAR(30)                    -- '적립형','할인형' 상위 그룹
);

-- 8. 혜택 상세 (핵심 테이블: 실적조건 + 가맹점그룹 + 혜택유형의 조합)
CREATE TABLE benefits (
    benefit_id        SERIAL PRIMARY KEY,
    card_id           INT NOT NULL REFERENCES cards(card_id) ON DELETE CASCADE,
    condition_id      INT REFERENCES usage_conditions(condition_id) ON DELETE SET NULL,
    category_id       INT NOT NULL REFERENCES benefit_categories(category_id),
    group_id          INT REFERENCES merchant_groups(group_id),  -- NULL이면 전 가맹점 기본혜택
    rate              DECIMAL(5,2),          -- 적립률/할인율 (%)
    fixed_amount      INT,                    -- 정액 캐시백/할인 (원)
    cap_amount        INT,                    -- 한도 금액
    cap_period        VARCHAR(10) DEFAULT 'MONTHLY' CHECK (cap_period IN ('DAILY','MONTHLY','QUARTERLY','YEARLY','PER_USE')),
    daily_limit_count INT,
    monthly_limit_count INT,
    raw_text          TEXT,                   -- 원문 그대로 (파싱 오류 대비 원본 보존, 필수)
    created_at        TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_benefits_card ON benefits(card_id);
CREATE INDEX idx_benefits_category ON benefits(category_id);
CREATE INDEX idx_benefits_group ON benefits(group_id);

-- 9. 카드 태그 (자유 검색/필터용, N:N 성격)
CREATE TABLE card_tags (
    tag_id    SERIAL PRIMARY KEY,
    card_id   INT NOT NULL REFERENCES cards(card_id) ON DELETE CASCADE,
    tag_name  VARCHAR(30) NOT NULL,   -- '무실적','1인가구','미성년자발급','전기차','반려동물'
    UNIQUE (card_id, tag_name)
);
CREATE INDEX idx_tags_name ON card_tags(tag_name);

-- 10. 크롤링/수집 이력 (데이터 신뢰도 관리 및 재수집 스케줄링용)
CREATE TABLE crawl_logs (
    log_id       SERIAL PRIMARY KEY,
    card_id      INT REFERENCES cards(card_id) ON DELETE SET NULL,
    source_url   VARCHAR(255) NOT NULL,
    crawled_at   TIMESTAMP DEFAULT NOW(),
    status       VARCHAR(10) CHECK (status IN ('SUCCESS','FAILED','PARTIAL')),
    raw_json     JSONB,              -- Upstage Document Parse 결과 원본 보존
    error_message TEXT
);
CREATE INDEX idx_crawllogs_card ON crawl_logs(card_id);

-- =========================================================
-- 초기 시드 데이터: 8개 카드사
-- =========================================================
INSERT INTO issuers (issuer_code, issuer_name, homepage_url) VALUES
('SHINHAN','신한카드','https://www.shinhancard.com'),
('KB','KB국민카드','https://card.kbcard.com'),
('SAMSUNG','삼성카드','https://www.samsungcard.com'),
('HYUNDAI','현대카드','https://www.hyundaicard.com'),
('LOTTE','롯데카드','https://www.lottecard.co.kr'),
('WOORI','우리카드','https://www.wooricard.com'),
('HANA','하나카드','https://www.hanacard.co.kr'),
('BC','BC카드','https://www.bccard.com');
