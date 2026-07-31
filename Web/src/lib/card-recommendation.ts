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

  // 현재 DB의 대부분은 MONTHLY 전월 실적 조건입니다. 다른 주기는
  // 명세서 한 달치만으로 정확히 판단할 수 없어 보수적으로 제외합니다.
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

  // 할인률과 정액 값이 동시에 있을 때 데이터 의미가 불명확할 수 있어
  // 더 작은 값을 사용해 과대 추정을 피합니다.
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

function textMatches(left: string, right: string): boolean {
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);

  if (normalizedLeft.length < 2 || normalizedRight.length < 2) return false;

  return (
    normalizedLeft.includes(normalizedRight) ||
    normalizedRight.includes(normalizedLeft)
  );
}

function getMerchantMatch(
  signal: CategorySignal,
  groupChain: MerchantGroupRow[],
  rawText: string,
): MerchantMatch {
  const groupNames = groupChain.map((group) => group.group_name);
  const childGroupName = groupNames[0] ?? "";

  const matchedTransactions = signal.transactions.filter((transaction) =>
    transaction.aliases.some((alias) =>
      groupNames.some((groupName) => textMatches(alias, groupName)),
    ),
  );

  if (matchedTransactions.length > 0) {
    const directChildMatch = matchedTransactions.some((transaction) =>
      transaction.aliases.some((alias) => textMatches(alias, childGroupName)),
    );

    return {
      strength: directChildMatch ? 1 : 0.9,
      matchedSpend: matchedTransactions.reduce(
        (sum, transaction) => sum + transaction.amount,
        0,
      ),
      matchedTransactionCount: matchedTransactions.length,
      source: "merchant",
    };
  }

  const categoryMatchIndex = groupNames.findIndex((groupName) =>
    signal.aliases.some((alias) => textMatches(alias, groupName)),
  );

  if (categoryMatchIndex >= 0) {
    return {
      strength: categoryMatchIndex === 0 ? 0.9 : 0.78,
      matchedSpend: signal.amount,
      matchedTransactionCount: Math.max(1, signal.transactions.length),
      source: "category",
    };
  }

  const rawTextMatched = signal.aliases.some((alias) =>
    textMatches(alias, rawText),
  );

  if (rawTextMatched) {
    return {
      strength: 0.58,
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
    let bestEstimate: BenefitEstimate | null = null;

    if (group) {
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
          estimatedMonthlyBenefit ?? Math.min(60, match.matchedSpend * 0.0005);
        const sourceFactor =
          match.source === "merchant"
            ? 1
            : match.source === "category"
              ? 0.9
              : 0.72;
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
    } else {
      const estimatedMonthlyBenefit = estimateBenefitValue(
        benefit,
        monthlySpend,
        Math.max(1, transactions.length),
      );
      const numericBase =
        estimatedMonthlyBenefit ?? Math.min(40, monthlySpend * 0.00025);

      bestEstimate = {
        benefitId: benefit.benefit_id,
        card,
        consumerCategory: "전 가맹점",
        merchantGroup: "전 가맹점",
        benefitType,
        rawText,
        condition,
        estimatedMonthlyBenefit,
        rankingContribution: numericBase * 0.5,
      };
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

    // 같은 소비 분야·적용처에서 여러 혜택이 겹치면 가장 강한 한 건만
    // 반영해 예상 혜택이 과도하게 중복 계산되지 않도록 합니다.
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
    const rankingScore =
      selected.reduce((sum, estimate) => sum + estimate.rankingContribution, 0) -
      monthlyFee;
    if (rankingScore <= 0) continue;

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
