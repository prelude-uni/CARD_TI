import ageSpendingData from "@/data/age-spending-benchmark.json";
import benchmarkData from "@/data/seoul-age-sales-benchmarks.json";
import type { Transaction } from "@/lib/upstage/information-extract";

export type PeerAgeGroupCode =
  | "age_10s"
  | "age_20s"
  | "age_30s"
  | "age_40s"
  | "age_50s"
  | "age_60_plus";

export type PeerSpendingLevel =
  | "very_low"
  | "low"
  | "similar"
  | "high"
  | "very_high"
  | "unavailable";

type BenchmarkCategory = {
  name: string;
  salesAmount: number;
  salesCount: number;
  salesRatio: number;
  averageTicketAmount: number;
  sourceIndustryCount: number;
};

type BenchmarkAgeGroup = {
  ageGroupName: string;
  mappedSalesAmount: number;
  mappedSalesCount: number;
  excludedSalesAmount: number;
  excludedSalesCount: number;
  excludedSalesRatio: number;
  categories: Record<string, BenchmarkCategory>;
};

type SeoulBenchmarkData = {
  metadata: {
    sourceFile: string;
    sourceName: string;
    scope: string;
    rawDataRowCount: number;
    csvRowCountIncludingHeader: number;
    quarterCount: number;
    serviceIndustryCount: number;
    selectedQuarters: string[];
    selectedPeriodLabel: string;
    aggregationMethod: string;
    ratioDenominator: string;
    mappedIndustryCount: number;
    excludedIndustryCodes: string[];
    excludedIndustryReason: string;
    percentileSupported: boolean;
    perPersonAverageSupported: boolean;
    averageTicketSupported: boolean;
  };
  ageGroups: Array<{
    code: PeerAgeGroupCode;
    name: string;
  }>;
  benchmarks: Record<PeerAgeGroupCode, BenchmarkAgeGroup>;
};

type AgeSpendingCategory = {
  name: string;
  monthlyAmount: number;
  share: number;
  sharePct: number;
};

type AgeSpendingGroup = {
  label: string;
  benchmarkTotalMonthlyConsumption: number;
  categories: Record<string, AgeSpendingCategory>;
};

type AgeSpendingData = {
  metadata: {
    source_description: string;
    periods_used: string[];
    limitations: string[];
  };
  ageGroups: Record<string, AgeSpendingGroup>;
};

export type PeerCategoryComparison = {
  kosisCode: string;
  categoryName: string;
  userAmount: number;
  /** 전체 분석 소비에서 차지하는 비중. 지출 구성·도넛 차트용입니다. */
  userRatio: number;
  /** 비교 가능한 분야만 다시 합산한 내 비중. 또래 소비지수 계산용입니다. */
  comparisonUserRatio: number | null;
  userTransactionCount: number;
  userAverageTicketAmount: number;
  /** 비교 제외 분야는 null입니다. 비교 가능한 분야끼리 재정규화한 비중입니다. */
  benchmarkSalesRatio: number | null;
  benchmarkAverageTicketAmount: number | null;
  spendingIndex: number | null;
  differencePercent: number | null;
  level: PeerSpendingLevel;
  comparisonUnavailableReason: string | null;
  /** 다른 모집단의 참고값이며 소비지수에는 사용하지 않습니다. */
  referenceBenchmarkText: string | null;
  referenceBenchmarkNote: string | null;
};

export type PeerSpendingResult = {
  ready: boolean;
  ageGroupCode: PeerAgeGroupCode;
  ageGroupName: string;
  benchmarkLabel: string;
  referencePeriodLabel: string;
  userTotalAmount: number;
  comparableUserTotalAmount: number;
  includedTransactionCount: number;
  excludedTransactionCount: number;
  excludedBenchmarkSalesRatio: number;
  comparisons: PeerCategoryComparison[];
  topByAmount: PeerCategoryComparison | null;
  topAbovePeer: PeerCategoryComparison | null;
};

const data = benchmarkData as SeoulBenchmarkData;
const ageData = ageSpendingData as AgeSpendingData;

export const peerAgeGroups = data.ageGroups;

const PEER_INDEX_EXCLUDED_CODES = new Set(["07"]);
const PEER_INDEX_EXCLUSION_REASONS: Record<string, string> = {
  "07":
    "서울 상권 데이터의 교통 항목에는 버스·지하철 등 대중교통 이용금액이 포함되지 않아 또래 소비지수에서 제외했어요.",
};

function normalizeKosisCode(value: string): string {
  const digits = value.replace(/^C/i, "").replace(/\D/g, "");
  return digits.padStart(2, "0");
}

function getSpendingLevel(index: number | null): PeerSpendingLevel {
  if (index === null) return "unavailable";
  if (index < 70) return "very_low";
  if (index < 90) return "low";
  if (index <= 110) return "similar";
  if (index <= 150) return "high";
  return "very_high";
}

export function getPeerSpendingLevelLabel(
  level: PeerSpendingLevel,
): string {
  switch (level) {
    case "very_low":
      return "또래보다 소비 비중 낮음";
    case "low":
      return "또래보다 소비 비중 다소 낮음";
    case "similar":
      return "또래와 소비 비중 비슷";
    case "high":
      return "또래보다 소비 비중 다소 높음";
    case "very_high":
      return "또래보다 소비 비중 높음";
    case "unavailable":
      return "또래 비교 제외";
  }
}

function getTransportReference(ageGroupCode: PeerAgeGroupCode): {
  text: string;
  note: string;
} {
  const note =
    "전국 2인 이상 가구의 전체 소비지출 기준이라 개인 카드 소비지수에는 사용하지 않았어요.";

  if (ageGroupCode === "age_60_plus") {
    const age60 = ageData.ageGroups["60_69"]?.categories["07"]?.sharePct;
    const age70 = ageData.ageGroups["70_plus"]?.categories["07"]?.sharePct;

    if (typeof age60 === "number" && typeof age70 === "number") {
      const low = Math.min(age60, age70).toFixed(1);
      const high = Math.max(age60, age70).toFixed(1);
      return {
        text: `KOSIS 60세 이상 가구 참고 범위 ${low}~${high}%`,
        note,
      };
    }
  }

  const key =
    ageGroupCode === "age_40s"
      ? "40_49"
      : ageGroupCode === "age_50s"
        ? "50_59"
        : "under_40";
  const group = ageData.ageGroups[key];
  const sharePct = group?.categories["07"]?.sharePct;

  return {
    text:
      group && typeof sharePct === "number"
        ? `KOSIS ${group.label} 참고 비중 ${sharePct.toFixed(1)}%`
        : "KOSIS 교통비 참고값 없음",
    note,
  };
}

export function calculatePeerSpendingComparison(
  transactions: Transaction[],
  ageGroupCode: PeerAgeGroupCode,
): PeerSpendingResult {
  const benchmark =
    data.benchmarks[ageGroupCode] ?? data.benchmarks.age_20s;

  const knownKosisCodes = new Set(Object.keys(benchmark.categories));

  const eligibleTransactions = transactions.filter((transaction) => {
    if (
      transaction.transactionType !== "payment" ||
      transaction.amount <= 0 ||
      transaction.classification?.matched !== true ||
      transaction.classification.kosisCode.length === 0
    ) {
      return false;
    }

    return knownKosisCodes.has(
      normalizeKosisCode(transaction.classification.kosisCode),
    );
  });

  const userTotalAmount = eligibleTransactions.reduce(
    (sum, transaction) => sum + transaction.amount,
    0,
  );

  const baseResult = {
    ageGroupCode,
    ageGroupName: benchmark.ageGroupName,
    benchmarkLabel: `${benchmark.ageGroupName} 소비`,
    referencePeriodLabel: data.metadata.selectedPeriodLabel,
    excludedBenchmarkSalesRatio: benchmark.excludedSalesRatio,
  };

  if (userTotalAmount <= 0) {
    return {
      ...baseResult,
      ready: false,
      userTotalAmount: 0,
      comparableUserTotalAmount: 0,
      includedTransactionCount: 0,
      excludedTransactionCount: transactions.length,
      comparisons: [],
      topByAmount: null,
      topAbovePeer: null,
    };
  }

  const amountByCategory = new Map<string, number>();
  const countByCategory = new Map<string, number>();

  for (const transaction of eligibleTransactions) {
    const kosisCode = normalizeKosisCode(
      transaction.classification.kosisCode,
    );

    amountByCategory.set(
      kosisCode,
      (amountByCategory.get(kosisCode) ?? 0) + transaction.amount,
    );
    countByCategory.set(
      kosisCode,
      (countByCategory.get(kosisCode) ?? 0) + 1,
    );
  }

  const comparableCodes = new Set(
    Object.entries(benchmark.categories)
      .filter(
        ([kosisCode, category]) =>
          category.salesRatio > 0 &&
          !PEER_INDEX_EXCLUDED_CODES.has(kosisCode),
      )
      .map(([kosisCode]) => kosisCode),
  );

  const comparableUserTotalAmount = [...amountByCategory.entries()].reduce(
    (sum, [kosisCode, amount]) =>
      comparableCodes.has(kosisCode) ? sum + amount : sum,
    0,
  );

  const comparableBenchmarkRatioTotal = Object.entries(
    benchmark.categories,
  ).reduce(
    (sum, [kosisCode, category]) =>
      comparableCodes.has(kosisCode) ? sum + category.salesRatio : sum,
    0,
  );

  const transportReference = getTransportReference(ageGroupCode);

  const comparisons = Object.entries(benchmark.categories)
    .map(([kosisCode, category]) => {
      const userAmount = amountByCategory.get(kosisCode) ?? 0;
      const userTransactionCount = countByCategory.get(kosisCode) ?? 0;
      const userRatio = userAmount / userTotalAmount;
      const comparisonUnavailableReason =
        PEER_INDEX_EXCLUSION_REASONS[kosisCode] ??
        (category.salesRatio <= 0
          ? "해당 분야의 또래 기준 비중이 없어 비교할 수 없어요."
          : null);
      const isComparable =
        comparisonUnavailableReason === null &&
        comparableUserTotalAmount > 0 &&
        comparableBenchmarkRatioTotal > 0;
      const comparisonUserRatio = isComparable
        ? userAmount / comparableUserTotalAmount
        : null;
      const benchmarkSalesRatio = isComparable
        ? category.salesRatio / comparableBenchmarkRatioTotal
        : null;
      const spendingIndex =
        comparisonUserRatio !== null &&
        benchmarkSalesRatio !== null &&
        benchmarkSalesRatio > 0
          ? (comparisonUserRatio / benchmarkSalesRatio) * 100
          : null;
      const differencePercent =
        spendingIndex === null ? null : spendingIndex - 100;

      return {
        kosisCode,
        categoryName: category.name,
        userAmount,
        userRatio,
        comparisonUserRatio,
        userTransactionCount,
        userAverageTicketAmount:
          userTransactionCount > 0
            ? userAmount / userTransactionCount
            : 0,
        benchmarkSalesRatio,
        benchmarkAverageTicketAmount: isComparable
          ? category.averageTicketAmount
          : null,
        spendingIndex,
        differencePercent,
        level: getSpendingLevel(spendingIndex),
        comparisonUnavailableReason,
        referenceBenchmarkText:
          kosisCode === "07" ? transportReference.text : null,
        referenceBenchmarkNote:
          kosisCode === "07" ? transportReference.note : null,
      } satisfies PeerCategoryComparison;
    })
    .filter((comparison) => comparison.userAmount > 0)
    .sort((a, b) => b.userAmount - a.userAmount);

  const topByAmount = comparisons[0] ?? null;
  const topAbovePeer =
    [...comparisons]
      .filter(
        (comparison) =>
          comparison.spendingIndex !== null &&
          comparison.spendingIndex > 110,
      )
      .sort(
        (a, b) =>
          (b.spendingIndex ?? 0) - (a.spendingIndex ?? 0),
      )[0] ?? null;

  return {
    ...baseResult,
    ready: true,
    userTotalAmount,
    comparableUserTotalAmount,
    includedTransactionCount: eligibleTransactions.length,
    excludedTransactionCount:
      transactions.length - eligibleTransactions.length,
    comparisons,
    topByAmount,
    topAbovePeer,
  };
}
