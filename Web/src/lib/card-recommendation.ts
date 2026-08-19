import type { Transaction } from "@/lib/upstage/information-extract";
import { supabase } from "@/utils/supabase/client";

export type RecommendationCategoryInput = {
  kosisCode: string;
  name: string;
  amount: number;
  ratio: number;
  spendingIndex: number | null;
};

export type RecommendationBenefit = {
  benefitId: number;
  consumerCategory: string;
  merchantGroup: string;
  benefitType: string;
  rawText: string;
  usageConditionLabel: string;
  estimatedMonthlyBenefit: number | null;
  estimateMethodLabel: string;
};

export type CardRecommendation = {
  rank: number;
  cardId: number;
  cardName: string;
  cardType: string;
  issuerName: string;
  annualFee: number | null;
  estimatedMonthlyBenefit: number | null;
  matchedCategories: string[];
  benefitTypes: string[];
  recommendationReason: string;
  applicationUrl: string | null;
  benefits: RecommendationBenefit[];
  isCardDataVerified: boolean;
};

type RecommendationRequest = {
  categories: RecommendationCategoryInput[];
  transactions: Transaction[];
  monthlySpend: number;
  cardTiType: string;
  excludedCardName?: string;
};

type MerchantGroupRow = {
  group_id: number;
  group_name: string;
  parent_group_id: number | null;
};

type BenefitCategoryRelation = {
  category_id: number;
  category_name: string;
  category_group: string | null;
};

type MerchantGroupRelation = MerchantGroupRow;

type UsageConditionRelation = {
  min_amount: number | null;
  max_amount: number | null;
  period_type: string | null;
};

type IssuerRelation = {
  issuer_name: string;
  homepage_url: string | null;
};

type CardBrandRelation = {
  annual_fee_domestic: number | null;
  annual_fee_overseas: number | null;
};

type CardRelation = {
  card_id: number;
  card_name: string;
  card_type: string | null;
  official_url: string | null;
  status: string | null;
  is_verified: boolean | null;
  issuers: IssuerRelation | IssuerRelation[] | null;
  card_brands: CardBrandRelation[] | null;
};

type BenefitRow = {
  benefit_id: number;
  card_id: number;
  rate: number | string | null;
  fixed_amount: number | null;
  cap_amount: number | null;
  cap_period: string | null;
  daily_limit_count: number | null;
  monthly_limit_count: number | null;
  raw_text: string | null;
  benefit_categories:
  | BenefitCategoryRelation
  | BenefitCategoryRelation[]
  | null;
  merchant_groups: MerchantGroupRelation | MerchantGroupRelation[] | null;
  usage_conditions:
  | UsageConditionRelation
  | UsageConditionRelation[]
  | null;
  cards: CardRelation | CardRelation[] | null;
};

type SignalTransaction = {
  amount: number;
  aliases: string[];
};

type CategorySignal = {
  kosisCode: string;
  name: string;
  amount: number;
  priorityFactor: number;
  aliases: string[];
  transactions: SignalTransaction[];
};

type MerchantMatch = {
  strength: number;
  matchedSpend: number;
  matchedTransactionCount: number;
  source: "merchant" | "category" | "raw_text";
};

type BenefitEstimate = {
  benefitId: number;
  card: CardRelation;
  consumerCategory: string;
  merchantGroup: string;
  benefitType: string;
  rawText: string;
  condition: UsageConditionRelation | null;
  estimatedMonthlyBenefit: number | null;
  rankingContribution: number;
};

type RankedCard = CardRecommendation & {
  rankingScore: number;
  isVerified: boolean;
};

const PAGE_SIZE = 1000;
const MAX_SIGNAL_COUNT = 5;

/**
 * 73개 merchant_groups 명칭 및 실 결제명세서(OCR) 빈출 표기 매핑 사전
 */
const MERCHANT_BRAND_ALIASES: Record<string, string[]> = {
  // 편의점 (Level 2 & 3)
  편의점: ["편의점", "cvs", "24시", "편의점결제"],
  GS25: ["gs25", "지에스25", "지에스리테일", "gs리테일", "gs25편의점", "지에스"],
  CU: ["cu", "씨유", "씨유편의점", "bgf리테일", "비지에프리테일", "씨유가맹점"],
  세븐일레븐: ["세븐일레븐", "7eleven", "7-eleven", "코리아세븐", "세븐"],
  이마트24: ["이마트24", "emart24", "이마트위드미", "위드미"],

  // 마트/백화점/쇼핑 (Level 2 & 3)
  쇼핑: ["쇼핑", "쇼핑몰", "온라인몰", "인터넷쇼핑", "쇼핑센터"],
  백화점: ["백화점", "dept", "department"],
  롯데백화점: ["롯데백화점", "롯데백화점본점", "롯데쇼핑백화점"],
  신세계백화점: ["신세계백화점", "신세계본점", "신세계강남", "신세계백화점강남"],
  현대백화점: ["현대백화점", "현대백화점무역", "현대백화점판교", "현대백화점본점"],
  대형마트: ["대형마트", "마트", "할인점", "슈퍼", "슈퍼마켓", "할인마트"],
  이마트: ["이마트", "emart", "이마트트레이더스", "트레이더스", "ssg이마트"],
  롯데마트: ["롯데마트", "lottemart", "롯데슈퍼", "롯데쇼핑마트"],
  홈플러스: ["홈플러스", "homeplus", "홈플러스익스프레스"],
  코스트코: ["코스트코", "costco", "코스트코홀세일"],
  온라인쇼핑: ["온라인쇼핑", "인터넷쇼핑", "이커머스", "쇼핑몰", "온라인몰"],
  쿠팡: ["쿠팡", "coupang", "쿠팡페이", "쿠팡로켓", "쿠팡와우"],
  "11번가": ["11번가", "십일번가", "11st", "11st.co.kr"],
  G마켓: ["g마켓", "지마켓", "지마켓글로벌", "gmarket", "이베이코리아"],
  SSG: ["ssg", "쓱", "에스에스지", "ssg닷컴", "신세계몰", "이마트몰", "쓱배송"],
  드럭스토어: ["드럭스토어", "h&b", "헬스앤뷰티", "화장품"],
  올리브영: ["올리브영", "oliveyoung", "cj올리브영", "올리브영온라인"],
  랄라블라: ["랄라블라", "lalavla"],

  // 외식/카페/배달 (Level 2 & 3)
  외식카페: ["외식", "음식점", "식당", "카페", "커피", "디저트", "베이커리", "식음료", "한식", "일식", "중식", "양식", "패스트푸드"],
  카페: ["카페", "커피", "coffee", "cafe", "디저트", "베이커리", "찻집", "베이글"],
  스타벅스: ["스타벅스", "starbucks", "스벅", "스타벅스코리아", "사이렌오더"],
  이디야: ["이디야", "ediya", "이디야커피", "이디야멤버스"],
  투썸플레이스: ["투썸플레이스", "twosome", "투썸", "atwosomeplace"],
  빽다방: ["빽다방", "paiksdabing", "더본코리아"],
  배달앱: ["배달앱", "배달", "배달음식", "배달대행", "배달주문"],
  배달의민족: ["배달의민족", "배민", "우아한형제들", "배민1", "baemin", "배민결제", "배민페이"],
  요기요: ["요기요", "yogiyo", "위대한상상", "딜리버리히어로"],
  쿠팡이츠: ["쿠팡이츠", "coupangeats", "쿠팡이츠결제"],

  // 문화/여가/구독 (Level 2 & 3)
  문화여가: ["문화", "여가", "레저", "스포츠", "공연", "전시", "영화", "취미", "티켓"],
  영화: ["영화", "영화관", "극장", "cinema", "시네마"],
  CGV: ["cgv", "씨지브이", "cjcgv"],
  롯데시네마: ["롯데시네마", "lottecinema", "롯데엔터테인먼트"],
  메가박스: ["메가박스", "megabox", "메가박스씨앤에프"],
  디지털구독: ["디지털구독", "구독", "스트리밍", "ott", "음악스트리밍", "동영상구독", "전자책"],
  넷플릭스: ["넷플릭스", "netflix", "넷플", "netflix.com"],
  유튜브프리미엄: ["유튜브프리미엄", "youtube", "유튜브", "구글페이먼트", "google*youtube", "google*유튜브", "구글페이먼츠"],
  왓챠: ["왓챠", "watcha", "왓챠피디아"],
  티빙: ["티빙", "tving", "씨제이이앤엠티빙"],
  테마파크: ["테마파크", "놀이공원", "에버랜드", "롯데월드", "워터파크", "아쿠아리움"],
  골프: ["골프", "골프장", "골프연습장", "스크린골프", "골프존"],

  // 교통/자동차/주유 (Level 2 & 3)
  교통자동차: ["교통", "대중교통", "주유", "자동차", "차량", "모빌리티", "운송"],
  주유소: ["주유소", "주유", "충전소", "lpg", "가스충전", "전기차충전"],
  "S-OIL": ["s-oil", "soil", "에쓰오일", "에스오일", "에쓰-오일", "에스-오일"],
  GS칼텍스: ["gs칼텍스", "지에스칼텍스", "gscaltex", "칼텍스"],
  SK에너지: ["sk에너지", "에스케이엔크린", "엔크린", "sk엔크린", "sk주유소"],
  현대오일뱅크: ["현대오일뱅크", "오일뱅크", "에이치디현대오일뱅크", "hd현대오일뱅크"],
  에이치디현대오일뱅크: ["에이치디현대오일뱅크", "현대오일뱅크", "오일뱅크", "hd현대오일뱅크"],
  대중교통: ["대중교통", "버스", "지하철", "철도", "코레일", "korail", "티머니", "교통요금"],
  택시: ["택시", "카카오택시", "카카오t", "우티", "타다", "아이엠택시"],

  // 여행/항공/면세 (Level 2 & 3)
  여행항공: ["여행", "항공", "호텔", "숙박", "면세", "관광", "리조트"],
  항공: ["항공", "항공사", "항공권", "비행기", "air"],
  대한항공: ["대한항공", "koreanair", "칼", "kal"],
  아시아나항공: ["아시아나항공", "asiana", "아시아나"],
  공항라운지: ["공항라운지", "라운지", "마티나", "스카이허브", "더라운지"],
  면세점: ["면세점", "면세", "dutyfree", "신라면세점", "롯데면세점", "신세계면세점", "현대백화점면세점"],

  // 생활/통신/간편결제/병원/교육 (Level 2 & 3)
  생활: ["생활", "일상", "고정비", "주거", "생활요금"],
  통신: ["통신", "이동통신", "휴대폰요금", "통신요금", "인터넷", "결합상품", "알뜰폰"],
  SK텔레콤: ["sk텔레콤", "skt", "에스케이텔레콤", "sktelecom", "t월드", "tworld"],
  KT: ["kt", "케이티", "올레kt", "olleh", "kt통신요금"],
  "LGU+": ["lgu+", "lgu", "lg유플러스", "엘지유플러스", "엘지u+", "lguplus", "lg u+"],
  간편결제: ["간편결제", "페이", "간편결제서비스", "pay", "앱카드"],
  카카오페이: ["카카오페이", "kakaopay", "카카오페이결제"],
  네이버페이: ["네이버페이", "naverpay", "네이버파이낸셜", "네이버페이결제"],
  병원약국: ["병원약국", "병원", "약국", "의원", "치과", "한의원", "의료", "안과", "이비인후과", "피부과"],
  교육육아: ["교육육아", "교육", "학원", "어린이집", "유치원", "학습지", "도서", "서점", "강의", "인강"],

  // 전가맹점/기타 (Level 2)
  모든가맹점: ["모든가맹점", "전가맹점", "국내외가맹점", "국내가맹점", "모든곳", "어디서나", "기본할인", "무조건", "국내외모든가맹점"],
  기타혜택: ["기타혜택", "기타", "캐시백", "포인트"],
};

/**
 * KOSIS 12대 소비 비목과 merchant_groups 계층 간의 연결 브릿지 맵
 */
const KOSIS_TO_MERCHANT_GROUPS: Record<string, string[]> = {
  // 01: 식료품·비주류음료 -> 마트, 편의점 등 식료품 관련
  "01": [
    "대형마트",
    "편의점",
    "이마트",
    "롯데마트",
    "홈플러스",
    "코스트코",
    "GS25",
    "CU",
    "세븐일레븐",
    "이마트24",
    "쇼핑",
  ],
  // 02: 주류·담배 -> 편의점, 마트
  "02": ["편의점", "대형마트", "GS25", "CU", "세븐일레븐", "이마트24"],
  // 03: 의류·신발 -> 백화점, 온라인쇼핑
  "03": [
    "쇼핑",
    "백화점",
    "온라인쇼핑",
    "롯데백화점",
    "신세계백화점",
    "현대백화점",
    "쿠팡",
    "11번가",
    "G마켓",
    "SSG",
  ],
  // 04: 주거·수도·광열 -> 생활, 통신 (공과금/관리비)
  "04": ["생활", "통신"],
  // 05: 가정용품·가사서비스 -> 쇼핑, 마트
  "05": [
    "쇼핑",
    "대형마트",
    "온라인쇼핑",
    "이마트",
    "롯데마트",
    "홈플러스",
    "쿠팡",
  ],
  // 06: 보건 -> 병원, 약국
  "06": ["병원약국", "생활"],
  // 07: 교통·운송 -> 교통, 주유, 대중교통, 택시
  "07": [
    "교통자동차",
    "주유소",
    "대중교통",
    "택시",
    "S-OIL",
    "GS칼텍스",
    "SK에너지",
    "현대오일뱅크",
    "에이치디현대오일뱅크",
  ],
  // 08: 정보통신 -> 통신, 디지털구독
  "08": [
    "통신",
    "디지털구독",
    "SK텔레콤",
    "KT",
    "LGU+",
    "넷플릭스",
    "유튜브프리미엄",
    "왓챠",
    "티빙",
  ],
  // 09: 오락·문화 -> 문화여가, 영화, 구독, 테마파크, 골프, 여행
  "09": [
    "문화여가",
    "영화",
    "디지털구독",
    "테마파크",
    "골프",
    "여행항공",
    "항공",
    "공항라운지",
    "면세점",
    "CGV",
    "롯데시네마",
    "메가박스",
    "넷플릭스",
    "유튜브프리미엄",
    "왓챠",
    "티빙",
    "대한항공",
    "아시아나항공",
  ],
  // 10: 교육 -> 학원, 교육, 육아
  "10": ["교육육아", "생활"],
  // 11: 음식·숙박 -> 외식, 카페, 배달
  "11": [
    "외식카페",
    "카페",
    "배달앱",
    "스타벅스",
    "이디야",
    "투썸플레이스",
    "빽다방",
    "배달의민족",
    "요기요",
    "쿠팡이츠",
  ],
  // 12: 기타상품·서비스 -> 쇼핑, 뷰티/드럭스토어, 백화점, 간편결제
  "12": [
    "쇼핑",
    "백화점",
    "온라인쇼핑",
    "드럭스토어",
    "면세점",
    "간편결제",
    "올리브영",
    "랄라블라",
    "롯데백화점",
    "신세계백화점",
    "현대백화점",
    "쿠팡",
    "11번가",
    "G마켓",
    "SSG",
    "카카오페이",
    "네이버페이",
  ],
};

const CATEGORY_ALIASES: Record<string, string[]> = {
  "식료품·비주류음료": [
    "식료품",
    "마트",
    "대형마트",
    "슈퍼",
    "슈퍼마켓",
    "편의점",
    "장보기",
  ],
  "주류·담배": ["주류", "담배"],
  "의류·신발": ["패션", "의류", "신발", "스포츠의류"],
  "주거·수도·광열": [
    "관리비",
    "공과금",
    "전기",
    "도시가스",
    "수도",
    "렌탈",
  ],
  "가정용품·가사서비스": [
    "생활용품",
    "가정용품",
    "가구",
    "가전",
    "인테리어",
    "세탁",
    "다이소",
  ],
  보건: ["병원", "의원", "약국", "의료", "건강", "헬스케어"],
  "교통·운송": [
    "교통",
    "대중교통",
    "버스",
    "지하철",
    "택시",
    "철도",
    "주유",
    "충전",
    "자동차",
    "모빌리티",
  ],
  정보통신: [
    "통신",
    "이동통신",
    "인터넷",
    "휴대폰",
    "디지털",
    "구독",
    "스트리밍",
  ],
  "오락·문화": [
    "문화",
    "영화",
    "공연",
    "전시",
    "레저",
    "스포츠",
    "여가",
    "여행",
    "티켓",
  ],
  교육: ["교육", "학원", "서점", "도서", "온라인강의"],
  "음식·숙박": [
    "외식",
    "음식점",
    "식당",
    "카페",
    "커피",
    "배달",
    "패스트푸드",
    "숙박",
    "호텔",
  ],
  "기타상품·서비스": [
    "쇼핑",
    "온라인쇼핑",
    "백화점",
    "아울렛",
    "면세점",
    "뷰티",
    "미용",
    "반려동물",
  ],
};

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]/g, "");
}

type OfficialIssuerConfig = {
  nameKeywords: string[];
  hosts: string[];
  homepage: string;
};

const OFFICIAL_ISSUER_CONFIGS: OfficialIssuerConfig[] = [
  {
    nameKeywords: ["신한"],
    hosts: ["shinhancard.com"],
    homepage: "https://www.shinhancard.com/",
  },
  {
    nameKeywords: ["kb", "국민"],
    hosts: ["kbcard.com"],
    homepage: "https://card.kbcard.com/",
  },
  {
    nameKeywords: ["삼성"],
    hosts: ["samsungcard.com"],
    homepage: "https://www.samsungcard.com/",
  },
  {
    nameKeywords: ["현대"],
    hosts: ["hyundaicard.com"],
    homepage: "https://www.hyundaicard.com/",
  },
  {
    nameKeywords: ["롯데"],
    hosts: ["lottecard.co.kr"],
    homepage: "https://www.lottecard.co.kr/",
  },
  {
    nameKeywords: ["우리"],
    hosts: ["wooricard.com"],
    homepage: "https://pc.wooricard.com/",
  },
  {
    nameKeywords: ["하나"],
    hosts: ["hanacard.co.kr"],
    homepage: "https://www.hanacard.co.kr/",
  },
  {
    nameKeywords: ["bc", "비씨"],
    hosts: ["bccard.com"],
    homepage: "https://www.bccard.com/",
  },
];

function isUrlOnAllowedHost(urlValue: string, hosts: string[]): boolean {
  try {
    const url = new URL(urlValue);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return false;
    }

    const hostname = url.hostname.toLowerCase();
    return hosts.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}

function getOfficialCardUrl(card: CardRelation): string | null {
  const issuer = firstRelation(card.issuers);
  const issuerName = normalize(issuer?.issuer_name ?? "");
  const config = OFFICIAL_ISSUER_CONFIGS.find((candidate) =>
    candidate.nameKeywords.some((keyword) => issuerName.includes(keyword)),
  );

  if (!config) {
    return null;
  }

  if (
    card.official_url &&
    isUrlOnAllowedHost(card.official_url, config.hosts)
  ) {
    return card.official_url;
  }

  if (
    issuer?.homepage_url &&
    isUrlOnAllowedHost(issuer.homepage_url, config.hosts)
  ) {
    return issuer.homepage_url;
  }

  return config.homepage;
}

function normalizeKosisCode(value: string): string {
  return value.replace(/^C/i, "").replace(/\D/g, "").padStart(2, "0");
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function toFiniteNumber(value: number | string | null | undefined): number {
  const numberValue = typeof value === "string" ? Number(value) : value;
  return typeof numberValue === "number" && Number.isFinite(numberValue)
    ? numberValue
    : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function truncateText(value: string, maxLength = 180): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length <= maxLength
    ? compact
    : `${compact.slice(0, maxLength - 1).trim()}…`;
}

function getAnnualFee(card: CardRelation): number | null {
  const fees = (card.card_brands ?? []).flatMap((brand) =>
    [brand.annual_fee_domestic, brand.annual_fee_overseas].filter(
      (fee): fee is number => typeof fee === "number" && fee >= 0,
    ),
  );

  return fees.length > 0 ? Math.min(...fees) : null;
}

function getCardTypeLabel(cardType: string | null): string {
  switch (cardType) {
    case "CHECK":
      return "체크카드";
    case "PREPAID":
      return "선불카드";
    default:
      return "신용카드";
  }
}

function isConditionEligible(
  condition: UsageConditionRelation | null,
  monthlySpend: number,
): boolean {
  const minimum = Math.max(0, condition?.min_amount ?? 0);
  const maximum = condition?.max_amount ?? null;
  const periodType = (condition?.period_type ?? "MONTHLY").toUpperCase();

  // 현재 DB의 대부분은 MONTHLY 전월 실적 조건입니다.
  if (periodType !== "MONTHLY") {
    return false;
  }

  return (
    monthlySpend >= minimum &&
    (maximum === null || monthlySpend <= maximum)
  );
}

function getConditionLabel(condition: UsageConditionRelation | null): string {
  const minimum = Math.max(0, condition?.min_amount ?? 0);
  const maximum = condition?.max_amount ?? null;

  if (minimum === 0 && maximum === null) {
    return "전월 실적 조건 없음 또는 0원";
  }

  if (maximum !== null) {
    return `전월 실적 ${minimum.toLocaleString("ko-KR")}원 이상 ${maximum.toLocaleString("ko-KR")}원 이하`;
  }

  return `전월 실적 ${minimum.toLocaleString("ko-KR")}원 이상`;
}

function getMonthlyCap(
  capAmount: number | null,
  capPeriod: string | null,
  estimatedUses: number,
): number | null {
  if (capAmount === null || capAmount <= 0) {
    return null;
  }

  switch ((capPeriod ?? "MONTHLY").toUpperCase()) {
    case "DAILY":
      return capAmount * 30;
    case "QUARTERLY":
      return capAmount / 3;
    case "YEARLY":
      return capAmount / 12;
    case "PER_USE":
      return capAmount * estimatedUses;
    default:
      return capAmount;
  }
}

function getEstimatedUses(
  benefit: BenefitRow,
  matchedTransactionCount: number,
): number {
  const rawText = benefit.raw_text ?? "";
  const appearsPerUse = /(건당|회당|매건|1회|결제건)/.test(rawText);
  let uses = appearsPerUse ? Math.max(1, matchedTransactionCount) : 1;

  if ((benefit.monthly_limit_count ?? 0) > 0) {
    uses = Math.min(uses, benefit.monthly_limit_count ?? uses);
  }

  if ((benefit.daily_limit_count ?? 0) > 0) {
    uses = Math.min(uses, (benefit.daily_limit_count ?? 1) * 30);
  }

  return Math.max(1, uses);
}

function estimateBenefitValue(
  benefit: BenefitRow,
  eligibleSpend: number,
  matchedTransactionCount: number,
): number | null {
  const rawRate = Math.max(0, toFiniteNumber(benefit.rate));
  const rate = rawRate > 0 && rawRate <= 100 ? rawRate : 0;
  const fixedAmount = Math.max(0, benefit.fixed_amount ?? 0);

  if (rate <= 0 && fixedAmount <= 0) {
    return null;
  }

  const estimatedUses = getEstimatedUses(benefit, matchedTransactionCount);
  const candidates: number[] = [];

  if (rate > 0) {
    candidates.push(eligibleSpend * (rate / 100));
  }

  if (fixedAmount > 0) {
    candidates.push(fixedAmount * estimatedUses);
  }

  const uncappedValue = Math.min(...candidates);
  const monthlyCap = getMonthlyCap(
    benefit.cap_amount,
    benefit.cap_period,
    estimatedUses,
  );

  return monthlyCap === null
    ? uncappedValue
    : Math.min(uncappedValue, monthlyCap);
}

function getParentChain(
  group: MerchantGroupRelation,
  groupsById: Map<number, MerchantGroupRow>,
): MerchantGroupRow[] {
  const chain: MerchantGroupRow[] = [group];
  const visited = new Set<number>([group.group_id]);
  let parentId = group.parent_group_id;

  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = groupsById.get(parentId);
    if (!parent) break;
    chain.push(parent);
    parentId = parent.parent_group_id;
  }

  return chain;
}

function getMerchantGroupPath(chain: MerchantGroupRow[]): string {
  return chain
    .map((group) => group.group_name)
    .reverse()
    .join(" > ");
}

function getPeerPriorityFactor(spendingIndex: number | null): number {
  if (spendingIndex === null || !Number.isFinite(spendingIndex)) return 1;
  return clamp(spendingIndex / 100, 0.85, 1.25);
}

function buildCategorySignals(
  categories: RecommendationCategoryInput[],
  transactions: Transaction[],
): CategorySignal[] {
  return categories
    .filter((category) => category.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, MAX_SIGNAL_COUNT)
    .map((category) => {
      const categoryCode = normalizeKosisCode(category.kosisCode);
      const relatedTransactions = transactions.flatMap((transaction) => {
        const classification = transaction.classification;
        if (
          transaction.transactionType !== "payment" ||
          transaction.amount <= 0 ||
          classification?.matched !== true ||
          normalizeKosisCode(classification.kosisCode) !== categoryCode
        ) {
          return [];
        }

        return [
          {
            amount: transaction.amount,
            aliases: uniqueStrings([
              classification.standardCategory,
              classification.kosisCategory,
              transaction.normalizedMerchantName,
              transaction.merchantName,
            ]),
          },
        ];
      });

      return {
        kosisCode: categoryCode,
        name: category.name,
        amount: category.amount,
        priorityFactor: getPeerPriorityFactor(category.spendingIndex),
        aliases: uniqueStrings([
          category.name,
          ...(CATEGORY_ALIASES[category.name] ?? []),
          ...relatedTransactions.flatMap((transaction) => transaction.aliases),
        ]),
        transactions: relatedTransactions,
      };
    });
}

/**
 * 브랜드명, 약어, 영문/한글 혼용 표기 일치 여부 정밀 판별
 */
function brandMatches(transactionAlias: string, groupName: string): boolean {
  const normTrans = normalize(transactionAlias);
  const normGroup = normalize(groupName);

  if (normTrans.length < 2 || normGroup.length < 2) return false;

  // 1. 직접 문자열 포함 여부
  if (normTrans.includes(normGroup) || normGroup.includes(normTrans)) {
    return true;
  }

  // 2. 동의어 사전 매핑 검사
  const groupAliases = MERCHANT_BRAND_ALIASES[groupName]?.map(normalize) ?? [];
  for (const alias of groupAliases) {
    if (alias.length >= 2 && (normTrans.includes(alias) || alias.includes(normTrans))) {
      return true;
    }
  }

  return false;
}

/**
 * 무조건 할인/적립(전 가맹점) 그룹인지 판별 (group_id: 29 또는 group이 없는 경우)
 */
function isUniversalGroup(group: MerchantGroupRelation | null): boolean {
  if (!group) return true;
  if (group.group_id === 29) {
    return true;
  }
  const norm = normalize(group.group_name);
  return norm.includes("모든가맹점") || norm.includes("전가맹점");
}

function getMerchantMatch(
  signal: CategorySignal,
  groupChain: MerchantGroupRow[],
  rawText: string,
): MerchantMatch {
  const groupNames = groupChain.map((group) => group.group_name);
  const childGroupName = groupNames[0] ?? "";
  const isGenericOtherGroup =
    childGroupName === "기타혜택" || childGroupName === "기타";

  // 1. 구체적인 가맹점 그룹인 경우: 거래내역 가맹점/브랜드 일치 검사
  if (!isGenericOtherGroup) {
    const matchedTransactions = signal.transactions.filter((transaction) =>
      transaction.aliases.some((alias) =>
        groupNames.some((groupName) => brandMatches(alias, groupName)),
      ),
    );

    if (matchedTransactions.length > 0) {
      const directChildMatch = matchedTransactions.some((transaction) =>
        transaction.aliases.some((alias) => brandMatches(alias, childGroupName)),
      );

      return {
        strength: directChildMatch ? 1.0 : 0.92,
        matchedSpend: matchedTransactions.reduce(
          (sum, transaction) => sum + transaction.amount,
          0,
        ),
        matchedTransactionCount: matchedTransactions.length,
        source: "merchant",
      };
    }

    // 2. KOSIS Category Bridge Match (12대 비목과 merchant_groups 간 체계 연결)
    const bridgeGroups = KOSIS_TO_MERCHANT_GROUPS[signal.kosisCode] ?? [];
    const bridgeMatchedIndex = groupNames.findIndex((groupName) =>
      bridgeGroups.some((bg) => brandMatches(bg, groupName)),
    );

    if (bridgeMatchedIndex >= 0) {
      return {
        strength: bridgeMatchedIndex === 0 ? 0.88 : 0.78,
        matchedSpend: signal.amount,
        matchedTransactionCount: Math.max(1, signal.transactions.length),
        source: "category",
      };
    }

    // 3. Category Aliases Match (상위 '생활', '기타' 등 광범위한 그룹의 False Positive 방지)
    const categoryMatchIndex = groupNames.findIndex((groupName) => {
      if (groupName === "생활" || groupName === "기타") return false;
      return signal.aliases.some((alias) => brandMatches(alias, groupName));
    });

    if (categoryMatchIndex >= 0) {
      return {
        strength: categoryMatchIndex === 0 ? 0.82 : 0.72,
        matchedSpend: signal.amount,
        matchedTransactionCount: Math.max(1, signal.transactions.length),
        source: "category",
      };
    }
  }

  // 4. Raw text match (특히 group_id: 30 기타혜택 등 원문에 상세 혜택이 기술된 경우)
  const normRaw = normalize(rawText);
  let directMatchedSpend = 0;
  let directMatchCount = 0;

  for (const transaction of signal.transactions) {
    if (
      transaction.aliases.some((alias) => {
        const normAlias = normalize(alias);
        return normAlias.length >= 2 && normRaw.includes(normAlias);
      })
    ) {
      directMatchedSpend += transaction.amount;
      directMatchCount++;
    }
  }

  if (directMatchedSpend > 0) {
    return {
      strength: 0.9,
      matchedSpend: directMatchedSpend,
      matchedTransactionCount: directMatchCount,
      source: "merchant",
    };
  }

  const rawTextMatched = signal.aliases.some((alias) => {
    const normAlias = normalize(alias);
    return normAlias.length >= 2 && normRaw.includes(normAlias);
  });

  if (rawTextMatched) {
    return {
      strength: 0.65,
      matchedSpend: signal.amount,
      matchedTransactionCount: Math.max(1, signal.transactions.length),
      source: "raw_text",
    };
  }

  return {
    strength: 0,
    matchedSpend: 0,
    matchedTransactionCount: 0,
    source: "category",
  };
}

async function fetchAllBenefits(): Promise<BenefitRow[]> {
  const rows: BenefitRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("benefits")
      .select(`
        benefit_id, card_id, rate, fixed_amount, cap_amount, cap_period,
        daily_limit_count, monthly_limit_count, raw_text,
        benefit_categories ( category_id, category_name, category_group ),
        merchant_groups ( group_id, group_name, parent_group_id ),
        usage_conditions ( min_amount, max_amount, period_type ),
        cards!inner (
          card_id, card_name, card_type, official_url, status, is_verified,
          issuers ( issuer_name, homepage_url ),
          card_brands ( annual_fee_domestic, annual_fee_overseas )
        )
      `)
      .eq("cards.status", "ACTIVE")
      .order("benefit_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`카드 혜택 조회 실패: ${error.message}`);
    }

    const page = (data ?? []) as unknown as BenefitRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

export async function getTopCardRecommendations({
  categories,
  transactions,
  monthlySpend,
  cardTiType,
  excludedCardName = "",
}: RecommendationRequest): Promise<CardRecommendation[]> {
  const signals = buildCategorySignals(categories, transactions);
  if (signals.length === 0 || monthlySpend <= 0) return [];

  const { data: groupData, error: groupError } = await supabase
    .from("merchant_groups")
    .select("group_id, group_name, parent_group_id")
    .order("group_id", { ascending: true });

  if (groupError) {
    throw new Error(`가맹점 그룹 조회 실패: ${groupError.message}`);
  }

  const groups = (groupData ?? []) as unknown as MerchantGroupRow[];
  const groupsById = new Map(groups.map((group) => [group.group_id, group]));
  const benefits = await fetchAllBenefits();
  const excludedName = normalize(excludedCardName);
  const estimatesByCard = new Map<number, BenefitEstimate[]>();

  for (const benefit of benefits) {
    const card = firstRelation(benefit.cards);
    const benefitCategory = firstRelation(benefit.benefit_categories);
    if (!card || !benefitCategory) continue;

    if (excludedName && normalize(card.card_name).includes(excludedName)) {
      continue;
    }

    const group = firstRelation(benefit.merchant_groups);
    const condition = firstRelation(benefit.usage_conditions);
    if (!isConditionEligible(condition, monthlySpend)) continue;

    const rawText = benefit.raw_text?.trim() || "혜택 원문 정보 없음";
    const benefitType = benefitCategory.category_name?.trim() || "혜택";
    const isUniversal = isUniversalGroup(group);

    let bestEstimate: BenefitEstimate | null = null;

    if (isUniversal) {
      // 1. 모든가맹점(29, 기타, null) 혜택 정상 평가
      const estimatedMonthlyBenefit = estimateBenefitValue(
        benefit,
        monthlySpend,
        Math.max(1, transactions.length),
      );
      const numericBase =
        estimatedMonthlyBenefit ?? Math.min(60, monthlySpend * 0.0005);

      bestEstimate = {
        benefitId: benefit.benefit_id,
        card,
        consumerCategory: "전 가맹점",
        merchantGroup: "전 가맹점",
        benefitType,
        rawText,
        condition,
        estimatedMonthlyBenefit,
        rankingContribution: numericBase * 0.75,
      };
    } else if (group) {
      // 2. 특정 가맹점 그룹 혜택 평가
      const groupChain = getParentChain(group, groupsById);
      const merchantGroup = getMerchantGroupPath(groupChain);

      for (const signal of signals) {
        const match = getMerchantMatch(signal, groupChain, rawText);
        if (match.strength <= 0 || match.matchedSpend <= 0) continue;

        const estimatedMonthlyBenefit = estimateBenefitValue(
          benefit,
          match.matchedSpend,
          match.matchedTransactionCount,
        );
        const numericBase =
          estimatedMonthlyBenefit ?? Math.min(80, match.matchedSpend * 0.001);
        const sourceFactor =
          match.source === "merchant"
            ? 1.0
            : match.source === "category"
              ? 0.9
              : 0.75;
        const rankingContribution =
          numericBase *
          match.strength *
          sourceFactor *
          signal.priorityFactor;

        const estimate: BenefitEstimate = {
          benefitId: benefit.benefit_id,
          card,
          consumerCategory: signal.name,
          merchantGroup,
          benefitType,
          rawText,
          condition,
          estimatedMonthlyBenefit,
          rankingContribution,
        };

        if (
          !bestEstimate ||
          estimate.rankingContribution > bestEstimate.rankingContribution
        ) {
          bestEstimate = estimate;
        }
      }
    }

    if (!bestEstimate || bestEstimate.rankingContribution <= 0) continue;

    const current = estimatesByCard.get(card.card_id) ?? [];
    current.push(bestEstimate);
    estimatesByCard.set(card.card_id, current);
  }

  const rankedCards: RankedCard[] = [];

  for (const [cardId, estimates] of estimatesByCard.entries()) {
    const card = estimates[0]?.card;
    if (!card) continue;

    const bestByBenefitId = new Map<number, BenefitEstimate>();
    for (const estimate of estimates) {
      const existing = bestByBenefitId.get(estimate.benefitId);
      if (
        !existing ||
        estimate.rankingContribution > existing.rankingContribution
      ) {
        bestByBenefitId.set(estimate.benefitId, estimate);
      }
    }

    // 같은 소비 분야·적용처에서 여러 혜택이 겹치면 가장 강한 한 건만 반영
    const bestByArea = new Map<string, BenefitEstimate>();
    for (const estimate of bestByBenefitId.values()) {
      const key = `${estimate.consumerCategory}|${estimate.merchantGroup}`;
      const existing = bestByArea.get(key);
      if (!existing || estimate.rankingContribution > existing.rankingContribution) {
        bestByArea.set(key, estimate);
      }
    }

    const selected = [...bestByArea.values()]
      .sort((a, b) => b.rankingContribution - a.rankingContribution)
      .slice(0, 4);
    if (selected.length === 0) continue;

    const annualFee = getAnnualFee(card);
    const monthlyFee = annualFee === null ? 0 : annualFee / 12;
    const rawContributionSum = selected.reduce(
      (sum, estimate) => sum + estimate.rankingContribution,
      0,
    );

    // 연회비 차감 및 실익 평가 (실익이 있거나 혜택 기여도가 충분한 경우 추천)
    const rankingScore = rawContributionSum - monthlyFee * 0.5;
    if (rankingScore <= 0 && rawContributionSum <= 0) continue;

    const estimatedValues = selected
      .map((estimate) => estimate.estimatedMonthlyBenefit)
      .filter((value): value is number => value !== null && value > 0);
    const estimatedMonthlyBenefit =
      estimatedValues.length > 0
        ? estimatedValues.reduce((sum, value) => sum + value, 0)
        : null;
    const issuer = firstRelation(card.issuers);
    const highlight = selected[0];
    const matchedCategories = uniqueStrings(
      selected
        .map((estimate) => estimate.consumerCategory)
        .filter((category) => category !== "전 가맹점"),
    ).slice(0, 3);
    const benefitTypes = uniqueStrings(
      selected.map((estimate) => estimate.benefitType),
    ).slice(0, 3);
    const primaryCategory =
      highlight.consumerCategory === "전 가맹점"
        ? `${cardTiType} 소비 유형`
        : `${highlight.consumerCategory} 소비`;
    const benefitValueText =
      highlight.estimatedMonthlyBenefit === null
        ? "혜택 원문과 적용처가 소비 패턴에 연결돼요."
        : `현재 소비내역 기준 월 약 ${Math.round(
          highlight.estimatedMonthlyBenefit,
        ).toLocaleString("ko-KR")}원 상당으로 추정돼요.`;

    rankedCards.push({
      rank: 0,
      cardId,
      cardName: card.card_name,
      cardType: getCardTypeLabel(card.card_type),
      issuerName: issuer?.issuer_name ?? "카드사 정보 없음",
      annualFee,
      estimatedMonthlyBenefit,
      matchedCategories,
      benefitTypes,
      recommendationReason: `${primaryCategory}와 ${highlight.merchantGroup} 혜택이 직접 연결돼 추천했어요. ${benefitValueText}`,
      applicationUrl: getOfficialCardUrl(card),
      benefits: selected.slice(0, 3).map((estimate) => ({
        benefitId: estimate.benefitId,
        consumerCategory: estimate.consumerCategory,
        merchantGroup: estimate.merchantGroup,
        benefitType: estimate.benefitType,
        rawText: truncateText(estimate.rawText),
        usageConditionLabel: getConditionLabel(estimate.condition),
        estimatedMonthlyBenefit: estimate.estimatedMonthlyBenefit,
        estimateMethodLabel:
          estimate.estimatedMonthlyBenefit === null
            ? "혜택 원문만 연결됨"
            : "현재 명세서 실적 충족 · 혜택률/정액 · 한도 반영",
      })),
      isCardDataVerified: card.is_verified === true,
      rankingScore,
      isVerified: card.is_verified === true,
    });
  }

  return rankedCards
    .sort((a, b) => {
      if (b.rankingScore !== a.rankingScore) {
        return b.rankingScore - a.rankingScore;
      }
      if (a.isVerified !== b.isVerified) {
        return Number(b.isVerified) - Number(a.isVerified);
      }
      const aFee = a.annualFee ?? Number.MAX_SAFE_INTEGER;
      const bFee = b.annualFee ?? Number.MAX_SAFE_INTEGER;
      if (aFee !== bFee) return aFee - bFee;
      return a.cardId - b.cardId;
    })
    .slice(0, 3)
    .map(({ rankingScore, isVerified, ...card }, index) => {
      void rankingScore;
      void isVerified;

      return {
        ...card,
        rank: index + 1,
      };
    });
}
