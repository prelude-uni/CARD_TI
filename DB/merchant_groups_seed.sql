-- =========================================================
-- merchant_groups_seed.sql
-- 목적: 카드DB_스키마.sql의 merchant_groups(계층형) 테이블에 초기 시드 데이터를 넣는다.
-- 구조: 1단계(대분류, parent_group_id=NULL) -> 2단계(중분류) -> 3단계(원문에서 실제 확인된 브랜드명)
-- 실행 순서: 카드DB_스키마.sql 실행 이후, 이 파일을 Supabase SQL Editor에서 실행
-- 주의: 기존 스키마 구조(CREATE TABLE)는 전혀 변경하지 않으며, INSERT만 수행한다.
-- =========================================================

-- 1단계: 대분류
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES
('쇼핑', NULL), ('외식카페', NULL), ('문화여가', NULL), ('교통자동차', NULL), ('여행항공', NULL), ('생활', NULL), ('기타', NULL);

-- 2단계: 중분류 (parent_group_id = 1단계 group_id, 이름으로 서브쿼리 조회)
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('백화점', (SELECT group_id FROM merchant_groups WHERE group_name = '쇼핑' AND parent_group_id IS NULL));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('대형마트', (SELECT group_id FROM merchant_groups WHERE group_name = '쇼핑' AND parent_group_id IS NULL));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('편의점', (SELECT group_id FROM merchant_groups WHERE group_name = '쇼핑' AND parent_group_id IS NULL));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('온라인쇼핑', (SELECT group_id FROM merchant_groups WHERE group_name = '쇼핑' AND parent_group_id IS NULL));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('드럭스토어', (SELECT group_id FROM merchant_groups WHERE group_name = '쇼핑' AND parent_group_id IS NULL));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('카페', (SELECT group_id FROM merchant_groups WHERE group_name = '외식카페' AND parent_group_id IS NULL));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('배달앱', (SELECT group_id FROM merchant_groups WHERE group_name = '외식카페' AND parent_group_id IS NULL));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('영화', (SELECT group_id FROM merchant_groups WHERE group_name = '문화여가' AND parent_group_id IS NULL));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('디지털구독', (SELECT group_id FROM merchant_groups WHERE group_name = '문화여가' AND parent_group_id IS NULL));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('테마파크', (SELECT group_id FROM merchant_groups WHERE group_name = '문화여가' AND parent_group_id IS NULL));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('골프', (SELECT group_id FROM merchant_groups WHERE group_name = '문화여가' AND parent_group_id IS NULL));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('주유소', (SELECT group_id FROM merchant_groups WHERE group_name = '교통자동차' AND parent_group_id IS NULL));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('대중교통', (SELECT group_id FROM merchant_groups WHERE group_name = '교통자동차' AND parent_group_id IS NULL));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('택시', (SELECT group_id FROM merchant_groups WHERE group_name = '교통자동차' AND parent_group_id IS NULL));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('항공', (SELECT group_id FROM merchant_groups WHERE group_name = '여행항공' AND parent_group_id IS NULL));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('공항라운지', (SELECT group_id FROM merchant_groups WHERE group_name = '여행항공' AND parent_group_id IS NULL));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('면세점', (SELECT group_id FROM merchant_groups WHERE group_name = '여행항공' AND parent_group_id IS NULL));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('통신', (SELECT group_id FROM merchant_groups WHERE group_name = '생활' AND parent_group_id IS NULL));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('간편결제', (SELECT group_id FROM merchant_groups WHERE group_name = '생활' AND parent_group_id IS NULL));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('병원약국', (SELECT group_id FROM merchant_groups WHERE group_name = '생활' AND parent_group_id IS NULL));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('교육육아', (SELECT group_id FROM merchant_groups WHERE group_name = '생활' AND parent_group_id IS NULL));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('모든가맹점', (SELECT group_id FROM merchant_groups WHERE group_name = '기타' AND parent_group_id IS NULL));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('기타혜택', (SELECT group_id FROM merchant_groups WHERE group_name = '기타' AND parent_group_id IS NULL));

-- 3단계: 브랜드명 (원문 데이터에서 실제 등장 확인된 것만 등록, parent_group_id = 2단계 group_id)
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('롯데백화점', (SELECT group_id FROM merchant_groups WHERE group_name = '백화점' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '쇼핑' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('신세계백화점', (SELECT group_id FROM merchant_groups WHERE group_name = '백화점' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '쇼핑' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('현대백화점', (SELECT group_id FROM merchant_groups WHERE group_name = '백화점' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '쇼핑' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('이마트', (SELECT group_id FROM merchant_groups WHERE group_name = '대형마트' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '쇼핑' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('롯데마트', (SELECT group_id FROM merchant_groups WHERE group_name = '대형마트' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '쇼핑' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('홈플러스', (SELECT group_id FROM merchant_groups WHERE group_name = '대형마트' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '쇼핑' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('코스트코', (SELECT group_id FROM merchant_groups WHERE group_name = '대형마트' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '쇼핑' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('GS25', (SELECT group_id FROM merchant_groups WHERE group_name = '편의점' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '쇼핑' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('CU', (SELECT group_id FROM merchant_groups WHERE group_name = '편의점' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '쇼핑' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('세븐일레븐', (SELECT group_id FROM merchant_groups WHERE group_name = '편의점' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '쇼핑' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('이마트24', (SELECT group_id FROM merchant_groups WHERE group_name = '편의점' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '쇼핑' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('쿠팡', (SELECT group_id FROM merchant_groups WHERE group_name = '온라인쇼핑' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '쇼핑' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('11번가', (SELECT group_id FROM merchant_groups WHERE group_name = '온라인쇼핑' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '쇼핑' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('G마켓', (SELECT group_id FROM merchant_groups WHERE group_name = '온라인쇼핑' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '쇼핑' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('SSG', (SELECT group_id FROM merchant_groups WHERE group_name = '온라인쇼핑' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '쇼핑' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('올리브영', (SELECT group_id FROM merchant_groups WHERE group_name = '드럭스토어' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '쇼핑' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('랄라블라', (SELECT group_id FROM merchant_groups WHERE group_name = '드럭스토어' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '쇼핑' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('스타벅스', (SELECT group_id FROM merchant_groups WHERE group_name = '카페' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '외식카페' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('이디야', (SELECT group_id FROM merchant_groups WHERE group_name = '카페' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '외식카페' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('투썸플레이스', (SELECT group_id FROM merchant_groups WHERE group_name = '카페' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '외식카페' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('빽다방', (SELECT group_id FROM merchant_groups WHERE group_name = '카페' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '외식카페' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('배달의민족', (SELECT group_id FROM merchant_groups WHERE group_name = '배달앱' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '외식카페' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('요기요', (SELECT group_id FROM merchant_groups WHERE group_name = '배달앱' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '외식카페' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('쿠팡이츠', (SELECT group_id FROM merchant_groups WHERE group_name = '배달앱' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '외식카페' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('CGV', (SELECT group_id FROM merchant_groups WHERE group_name = '영화' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '문화여가' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('롯데시네마', (SELECT group_id FROM merchant_groups WHERE group_name = '영화' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '문화여가' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('메가박스', (SELECT group_id FROM merchant_groups WHERE group_name = '영화' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '문화여가' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('넷플릭스', (SELECT group_id FROM merchant_groups WHERE group_name = '디지털구독' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '문화여가' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('유튜브프리미엄', (SELECT group_id FROM merchant_groups WHERE group_name = '디지털구독' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '문화여가' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('왓챠', (SELECT group_id FROM merchant_groups WHERE group_name = '디지털구독' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '문화여가' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('티빙', (SELECT group_id FROM merchant_groups WHERE group_name = '디지털구독' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '문화여가' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('S-OIL', (SELECT group_id FROM merchant_groups WHERE group_name = '주유소' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '교통자동차' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('GS칼텍스', (SELECT group_id FROM merchant_groups WHERE group_name = '주유소' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '교통자동차' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('SK에너지', (SELECT group_id FROM merchant_groups WHERE group_name = '주유소' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '교통자동차' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('현대오일뱅크', (SELECT group_id FROM merchant_groups WHERE group_name = '주유소' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '교통자동차' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('에이치디현대오일뱅크', (SELECT group_id FROM merchant_groups WHERE group_name = '주유소' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '교통자동차' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('대한항공', (SELECT group_id FROM merchant_groups WHERE group_name = '항공' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '여행항공' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('아시아나항공', (SELECT group_id FROM merchant_groups WHERE group_name = '항공' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '여행항공' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('SK텔레콤', (SELECT group_id FROM merchant_groups WHERE group_name = '통신' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '생활' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('KT', (SELECT group_id FROM merchant_groups WHERE group_name = '통신' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '생활' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('LGU+', (SELECT group_id FROM merchant_groups WHERE group_name = '통신' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '생활' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('카카오페이', (SELECT group_id FROM merchant_groups WHERE group_name = '간편결제' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '생활' AND parent_group_id IS NULL)));
INSERT INTO merchant_groups (group_name, parent_group_id) VALUES ('네이버페이', (SELECT group_id FROM merchant_groups WHERE group_name = '간편결제' AND parent_group_id = (SELECT group_id FROM merchant_groups WHERE group_name = '생활' AND parent_group_id IS NULL)));