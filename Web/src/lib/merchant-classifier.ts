import mappingData from "@/data/mbti-mcc-mapping.json";

export type MerchantClassificationSource =
  | "merchant_keyword"
  | "actual_mcc"
  | "llm_fallback"
  | "user_override"
  | "unmapped";

type MappingRule = {
  ruleId: string;
  priority: number;
  standardCategory: string;
  merchantKeywords: string[];
  mccCodes: string[];
  mccOnlyAllowed: boolean;
  weights: {
    ie: number;
    vr: number;
    nw: number;
  };
  kosis: {
    code: string;
    name: string;
  };
  confidence: string;
};

export type MerchantClassification = {
  matched: boolean;
  ruleId: string;
  standardCategory: string;
  matchedKeyword: string;
  candidateMccCodes: string[];
  kosisCode: string;
  kosisCategory: string;
  ieWeight: number;
  vrWeight: number;
  nwWeight: number;
  confidence: string;
  classificationSource: MerchantClassificationSource;
};

export type MerchantRuleOption = {
  ruleId: string;
  standardCategory: string;
};

export type MerchantLlmRuleOption = MerchantRuleOption & {
  examples: string[];
  mccCodes: string[];
};

const rules = mappingData.rules as MappingRule[];

const GENERIC_CAFE_PATTERN = /(카페|커피|coffee|cafe|로스터리)/i;
const GENERIC_CAFE_EXCLUSION_PATTERN =
  /(스터디\s*카페|study\s*cafe|독서실|방탈출|보드게임|룸카페|카페24|편의점카페할인|카페할인|커피머신|커피용품)/i;
const LOW_COST_CAFE_MAX_SINGLE_PAYMENT = 5500;

function normalizeForMatching(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function normalizeMcc(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length === 4 ? digits : "";
}

function buildClassification(
  rule: MappingRule,
  source: MerchantClassificationSource,
  options?: {
    matchedKeyword?: string;
    confidence?: string;
  },
): MerchantClassification {
  return {
    matched: true,
    ruleId: rule.ruleId,
    standardCategory: rule.standardCategory,
    matchedKeyword: options?.matchedKeyword ?? "",
    candidateMccCodes: rule.mccCodes,
    kosisCode: rule.kosis.code,
    kosisCategory: rule.kosis.name,
    ieWeight: rule.weights.ie,
    vrWeight: rule.weights.vr,
    nwWeight: rule.weights.nw,
    confidence: options?.confidence ?? rule.confidence,
    classificationSource: source,
  };
}

export function getUnmappedClassification(
  source: MerchantClassificationSource = "unmapped",
): MerchantClassification {
  return {
    matched: false,
    ruleId: "",
    standardCategory: "미분류",
    matchedKeyword: "",
    candidateMccCodes: [],
    kosisCode: "",
    kosisCategory: "미분류",
    ieWeight: 0,
    vrWeight: 0,
    nwWeight: 0,
    confidence: source === "user_override" ? "사용자 확인" : "낮음",
    classificationSource: source,
  };
}

export function getClassificationFromRuleId(
  ruleId: string,
  source: MerchantClassificationSource,
  confidence?: string,
): MerchantClassification | null {
  const matchedRule = rules.find((rule) => rule.ruleId === ruleId);

  if (!matchedRule) {
    return null;
  }

  return buildClassification(matchedRule, source, { confidence });
}

export function getMerchantRuleOptions(): MerchantRuleOption[] {
  return [
    ...new Map(
      rules.map((rule) => [
        rule.standardCategory,
        {
          ruleId: rule.ruleId,
          standardCategory: rule.standardCategory,
        },
      ]),
    ).values(),
  ];
}

export function getMerchantLlmRuleOptions(): MerchantLlmRuleOption[] {
  return rules.map((rule) => ({
    ruleId: rule.ruleId,
    standardCategory: rule.standardCategory,
    examples: rule.merchantKeywords.slice(0, 10),
    mccCodes: rule.mccCodes,
  }));
}

export function classifyMerchant(
  normalizedMerchantName: string,
  actualMcc = "",
  amount = 0,
): MerchantClassification {
  const target = normalizeForMatching(normalizedMerchantName);

  const sortedRules = [...rules].sort(
    (a, b) => b.priority - a.priority,
  );

  for (const rule of sortedRules) {
    const matchedKeyword = rule.merchantKeywords.find((keyword) =>
      target.includes(normalizeForMatching(keyword)),
    );

    if (!matchedKeyword) {
      continue;
    }

    return buildClassification(rule, "merchant_keyword", {
      matchedKeyword,
    });
  }

  /*
   * 상호명에 카페·커피가 명시된 일반 매장은 사용자가 직접 고치지 않아도
   * 결제금액을 보조 신호로 저가형/프리미엄 카페 규칙에 연결합니다.
   * 스터디카페·방탈출카페처럼 별도 목적이 명확한 명칭은 제외합니다.
   */
  if (
    GENERIC_CAFE_PATTERN.test(normalizedMerchantName) &&
    !GENERIC_CAFE_EXCLUSION_PATTERN.test(normalizedMerchantName)
  ) {
    const cafeRuleId =
      amount > 0 && amount <= LOW_COST_CAFE_MAX_SINGLE_PAYMENT
        ? "R010"
        : "R011";
    const cafeRule = sortedRules.find((rule) => rule.ruleId === cafeRuleId);

    if (cafeRule) {
      return buildClassification(cafeRule, "merchant_keyword", {
        matchedKeyword: "카페/커피 일반명",
        confidence: "중",
      });
    }
  }

  const normalizedActualMcc = normalizeMcc(actualMcc);

  if (normalizedActualMcc) {
    const mccCandidates = sortedRules.filter((rule) =>
      rule.mccCodes.includes(normalizedActualMcc),
    );

    /*
     * 같은 MCC가 여러 카테고리에 걸리면 자동 확정하지 않습니다.
     * 단, mccOnlyAllowed 규칙이 하나뿐인 경우에는 그 규칙을 사용합니다.
     */
    const mccOnlyCandidates = mccCandidates.filter(
      (rule) => rule.mccOnlyAllowed,
    );

    const mccRule =
      mccCandidates.length === 1
        ? mccCandidates[0]
        : mccOnlyCandidates.length === 1
          ? mccOnlyCandidates[0]
          : null;

    if (mccRule) {
      return buildClassification(mccRule, "actual_mcc", {
        confidence: "중",
      });
    }
  }

  return getUnmappedClassification();
}
