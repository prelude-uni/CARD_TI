"use client";

import Image from "next/image";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
} from "react";

import {
  getClassificationFromRuleId,
  getMerchantRuleOptions,
  getUnmappedClassification,
} from "@/lib/merchant-classifier";
import {
  calculateCardTiScore,
  type CardTiAxisResult,
} from "@/lib/card-ti-scoring";
import { getCardTiProfile } from "@/lib/card-ti-profile";
import {
  calculatePeerSpendingComparison,
  getPeerSpendingLevelLabel,
  peerAgeGroups,
  type PeerAgeGroupCode,
} from "@/lib/peer-spending";
import type { Transaction } from "@/lib/upstage/information-extract";
import { CardRecommendationExperience } from "@/components/card-recommendation-experience";
import { ResultShareActions } from "@/components/result-share-actions";

interface ExtractSuccessResponse {
  statement?: {
    billingMonth?: string;
  };
  transactions: Transaction[];
}

type Screen = "input" | "review" | "result";

type SampleRow = {
  date: string;
  merchantName: string;
  amount: number;
  mcc: string;
  ruleId: string;
};

const selectableRules = getMerchantRuleOptions();
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);

const AGE_DISPLAY_LABELS: Record<PeerAgeGroupCode, string> = {
  age_10s: "19세 이하",
  age_20s: "20세~29세",
  age_30s: "30세~39세",
  age_40s: "40세~49세",
  age_50s: "50세~59세",
  age_60_plus: "60세 이상",
};

const DONUT_COLORS = [
  "#4a67ef",
  "#8ea2ff",
  "#ffb078",
  "#ffd454",
  "#ec9dca",
  "#61d8e6",
];

const SAMPLE_ROWS: SampleRow[] = [
  {
    date: "2025-05-02",
    merchantName: "CU 연세대점",
    amount: 4200,
    mcc: "5411",
    ruleId: "R001",
  },
  {
    date: "2025-05-03",
    merchantName: "스타벅스 신촌점",
    amount: 6500,
    mcc: "5812",
    ruleId: "R011",
  },
  {
    date: "2025-05-05",
    merchantName: "CGV 홍대",
    amount: 15000,
    mcc: "7832",
    ruleId: "R012",
  },
  {
    date: "2025-05-07",
    merchantName: "올리브영 신촌점",
    amount: 32000,
    mcc: "5912",
    ruleId: "R037",
  },
  {
    date: "2025-05-09",
    merchantName: "배달의민족",
    amount: 18500,
    mcc: "5812",
    ruleId: "R027",
  },
  {
    date: "2025-05-11",
    merchantName: "서울 지하철 충전",
    amount: 54000,
    mcc: "4111",
    ruleId: "R003",
  },
  {
    date: "2025-05-12",
    merchantName: "쿠팡 로켓배송",
    amount: 45000,
    mcc: "5999",
    ruleId: "R018",
  },
  {
    date: "2025-05-14",
    merchantName: "홍대 고기집",
    amount: 22000,
    mcc: "5812",
    ruleId: "R029",
  },
  {
    date: "2025-05-16",
    merchantName: "GS25 이대점",
    amount: 3800,
    mcc: "5411",
    ruleId: "R001",
  },
  {
    date: "2025-05-18",
    merchantName: "넷플릭스",
    amount: 17000,
    mcc: "7372",
    ruleId: "R023",
  },
  {
    date: "2025-05-20",
    merchantName: "팀 회식 식당",
    amount: 89000,
    mcc: "5812",
    ruleId: "R026",
  },
  {
    date: "2025-05-22",
    merchantName: "이마트24 신촌점",
    amount: 12500,
    mcc: "5411",
    ruleId: "R001",
  },
];

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function formatAmount(amount: number): string {
  return Math.round(amount).toLocaleString("ko-KR");
}

function formatRatio(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function formatOptionalRatio(ratio: number | null): string {
  return ratio === null ? "-" : formatRatio(ratio);
}

function formatIndexMultiple(index: number | null): string {
  return index === null ? "-" : `${(index / 100).toFixed(2)}배`;
}

function getIndexBarWidth(index: number | null): string {
  if (index === null || !Number.isFinite(index)) return "0%";
  return `${Math.min(100, Math.max(3, (index / 300) * 100))}%`;
}

function formatAxisPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatOptionalValue(value: string): string {
  return value.trim().length > 0 ? value : "-";
}

function formatScore(score: number): string {
  return score.toFixed(3);
}

function formatTransactionType(type: Transaction["transactionType"]): string {
  switch (type) {
    case "payment":
      return "결제";
    case "discount":
      return "할인";
    case "refund":
      return "환급";
    default:
      return "알 수 없음";
  }
}

function getClassificationSourceLabel(source: string): string {
  switch (source) {
    case "merchant_keyword":
      return "출처: 키워드 분류";
    case "actual_mcc":
      return "출처: MCC 분류";
    case "llm_fallback":
      return "출처: LLM 분류";
    case "user_override":
      return "출처: 사용자 확인";
    default:
      return "출처: 미분류";
  }
}

function getClassificationSourceClassName(source: string): string {
  switch (source) {
    case "llm_fallback":
      return "bg-[#fff2e8] text-[#d66c1d]";
    case "user_override":
      return "bg-[#eef1ff] text-[#4565ed]";
    case "actual_mcc":
      return "bg-[#e8fbf5] text-[#248f6c]";
    case "merchant_keyword":
      return "bg-[#edf8ff] text-[#2483b7]";
    default:
      return "bg-[#f0f2f6] text-[#7d8595]";
  }
}

function getSelectedRuleId(transaction: Transaction): string {
  const currentRuleId = transaction.classification?.ruleId ?? "";

  if (selectableRules.some((rule) => rule.ruleId === currentRuleId)) {
    return currentRuleId;
  }

  const currentCategory =
    transaction.classification?.standardCategory ?? "미분류";

  return (
    selectableRules.find(
      (rule) => rule.standardCategory === currentCategory,
    )?.ruleId ?? ""
  );
}

function createSampleTransactions(): Transaction[] {
  return SAMPLE_ROWS.map((row) => ({
    date: row.date,
    merchantName: row.merchantName,
    normalizedMerchantName: row.merchantName,
    amount: row.amount,
    mcc: row.mcc,
    transactionType: "payment",
    classification:
      getClassificationFromRuleId(
        row.ruleId,
        "merchant_keyword",
        "샘플",
      ) ?? getUnmappedClassification(),
  }));
}

function CardIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3 9h18" />
    </svg>
  );
}

function SparkleIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 3-1.3 4.2a4 4 0 0 1-2.6 2.6L4 11l4.1 1.2a4 4 0 0 1 2.6 2.6L12 19l1.3-4.2a4 4 0 0 1 2.6-2.6L20 11l-4.1-1.2a4 4 0 0 1-2.6-2.6L12 3Z" />
      <path d="m5 3 .4 1.2a2 2 0 0 0 1.3 1.3L8 6l-1.3.4a2 2 0 0 0-1.3 1.3L5 9l-.4-1.3a2 2 0 0 0-1.3-1.3L2 6l1.3-.5a2 2 0 0 0 1.3-1.3L5 3Z" />
    </svg>
  );
}

function UploadIcon({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 16V4" />
      <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
      <path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
    </svg>
  );
}

function ShieldIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Z" />
    </svg>
  );
}

function BackIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function CheckIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.2 2.2 4.8-4.8" />
    </svg>
  );
}

function LoaderIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("animate-spin", className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M21 12a9 9 0 1 1-6.2-8.6" />
    </svg>
  );
}

function AxisBar({
  title,
  negativeLetter,
  negativeLabel,
  positiveLetter,
  positiveLabel,
  result,
}: {
  title: string;
  negativeLetter: "I" | "V" | "N";
  negativeLabel: string;
  positiveLetter: "E" | "R" | "W";
  positiveLabel: string;
  result: CardTiAxisResult;
}) {
  const isNegative = result.letter === negativeLetter;
  const isPositive = result.letter === positiveLetter;

  return (
    <article className="rounded-[24px] border border-[#e4e8f2] bg-white p-5 shadow-[0_10px_35px_rgba(41,55,105,0.05)] sm:p-7">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "grid h-10 w-10 place-items-center rounded-full text-sm font-bold",
              isNegative
                ? "bg-[#4565ed] text-white shadow-[0_7px_16px_rgba(69,101,237,0.28)]"
                : "bg-[#f3f5fa] text-[#a8afbe]",
            )}
          >
            {negativeLetter}
          </span>
          <span
            className={cn(
              "text-sm font-semibold",
              isNegative ? "text-[#20283a]" : "text-[#a8afbe]",
            )}
          >
            {negativeLetter} {negativeLabel}
          </span>
        </div>

        <div className="text-center">
          <p className="text-xs font-medium text-[#8b93a6]">{title}</p>
          <p className="mt-1 text-3xl font-bold text-[#4565ed]">
            {result.letter}
          </p>
          <p className="text-xs font-medium text-[#7e879a]">
            {formatAxisPercent(
              isNegative
                ? result.negativePercent
                : result.positivePercent,
            )}
          </p>
        </div>

        <div className="flex items-center justify-end gap-3">
          <span
            className={cn(
              "text-sm font-semibold",
              isPositive ? "text-[#20283a]" : "text-[#a8afbe]",
            )}
          >
            {positiveLetter} {positiveLabel}
          </span>
          <span
            className={cn(
              "grid h-10 w-10 place-items-center rounded-full text-sm font-bold",
              isPositive
                ? "bg-[#4565ed] text-white shadow-[0_7px_16px_rgba(69,101,237,0.28)]"
                : "bg-[#f3f5fa] text-[#c0c5d0]",
            )}
          >
            {positiveLetter}
          </span>
        </div>
      </div>

      <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-[#edf0f6]">
        <div
          className={cn(
            "h-full transition-all duration-500",
            isNegative ? "bg-[#4565ed]" : "bg-[#e5e9f2]",
          )}
          style={{ width: `${result.negativePercent}%` }}
        />
        <div
          className={cn(
            "h-full transition-all duration-500",
            isPositive ? "bg-[#4565ed]" : "bg-[#e5e9f2]",
          )}
          style={{ width: `${result.positivePercent}%` }}
        />
      </div>

      <div className="mt-2 flex justify-between text-xs font-semibold">
        <span className={isNegative ? "text-[#4565ed]" : "text-[#9aa2b3]"}>
          {formatAxisPercent(result.negativePercent)}
        </span>
        <span className={isPositive ? "text-[#4565ed]" : "text-[#9aa2b3]"}>
          {formatAxisPercent(result.positivePercent)}
        </span>
      </div>

      <p className="mt-3 text-center text-xs text-[#8b93a6]">
        가중평균 점수 {formatScore(result.score)}
      </p>

      {result.isBoundary ? (
        <p className="mt-3 text-center text-xs font-medium text-[#f0a11a]">
          두 성향이 비슷한 경계형이에요.
        </p>
      ) : null}
    </article>
  );
}

function AnalysisLoading({ step }: { step: number }) {
  const steps = [
    "명세서 OCR 분석 중",
    "가맹점 카테고리 분류 중",
    "또래 소비 비교 중",
    "CARD-TI 결과 생성 중",
  ];

  return (
    <div className="fixed inset-0 z-50 grid min-h-screen place-items-center bg-[#f7f8fc] px-5">
      <div className="w-full max-w-[480px]">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-[24px] bg-[#4565ed] text-white shadow-[0_18px_32px_rgba(69,101,237,0.28)]">
          <CardIcon className="h-9 w-9" />
        </div>
        <h2 className="mt-10 text-center text-2xl font-bold tracking-[-0.03em] text-[#171b27]">
          명세서를 분석하고 있어요
        </h2>
        <p className="mt-2 text-center text-[#7e8798]">
          잠시만 기다려주세요
        </p>

        <div className="mt-12 space-y-3">
          {steps.map((label, index) => {
            const isDone = index < step;
            const isCurrent = index === step;

            return (
              <div
                key={label}
                className={cn(
                  "flex items-center gap-4 rounded-[20px] border px-5 py-4 transition",
                  isCurrent
                    ? "border-[#4565ed] bg-white shadow-[0_10px_30px_rgba(52,73,150,0.08)]"
                    : isDone
                      ? "border-[#dce3fb] bg-[#eef1ff]"
                      : "border-[#eef0f5] bg-white/[0.06]0 text-[#b9bfcc]",
                )}
              >
                <span
                  className={cn(
                    "grid h-11 w-11 shrink-0 place-items-center rounded-2xl",
                    isCurrent || isDone
                      ? "bg-[#e8edff] text-[#4565ed]"
                      : "bg-[#f4f5f8] text-[#bdc3cf]",
                  )}
                >
                  {isDone ? (
                    <CheckIcon />
                  ) : isCurrent ? (
                    <LoaderIcon />
                  ) : (
                    <CardIcon />
                  )}
                </span>
                <div>
                  <p
                    className={cn(
                      "font-semibold",
                      isCurrent || isDone
                        ? "text-[#1d2331]"
                        : "text-[#b6bcc8]",
                    )}
                  >
                    {label}
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 text-xs",
                      isDone
                        ? "text-[#4565ed]"
                        : isCurrent
                          ? "text-[#7e8798]"
                          : "text-[#c3c8d2]",
                    )}
                  >
                    {isDone ? "완료" : isCurrent ? "처리 중..." : "대기 중"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-10 h-1.5 overflow-hidden rounded-full bg-[#e8ebf2]">
          <div
            className="h-full rounded-full bg-[#4565ed] transition-all duration-500"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>
        <p className="mt-3 text-center text-sm text-[#747d90]">
          {step + 1} / {steps.length} 단계
        </p>
      </div>
    </div>
  );
}

export default function TestInformationExtractPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [screen, setScreen] = useState<Screen>("input");
  const [file, setFile] = useState<File | null>(null);
  const [currentCardName, setCurrentCardName] = useState("");
  const [billingMonth, setBillingMonth] = useState("");
  const [ageGroupCode, setAgeGroupCode] =
    useState<PeerAgeGroupCode>("age_20s");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [correctedRows, setCorrectedRows] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const scoreResult = useMemo(
    () => calculateCardTiScore(transactions),
    [transactions],
  );

  const peerResult = useMemo(
    () => calculatePeerSpendingComparison(transactions, ageGroupCode),
    [transactions, ageGroupCode],
  );

  const reviewTotalAmount = useMemo(
    () =>
      transactions.reduce(
        (sum, transaction) =>
          transaction.transactionType === "payment" &&
          transaction.amount > 0
            ? sum + transaction.amount
            : sum,
        0,
      ),
    [transactions],
  );

  const selectedAgeLabel = AGE_DISPLAY_LABELS[ageGroupCode];
  const profile = getCardTiProfile(scoreResult.cardTiType);

  const indexRankings = useMemo(
    () =>
      [...peerResult.comparisons]
        .filter((comparison) => comparison.spendingIndex !== null)
        .sort(
          (a, b) =>
            (b.spendingIndex ?? 0) - (a.spendingIndex ?? 0),
        ),
    [peerResult.comparisons],
  );

  const peerComparableItems = useMemo(
    () =>
      peerResult.comparisons.filter(
        (comparison) => comparison.spendingIndex !== null,
      ),
    [peerResult.comparisons],
  );

  const peerExcludedItems = useMemo(
    () =>
      peerResult.comparisons.filter(
        (comparison) => comparison.comparisonUnavailableReason !== null,
      ),
    [peerResult.comparisons],
  );

  const donutItems = useMemo(() => {
    if (!peerResult.ready || peerResult.userTotalAmount <= 0) {
      return [];
    }

    const sorted = [...peerResult.comparisons].sort(
      (a, b) => b.userAmount - a.userAmount,
    );
    const top = sorted.slice(0, 5).map((comparison, index) => ({
      name: comparison.categoryName,
      ratio: comparison.userRatio,
      color: DONUT_COLORS[index],
    }));
    const topRatio = top.reduce((sum, item) => sum + item.ratio, 0);
    const remainingRatio = Math.max(0, 1 - topRatio);

    if (remainingRatio > 0.001) {
      top.push({
        name: "기타",
        ratio: remainingRatio,
        color: DONUT_COLORS[5],
      });
    }

    return top;
  }, [peerResult]);

  const donutStyle = useMemo<CSSProperties>(() => {
    if (donutItems.length === 0) {
      return {
        backgroundImage: "conic-gradient(#e9edf5 0 100%)",
      };
    }

    let cursor = 0;
    const segments = donutItems.map((item) => {
      const start = cursor;
      cursor += item.ratio * 100;
      return `${item.color} ${start}% ${cursor}%`;
    });

    return {
      backgroundImage: `conic-gradient(${segments.join(", ")})`,
    };
  }, [donutItems]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [screen]);

  useEffect(() => {
    if (!isLoading) {
      return;
    }

    const timer = window.setInterval(() => {
      setLoadingStep((current) => Math.min(current + 1, 3));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isLoading]);

  function resetAnalysis() {
    setScreen("input");
    setFile(null);
    setBillingMonth("");
    setTransactions([]);
    setCorrectedRows(new Set());
    setError(null);
  }

  function handleFileSelection(selectedFile: File | null) {
    if (!selectedFile) {
      setFile(null);
      return;
    }

    const hasAllowedExtension = /\.(pdf|png|jpe?g)$/i.test(
      selectedFile.name,
    );

    if (
      !ALLOWED_MIME_TYPES.has(selectedFile.type) &&
      !hasAllowedExtension
    ) {
      setError("PDF, PNG, JPG, JPEG 파일만 업로드할 수 있습니다.");
      setFile(null);
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE_BYTES) {
      setError("파일 크기는 50MB 이하여야 합니다.");
      setFile(null);
      return;
    }

    setFile(selectedFile);
    setError(null);
    setTransactions([]);
    setCorrectedRows(new Set());
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    handleFileSelection(event.dataTransfer.files?.[0] ?? null);
  }

  function handleCategoryChange(
    transactionIndex: number,
    selectedRuleId: string,
  ) {
    setTransactions((currentTransactions) =>
      currentTransactions.map((transaction, index) => {
        if (index !== transactionIndex) {
          return transaction;
        }

        if (!selectedRuleId) {
          return {
            ...transaction,
            classification: getUnmappedClassification("user_override"),
          };
        }

        const userClassification = getClassificationFromRuleId(
          selectedRuleId,
          "user_override",
          "사용자 확인",
        );

        if (!userClassification) {
          return transaction;
        }

        return {
          ...transaction,
          classification: userClassification,
        };
      }),
    );

    setCorrectedRows((currentRows) => {
      const nextRows = new Set(currentRows);
      nextRows.add(transactionIndex);
      return nextRows;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setError("카드 명세서 파일을 선택해 주세요.");
      return;
    }

    setLoadingStep(0);
    setIsLoading(true);
    setError(null);
    setTransactions([]);
    setCorrectedRows(new Set());

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/information-extract", {
        method: "POST",
        body: formData,
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : "명세서 분석 요청에 실패했습니다.";

        setError(message);
        return;
      }

      const result = data as ExtractSuccessResponse;
      setTransactions(result.transactions ?? []);
      setBillingMonth(result.statement?.billingMonth?.trim() ?? "");
      setScreen("review");
    } catch {
      setError("요청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleSampleData() {
    setAgeGroupCode("age_20s");
    setCurrentCardName("");
    setBillingMonth("2025년 5월");
    setTransactions(createSampleTransactions());
    setCorrectedRows(new Set());
    setError(null);
    setScreen("review");
  }

  return (
    <div className="min-h-screen bg-[#f7f8fc] text-[#171b27]">
      {isLoading ? <AnalysisLoading step={loadingStep} /> : null}

      {screen === "input" ? (
        <>
          <header className="mx-auto flex w-full max-w-[1260px] items-center justify-between px-5 py-7 sm:px-8">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#4565ed] text-white shadow-[0_10px_22px_rgba(69,101,237,0.26)]">
                <CardIcon className="h-6 w-6" />
              </span>
              <span className="text-xl font-bold tracking-[-0.04em]">
                CardTI
              </span>
            </div>
            <span className="rounded-full bg-[#eef0f5] px-4 py-1.5 text-xs font-medium text-[#747d8f]">
              Beta
            </span>
          </header>

          <main className="mx-auto w-full max-w-[760px] px-5 pb-20 pt-8 sm:px-8 sm:pt-12">
            <section className="text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-[#eef1ff] px-4 py-2 text-sm font-semibold text-[#4565ed]">
                <SparkleIcon className="h-4 w-4" />
                대학생 맞춤 카드 소비 분석 서비스
              </div>
              <h1 className="mt-8 text-[38px] font-extrabold leading-[1.14] tracking-[-0.055em] text-[#121622] sm:text-[58px]">
                내 소비 MBTI,
                <br />
                <span className="text-[#4565ed]">지금 바로</span>{" "}
                확인해보세요
              </h1>
              <p className="mx-auto mt-6 max-w-[560px] text-base leading-7 text-[#7a8293] sm:text-lg">
                카드 명세서를 업로드하면 또래 대비 소비 분석과
                <br className="hidden sm:block" /> 나의 CARD-TI 유형을
                확인할 수 있어요.
              </p>
            </section>

            <form onSubmit={handleSubmit} className="mt-12 space-y-5">
              <section className="rounded-[24px] border border-[#e5e8f1] bg-white p-6 shadow-[0_14px_45px_rgba(37,50,98,0.04)] sm:p-7">
                <div className="flex items-center gap-1.5">
                  <h2 className="font-bold">1. 연령대 선택</h2>
                  <span className="text-[#f24f6f]">*</span>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {peerAgeGroups.map((ageGroup) => {
                    const isSelected = ageGroupCode === ageGroup.code;
                    return (
                      <button
                        key={ageGroup.code}
                        type="button"
                        onClick={() => setAgeGroupCode(ageGroup.code)}
                        className={cn(
                          "rounded-2xl border px-3 py-3.5 text-sm font-semibold transition sm:text-base",
                          isSelected
                            ? "border-[#4565ed] bg-[#eef1ff] text-[#4565ed] shadow-[0_7px_18px_rgba(69,101,237,0.10)]"
                            : "border-[#e3e7f0] bg-[#fafbfe] text-[#737b8d] hover:border-[#bdc9f7] hover:text-[#4565ed]",
                        )}
                      >
                        {AGE_DISPLAY_LABELS[ageGroup.code]}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-[24px] border border-[#e5e8f1] bg-white p-6 shadow-[0_14px_45px_rgba(37,50,98,0.04)] sm:p-7">
                <label htmlFor="current-card" className="font-bold">
                  2. 현재 사용 중인 카드{" "}
                  <span className="font-medium text-[#9aa2b2]">(선택)</span>
                </label>
                <input
                  id="current-card"
                  value={currentCardName}
                  onChange={(event) => setCurrentCardName(event.target.value)}
                  placeholder="카드명을 입력해 주세요"
                  className="mt-5 block w-full rounded-2xl border border-[#dfe4ef] bg-[#fafbfe] px-5 py-4 text-sm font-medium outline-none transition placeholder:text-[#9ba3b3] focus:border-[#4565ed] focus:bg-white focus:ring-4 focus:ring-[#4565ed]/10"
                />
                <p className="mt-2 text-xs text-[#9aa2b2]">
                  카드 혜택 DB 연결 후 기존 카드와 추천 카드를 비교할 예정이에요.
                </p>
              </section>

              <section className="rounded-[24px] border border-[#e5e8f1] bg-white p-6 shadow-[0_14px_45px_rgba(37,50,98,0.04)] sm:p-7">
                <h2 className="font-bold">3. 카드 명세서 업로드</h2>
                <input
                  ref={fileInputRef}
                  id="statement-file"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                  className="sr-only"
                  onChange={(event) =>
                    handleFileSelection(event.target.files?.[0] ?? null)
                  }
                />
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      fileInputRef.current?.click();
                    }
                  }}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  className={cn(
                    "mt-5 flex min-h-[210px] cursor-pointer flex-col items-center justify-center rounded-[22px] border border-dashed px-5 text-center transition",
                    isDragging
                      ? "border-[#4565ed] bg-[#f0f3ff]"
                      : "border-[#dce2ee] bg-white hover:border-[#8ea2f7] hover:bg-[#fafbff]",
                  )}
                >
                  <span className="grid h-16 w-16 place-items-center rounded-[20px] bg-[#eef1ff] text-[#4565ed]">
                    <UploadIcon />
                  </span>
                  <p className="mt-5 font-bold text-[#202534]">
                    {file
                      ? file.name
                      : "파일을 드래그하거나 클릭해서 업로드"}
                  </p>
                  <p className="mt-1.5 text-sm text-[#8a92a3]">
                    PDF, JPG, PNG 지원 · 최대 50MB
                  </p>
                  {file ? (
                    <p className="mt-2 text-xs font-semibold text-[#4565ed]">
                      다른 파일을 선택하려면 다시 클릭하세요.
                    </p>
                  ) : null}
                </div>

                <div className="mt-4 flex items-start gap-3 rounded-2xl bg-[#f6f7fb] px-4 py-4 text-sm leading-6 text-[#747d8f]">
                  <ShieldIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#4565ed]" />
                  <p>
                    업로드된 명세서는 분석 요청에만 사용되며, 이 서비스는
                    별도 DB에 명세서 원본을 저장하지 않습니다.
                  </p>
                </div>
              </section>

              {error ? (
                <div className="rounded-2xl border border-[#ffcbd4] bg-[#fff3f5] px-5 py-4 text-sm font-medium text-[#cf3d58]">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={!file || isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-[20px] bg-[#4565ed] px-6 py-5 text-lg font-bold text-white shadow-[0_14px_28px_rgba(69,101,237,0.24)] transition hover:bg-[#3858dc] disabled:cursor-not-allowed disabled:bg-[#e4e8f1] disabled:text-[#8e96a7] disabled:shadow-none"
              >
                분석 시작하기
                <ChevronIcon />
              </button>

              <button
                type="button"
                onClick={handleSampleData}
                className="flex w-full items-center justify-center gap-2 rounded-[20px] border border-[#dbe1ee] bg-white px-6 py-4 font-semibold text-[#687184] transition hover:border-[#aab9f4] hover:text-[#4565ed]"
              >
                <SparkleIcon className="h-4 w-4" />
                샘플 데이터로 먼저 체험해보기
              </button>
            </form>
          </main>
        </>
      ) : null}

      {screen === "review" ? (
        <div className="min-h-screen pb-8">
          <header className="border-b border-[#e3e7ef] bg-[#f7f8fc]/95 backdrop-blur">
            <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-5 py-6 sm:px-8">
              <button
                type="button"
                onClick={resetAnalysis}
                aria-label="처음 화면으로 돌아가기"
                className="grid h-10 w-10 place-items-center rounded-full text-[#252b39] transition hover:bg-white"
              >
                <BackIcon />
              </button>
              <div>
                <h1 className="text-xl font-bold tracking-[-0.03em]">
                  결제내역 확인
                </h1>
                <p className="mt-0.5 text-sm text-[#858d9e]">
                  OCR로 추출된 내역을 확인하고 카테고리를 수정하세요
                </p>
              </div>
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1500px] px-5 py-8 sm:px-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-lg text-[#697184]">
                총 <strong className="text-[#171b27]">{transactions.length}건</strong>
                <span className="mx-2 text-[#c3c8d2]">·</span>
                <strong className="text-[#4565ed]">
                  {formatAmount(reviewTotalAmount)}원
                </strong>
              </p>
              <span className="rounded-full bg-[#eef0f5] px-4 py-2 text-xs font-medium text-[#737b8d]">
                카테고리 수정 가능
              </span>
            </div>

            {currentCardName.trim() ? (
              <p className="mt-3 text-sm text-[#858d9e]">
                현재 사용 카드: {currentCardName.trim()}
              </p>
            ) : null}

            <section className="mt-6 overflow-hidden rounded-[24px] border border-[#e2e7f0] bg-white shadow-[0_16px_45px_rgba(38,51,94,0.05)]">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#edf0f5] px-6 py-5">
                <div>
                  <h2 className="font-bold text-[#252b38]">추출·분류 상세</h2>
                  <p className="mt-1 max-w-[760px] text-xs leading-5 text-[#8b93a4]">
                    MCC는 카드 가맹점의 업종을 구분하는 4자리 코드이며, 표의 MCC 후보는
                    업종 분류를 돕는 참고값입니다. 가맹점명을 먼저 규칙으로 분류하고,
                    판단이 어려운 경우 AI가 카테고리를 제안합니다.
                  </p>
                </div>
                <p className="max-w-[360px] text-xs leading-5 text-[#9aa2b2]">
                  제안된 카테고리가 실제 이용처와 다르면 선택 메뉴에서 직접 수정할 수 있습니다.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] table-fixed border-collapse text-left text-[12px]">
                  <colgroup>
                    <col className="w-[5%]" />
                    <col className="w-[15%]" />
                    <col className="w-[14%]" />
                    <col className="w-[9%]" />
                    <col className="w-[9%]" />
                    <col className="w-[16%]" />
                    <col className="w-[13%]" />
                    <col className="w-[8%]" />
                    <col className="w-[11%]" />
                  </colgroup>
                  <thead>
                    <tr className="bg-[#fafbfe] text-[#697184]">
                      <th className="px-3 py-3 font-semibold leading-4">날짜</th>
                      <th className="px-3 py-3 font-semibold leading-4">원본 가맹점명</th>
                      <th className="px-3 py-3 font-semibold leading-4">정규화 가맹점명</th>
                      <th className="px-3 py-3 font-semibold leading-4">금액</th>
                      <th className="px-3 py-3 font-semibold leading-4">MCC 후보</th>
                      <th className="px-3 py-3 font-semibold leading-4">표준카테고리</th>
                      <th className="px-3 py-3 font-semibold leading-4">KOSIS 분류</th>
                      <th className="px-3 py-3 font-semibold leading-4">거래유형</th>
                      <th className="px-3 py-3 font-semibold leading-4">분류 방식</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((transaction, index) => {
                      const classification = transaction.classification;
                      const source = classification?.classificationSource ?? "unmapped";

                      return (
                        <tr
                          key={`${transaction.date}-${transaction.merchantName}-${transaction.amount}-${index}`}
                          className="border-t border-[#edf0f5] align-top"
                        >
                          <td className="whitespace-nowrap px-3 py-4 font-mono text-[11px] text-[#697184]">
                            {formatOptionalValue(transaction.date)}
                          </td>
                          <td className="break-words px-3 py-4 font-semibold leading-5 text-[#252b38]">
                            {transaction.merchantName}
                          </td>
                          <td className="break-words px-3 py-4 leading-5 text-[#697184]">
                            {formatOptionalValue(transaction.normalizedMerchantName)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 font-bold text-[#161a25]">
                            {formatAmount(transaction.amount)}원
                          </td>
                          <td className="break-words px-3 py-4 font-mono text-[11px] leading-4 text-[#5e687a]">
                            {classification?.candidateMccCodes?.length
                              ? classification.candidateMccCodes.join(", ")
                              : "-"}
                          </td>
                          <td className="px-3 py-4">
                            <select
                              value={getSelectedRuleId(transaction)}
                              onChange={(event) =>
                                handleCategoryChange(index, event.target.value)
                              }
                              className={cn(
                                "w-full rounded-xl border border-transparent bg-[#f0f2f7] px-3 py-2 text-[11px] font-semibold text-[#2d3444] outline-none transition focus:border-[#4565ed] focus:bg-white focus:ring-4 focus:ring-[#4565ed]/10",
                                correctedRows.has(index) &&
                                  "bg-[#eef1ff] text-[#4565ed]",
                              )}
                            >
                              <option value="">미분류</option>
                              {selectableRules.map((rule) => (
                                <option key={rule.ruleId} value={rule.ruleId}>
                                  {rule.standardCategory}
                                </option>
                              ))}
                            </select>
                            {correctedRows.has(index) ? (
                              <p className="mt-1.5 pl-2 text-[11px] font-semibold text-[#4565ed]">
                                사용자 수정됨
                              </p>
                            ) : null}
                          </td>
                          <td className="break-words px-3 py-4 leading-5 text-[#5e687a]">
                            {classification?.kosisCategory ?? "미분류"}
                            {classification?.kosisCode ? (
                              <p className="mt-1 font-mono text-[11px] text-[#9aa2b2]">
                                {classification.kosisCode}
                              </p>
                            ) : null}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-[#5e687a]">
                            {formatTransactionType(transaction.transactionType)}
                          </td>
                          <td className="break-words px-3 py-4">
                            <span
                              className={cn(
                                "inline-flex whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] font-bold",
                                getClassificationSourceClassName(source),
                              )}
                            >
                              {getClassificationSourceLabel(source)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-[#cdd6f8] bg-[#f3f6ff]">
                      <td colSpan={3} className="px-3 py-4 font-bold">
                        합계
                      </td>
                      <td className="px-3 py-4 font-bold text-[#4565ed]">
                        {formatAmount(reviewTotalAmount)}원
                      </td>
                      <td colSpan={6} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

            <button
              type="button"
              onClick={() => setScreen("result")}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-[20px] bg-[#4565ed] px-6 py-5 text-lg font-bold text-white shadow-[0_14px_28px_rgba(69,101,237,0.24)] transition hover:bg-[#3858dc]"
            >
              분석 결과 보기
              <ChevronIcon />
            </button>
          </main>
        </div>
      ) : null}

      {screen === "result" ? (
        <div className="min-h-screen pb-36">
          <header className="border-b border-[#e3e7ef] bg-[#f7f8fc]/95 backdrop-blur">
            <div className="mx-auto flex max-w-[1120px] items-center gap-4 px-5 py-6 sm:px-8">
              <button
                type="button"
                onClick={() => setScreen("review")}
                aria-label="결제내역 확인으로 돌아가기"
                className="grid h-10 w-10 place-items-center rounded-full text-[#252b39] transition hover:bg-white"
              >
                <BackIcon />
              </button>
              <div>
                <h1 className="text-xl font-bold tracking-[-0.03em]">
                  소비 분석 결과
                </h1>
                <p className="mt-0.5 text-sm text-[#858d9e]">
                  {[billingMonth, selectedAgeLabel]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1120px] px-5 py-7 sm:px-8">
            {scoreResult.ready ? (
              <>
                <section className="relative overflow-hidden rounded-[30px] bg-[#4964e8] p-7 text-white shadow-[0_22px_48px_rgba(68,94,220,0.22)] sm:p-9">
                  <div className="absolute -left-20 top-4 h-64 w-64 rounded-full bg-white/5" />
                  <div className="absolute -right-10 -top-16 h-72 w-72 rounded-full bg-white/[0.08]" />
                  <div className="relative z-10 flex flex-col justify-between gap-8 md:flex-row md:items-center">
                    <div className="max-w-[620px]">
                      <p className="font-semibold text-white/[0.65]">
                        나의 소비 MBTI
                      </p>
                      <h2 className="mt-2 text-4xl font-extrabold tracking-[-0.045em] sm:text-5xl">
                        {profile.name}
                      </h2>
                      <p className="mt-1 text-3xl font-bold tracking-[0.06em]">
                        {scoreResult.cardTiType}
                      </p>
                      <p className="mt-5 max-w-[560px] text-sm font-medium leading-6 text-white/80">
                        {profile.description}
                      </p>
                      <div className="mt-6 flex flex-wrap gap-2">
                        {indexRankings.slice(0, 2).map((comparison) => (
                          <span
                            key={comparison.kosisCode}
                            className="rounded-full bg-white/[0.18] px-4 py-2 text-sm font-semibold backdrop-blur"
                          >
                            {comparison.categoryName} 소비지수{" "}
                            {Math.round(comparison.spendingIndex ?? 0)}
                          </span>
                        ))}
                        <span className="rounded-full bg-white/[0.15] px-4 py-2 text-sm font-semibold backdrop-blur">
                          {peerComparableItems.length === 0
                            ? "또래 비교 가능한 분야 없음"
                            : peerResult.topAbovePeer?.spendingIndex
                              ? `최고 소비지수 ${Math.round(
                                  peerResult.topAbovePeer.spendingIndex,
                                )}`
                              : "또래와 유사한 소비"}
                        </span>
                      </div>
                    </div>

                    <div className="mx-auto flex w-full max-w-[360px] items-center justify-center rounded-[28px] bg-white/10 p-3 backdrop-blur md:mx-0">
                      <Image
                        src={`/card-ti-types/${scoreResult.cardTiType}.png`}
                        alt={`${scoreResult.cardTiType} 소비 유형 일러스트`}
                        width={504}
                        height={388}
                        priority
                        className="h-auto w-full object-contain drop-shadow-[0_18px_30px_rgba(22,34,94,0.22)]"
                      />
                    </div>
                  </div>
                </section>

                <section className="mt-6 grid gap-4 sm:grid-cols-3">
                  <article className="rounded-[22px] border border-[#e4e8f1] bg-white p-5 text-center">
                    <p className="text-sm text-[#858d9e]">분석 소비금액</p>
                    <p className="mt-2 text-lg font-bold">
                      {formatAmount(scoreResult.eligibleTotalAmount)}원
                    </p>
                  </article>
                  <article className="rounded-[22px] border border-[#e4e8f1] bg-white p-5 text-center">
                    <p className="text-sm text-[#858d9e]">분석 거래</p>
                    <p className="mt-2 text-lg font-bold">
                      {scoreResult.includedTransactionCount}건
                    </p>
                  </article>
                  <article className="rounded-[22px] border border-[#e4e8f1] bg-white p-5 text-center">
                    <p className="text-sm text-[#858d9e]">최대 카테고리</p>
                    <p className="mt-2 text-lg font-bold">
                      {peerResult.topByAmount?.categoryName ?? "-"}
                    </p>
                  </article>
                </section>

                <section className="mt-8">
                  <h2 className="text-xl font-bold tracking-[-0.03em]">
                    소비 성향 분석
                  </h2>
                  <p className="mt-1 text-sm text-[#858d9e]">
                    3가지 축으로 보는 나의 소비 패턴
                  </p>
                  <div className="mt-5 space-y-4">
                    <AxisBar
                      title="소비 관계"
                      negativeLetter="I"
                      negativeLabel="혼자"
                      positiveLetter="E"
                      positiveLabel="함께"
                      result={scoreResult.ie}
                    />
                    <AxisBar
                      title="소비 채널"
                      negativeLetter="V"
                      negativeLabel="오프라인"
                      positiveLetter="R"
                      positiveLabel="온라인"
                      result={scoreResult.vr}
                    />
                    <AxisBar
                      title="소비 목적"
                      negativeLetter="N"
                      negativeLabel="필수"
                      positiveLetter="W"
                      positiveLabel="기호"
                      result={scoreResult.nw}
                    />
                  </div>
                </section>

                <section className="mt-6 rounded-[26px] border border-[#e3e8f1] bg-white p-6 shadow-[0_12px_36px_rgba(43,56,100,0.04)]">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-bold">CARD-TI 계산 상세</h2>
                      <p className="mt-1 text-sm text-[#858d9e]">
                        분류 완료된 결제 거래의 금액 가중평균으로 계산합니다.
                      </p>
                    </div>
                    <div className="text-right text-sm text-[#697184]">
                      <p>반영 금액 {formatAmount(scoreResult.eligibleTotalAmount)}원</p>
                      <p className="mt-1">
                        포함 {scoreResult.includedTransactionCount}건 · 제외 {scoreResult.excludedTransactionCount}건
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    {[
                      ["I/E", scoreResult.ie],
                      ["V/R", scoreResult.vr],
                      ["N/W", scoreResult.nw],
                    ].map(([label, axis]) => (
                      <div key={label as string} className="rounded-2xl bg-[#f7f8fc] p-4">
                        <p className="text-xs font-semibold text-[#858d9e]">{label as string}</p>
                        <p className="mt-2 text-xl font-bold text-[#252b38]">
                          {(axis as CardTiAxisResult).letter}
                        </p>
                        <p className="mt-1 font-mono text-xs text-[#697184]">
                          점수 {formatScore((axis as CardTiAxisResult).score)}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 space-y-1 text-xs leading-5 text-[#8b93a4]">
                    <p>I/E·V/R·N/W 점수 = Σ(거래금액 × 가중치) ÷ Σ거래금액</p>
                    <p>퍼센트 = 100 ÷ (1 + e^(-3 × 점수))</p>
                    <p>계산 대상: 결제(payment) · 양수금액 · 분류 완료 거래</p>
                  </div>
                </section>

                <section className="mt-7 grid gap-5 lg:grid-cols-2">
                  <article className="rounded-[26px] border border-[#e3e8f1] bg-white p-6 shadow-[0_12px_36px_rgba(43,56,100,0.04)]">
                    <h2 className="text-lg font-bold">카테고리별 지출 비율</h2>
                    {peerResult.ready ? (
                      <div className="mt-6 flex flex-col items-center gap-7 sm:flex-row sm:items-start">
                        <div
                          className="relative h-52 w-52 shrink-0 rounded-full"
                          style={donutStyle}
                        >
                          <div className="absolute inset-[29%] grid place-items-center rounded-full bg-white text-center shadow-[0_0_0_1px_rgba(226,231,240,0.7)]">
                            <span className="text-xs text-[#8a92a3]">총 지출</span>
                            <strong className="mt-0.5 text-sm">
                              {formatAmount(peerResult.userTotalAmount)}원
                            </strong>
                          </div>
                        </div>
                        <div className="w-full space-y-3">
                          {donutItems.map((item) => (
                            <div
                              key={item.name}
                              className="flex items-center justify-between gap-4 text-sm"
                            >
                              <div className="flex min-w-0 items-center gap-2.5">
                                <span
                                  className="h-3 w-3 shrink-0 rounded-full"
                                  style={{ backgroundColor: item.color }}
                                />
                                <span className="truncate font-medium text-[#4a5264]">
                                  {item.name}
                                </span>
                              </div>
                              <span className="font-bold text-[#252b38]">
                                {formatRatio(item.ratio)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-6 text-sm text-[#858d9e]">
                        비교할 수 있는 소비 내역이 없습니다.
                      </p>
                    )}
                  </article>

                  <article className="rounded-[26px] border border-[#e3e8f1] bg-white p-6 shadow-[0_12px_36px_rgba(43,56,100,0.04)]">
                    <div>
                      <h2 className="text-lg font-bold">또래 대비 소비 비교</h2>
                      <p className="mt-1 text-sm text-[#858d9e]">
                        막대는 소비금액이 아니라 또래 평균을 100으로 둔 상대 지수예요.
                      </p>
                    </div>

                    <div className="mt-6 space-y-6">
                      {peerComparableItems.slice(0, 4).map((comparison) => (
                        <div key={comparison.kosisCode}>
                          <div className="mb-2 flex items-center justify-between gap-4">
                            <p className="font-semibold text-[#4b5365]">
                              {comparison.categoryName}
                            </p>
                            <span className="rounded-full bg-[#eef1ff] px-3 py-1 text-xs font-bold text-[#4565ed]">
                              또래 대비 {formatIndexMultiple(comparison.spendingIndex)}
                            </span>
                          </div>
                          <div className="relative h-7 overflow-hidden rounded-full bg-[#edf0f6]">
                            <div
                              className="h-full rounded-full bg-[#4565ed]"
                              style={{ width: getIndexBarWidth(comparison.spendingIndex) }}
                            />
                            <span
                              className="absolute inset-y-0 w-0.5 bg-[#6f788a]"
                              style={{ left: "33.333%" }}
                              aria-hidden="true"
                            />
                          </div>
                          <div className="mt-1 flex justify-between text-[10px] text-[#9aa2b2]">
                            <span>0</span>
                            <span>100 = 또래와 비슷</span>
                            <span>300+</span>
                          </div>
                          <p className="mt-2 text-xs text-[#7e8798]">
                            비교용 내 비중 {formatOptionalRatio(comparison.comparisonUserRatio)} · 또래 평균 {formatOptionalRatio(comparison.benchmarkSalesRatio)}
                          </p>
                        </div>
                      ))}
                    </div>

                    {peerExcludedItems.length > 0 ? (
                      <div className="mt-6 rounded-2xl bg-[#fff7e8] px-4 py-3 text-xs leading-5 text-[#8b651d]">
                        {peerExcludedItems.map((comparison) => (
                          <div key={comparison.kosisCode} className="not-last:mb-3">
                            <p>
                              <strong>{comparison.categoryName}</strong>: {comparison.comparisonUnavailableReason}
                            </p>
                            {comparison.referenceBenchmarkText ? (
                              <p className="mt-1 text-[#6e5a32]">
                                참고: {comparison.referenceBenchmarkText}. {comparison.referenceBenchmarkNote}
                              </p>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                </section>

                {peerResult.ready && indexRankings.length > 0 ? (
                  <section className="mt-6 rounded-[26px] border border-[#e3e8f1] bg-white p-6 shadow-[0_12px_36px_rgba(43,56,100,0.04)]">
                    <div>
                      <h2 className="text-lg font-bold">
                        또래 대비 소비 비중 상위
                      </h2>
                      <p className="mt-1 text-sm text-[#858d9e]">
                        소비지수 100은 또래와 비슷, 200은 또래 평균의 2배예요.
                      </p>
                    </div>

                    <div className="mt-6 space-y-6">
                      {indexRankings.slice(0, 3).map((comparison, index) => (
                        <div key={comparison.kosisCode}>
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <span
                                className={cn(
                                  "grid h-7 w-7 place-items-center rounded-full text-xs font-bold text-white",
                                  index === 0
                                    ? "bg-[#61d9ae]"
                                    : index === 1
                                      ? "bg-[#58cfe0]"
                                      : "bg-[#8da2f7]",
                                )}
                              >
                                {index + 1}
                              </span>
                              <strong>{comparison.categoryName}</strong>
                            </div>
                            <span
                              className={cn(
                                "rounded-full px-3 py-1 text-xs font-bold",
                                index === 0
                                  ? "bg-[#e8fbf5] text-[#2dbb89]"
                                  : index === 1
                                    ? "bg-[#e8fafd] text-[#37bfd3]"
                                    : "bg-[#eef1ff] text-[#728bee]",
                              )}
                            >
                              {formatIndexMultiple(comparison.spendingIndex)}
                            </span>
                          </div>

                          <div className="relative h-10 overflow-hidden rounded-full bg-[#edf0f6]">
                            <div
                              className={cn(
                                "flex h-full items-center justify-end rounded-full px-3 text-xs font-bold text-white",
                                index === 0
                                  ? "bg-[#61d9ae]"
                                  : index === 1
                                    ? "bg-[#58cfe0]"
                                    : "bg-[#8da2f7]",
                              )}
                              style={{ width: getIndexBarWidth(comparison.spendingIndex) }}
                            >
                              지수 {Math.round(comparison.spendingIndex ?? 0)}
                            </div>
                            <span
                              className="absolute inset-y-0 w-0.5 bg-[#626b7d]"
                              style={{ left: "33.333%" }}
                              aria-hidden="true"
                            />
                          </div>
                          <div className="mt-1 flex justify-between text-[10px] text-[#9aa2b2]">
                            <span>0</span>
                            <span>100 = 또래와 비슷</span>
                            <span>300+</span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[#7e8798]">
                            <span>
                              내 비중 {formatOptionalRatio(comparison.comparisonUserRatio)} · 또래 {formatOptionalRatio(comparison.benchmarkSalesRatio)}
                            </span>
                            <span>{getPeerSpendingLevelLabel(comparison.level)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                {peerResult.ready ? (
                  <section className="mt-6 overflow-hidden rounded-[26px] border border-[#e3e8f1] bg-white shadow-[0_12px_36px_rgba(43,56,100,0.04)]">
                    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#edf0f5] px-6 py-5">
                      <div>
                        <h2 className="text-lg font-bold">또래 소비 비교 상세</h2>
                        <p className="mt-1 text-sm text-[#858d9e]">
                          {peerResult.benchmarkLabel} 기준 · {peerResult.referencePeriodLabel}
                        </p>
                      </div>
                      <div className="text-right text-sm text-[#697184]">
                        <p>내 분석 대상 소비 {formatAmount(peerResult.userTotalAmount)}원</p>
                        <p className="mt-1">
                          포함 {peerResult.includedTransactionCount}건 · 제외 {peerResult.excludedTransactionCount}건
                        </p>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-[1320px] w-full border-collapse text-left text-sm">
                        <thead>
                          <tr className="bg-[#fafbfe] text-[#697184]">
                            <th className="px-5 py-4 font-semibold">소비 분야</th>
                            <th className="px-5 py-4 font-semibold">내 금액</th>
                            <th className="px-5 py-4 font-semibold">내 전체 소비 비중</th>
                            <th className="px-5 py-4 font-semibold">비교용 내 비중</th>
                            <th className="px-5 py-4 font-semibold">또래 평균 비중</th>
                            <th className="px-5 py-4 font-semibold">소비지수</th>
                            <th className="px-5 py-4 font-semibold">해석</th>
                            <th className="px-5 py-4 font-semibold">내 건당 평균</th>
                            <th className="px-5 py-4 font-semibold">또래 건당 평균</th>
                          </tr>
                        </thead>
                        <tbody>
                          {peerResult.comparisons.map((comparison) => (
                            <tr key={comparison.kosisCode} className="border-t border-[#edf0f5]">
                              <td className="px-5 py-4 font-semibold text-[#252b38]">
                                {comparison.categoryName}
                              </td>
                              <td className="whitespace-nowrap px-5 py-4 text-[#5e687a]">
                                {formatAmount(comparison.userAmount)}원
                              </td>
                              <td className="px-5 py-4 text-[#5e687a]">
                                {formatRatio(comparison.userRatio)}
                              </td>
                              <td className="px-5 py-4 text-[#5e687a]">
                                {formatOptionalRatio(comparison.comparisonUserRatio)}
                              </td>
                              <td className="px-5 py-4 text-[#5e687a]">
                                {formatOptionalRatio(comparison.benchmarkSalesRatio)}
                              </td>
                              <td className="px-5 py-4 font-bold text-[#4565ed]">
                                {comparison.spendingIndex === null
                                  ? "-"
                                  : Math.round(comparison.spendingIndex)}
                              </td>
                              <td className="min-w-64 px-5 py-4 text-[#5e687a]">
                                <p>{getPeerSpendingLevelLabel(comparison.level)}</p>
                                {comparison.comparisonUnavailableReason ? (
                                  <div className="mt-1 text-xs leading-5 text-[#9a7a35]">
                                    <p>{comparison.comparisonUnavailableReason}</p>
                                    {comparison.referenceBenchmarkText ? (
                                      <p className="mt-1">
                                        참고: {comparison.referenceBenchmarkText}. {comparison.referenceBenchmarkNote}
                                      </p>
                                    ) : null}
                                  </div>
                                ) : null}
                              </td>
                              <td className="whitespace-nowrap px-5 py-4 text-[#5e687a]">
                                {formatAmount(comparison.userAverageTicketAmount)}원
                              </td>
                              <td className="whitespace-nowrap px-5 py-4 text-[#5e687a]">
                                {comparison.benchmarkAverageTicketAmount === null
                                  ? "-"
                                  : `${formatAmount(comparison.benchmarkAverageTicketAmount)}원`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="space-y-1 border-t border-[#edf0f5] bg-[#fafbfe] px-6 py-5 text-xs leading-5 text-[#8b93a4]">
                      <p>소비지수 = 비교 가능한 분야만 다시 합산한 내 비중 ÷ 동일 기준의 또래 평균 비중 × 100</p>
                      <p>교통·운송은 내 지출 비율, CARD-TI, 카드 추천에는 반영되지만 대중교통 기준이 없는 서울 상권 데이터와는 비교하지 않습니다.</p>
                      <p>소비지수 100은 소비금액이 아니라 비교 가능한 소비에서 차지하는 비중이 비슷하다는 뜻입니다.</p>
                      <p>또래 건당 평균은 총매출금액 ÷ 매출건수이며 1인당 월평균 소비액이 아닙니다.</p>
                    </div>
                  </section>
                ) : null}

                <ResultShareActions
                  cardTiType={scoreResult.cardTiType}
                  profileName={profile.name}
                  profileDescription={profile.description}
                  billingMonth={billingMonth}
                  ageLabel={selectedAgeLabel}
                  ie={scoreResult.ie}
                  vr={scoreResult.vr}
                  nw={scoreResult.nw}
                  categories={peerResult.comparisons}
                />

                <section className="relative mt-6 overflow-hidden rounded-[26px] bg-[#4b64e5] p-6 text-white sm:flex sm:items-center sm:gap-5">
                  <div className="absolute -left-20 -top-28 h-64 w-64 rounded-full bg-white/[0.06]" />
                  <div className="absolute -right-20 -bottom-32 h-72 w-72 rounded-full bg-white/[0.07]" />
                  <span className="relative z-10 grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/[0.15] text-xl font-bold">
                    {scoreResult.cardTiType}
                  </span>
                  <div className="relative z-10 mt-4 sm:mt-0">
                    <p className="text-sm font-semibold text-white/[0.65]">
                      소비 MBTI 진단
                    </p>
                    <p className="mt-1 font-semibold leading-7">
                      {profile.description}
                    </p>
                  </div>
                </section>

                <div className="mt-4 rounded-2xl bg-[#eef1ff] px-5 py-4 text-sm leading-6 text-[#687184]">
                  소비지수 100은 소비금액이 같다는 뜻이 아니라, 또래 비교가
                  가능한 소비 중 해당 카테고리가 차지하는 비중이 비슷하다는
                  뜻이에요. 교통·운송은 지출 분석과 카드 추천에는 반영되지만
                  또래 소비지수에서는 제외됩니다.
                </div>
              </>
            ) : (
              <section className="rounded-[26px] border border-[#ffd6a8] bg-[#fff9ef] p-8 text-center">
                <h2 className="text-xl font-bold text-[#9a6115]">
                  분석할 수 있는 거래가 부족해요
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#9a6d31]">
                  미분류 거래의 카테고리를 확인하거나 다른 명세서를
                  업로드해 주세요.
                </p>
                <button
                  type="button"
                  onClick={() => setScreen("review")}
                  className="mt-5 rounded-full bg-[#4565ed] px-5 py-3 text-sm font-bold text-white"
                >
                  결제내역 다시 확인하기
                </button>
              </section>
            )}
          </main>

          <CardRecommendationExperience
            categories={peerResult.comparisons.map((comparison) => ({
              kosisCode: comparison.kosisCode,
              name: comparison.categoryName,
              amount: comparison.userAmount,
              ratio: comparison.userRatio,
              spendingIndex: comparison.spendingIndex,
            }))}
            transactions={transactions}
            monthlySpend={scoreResult.eligibleTotalAmount}
            cardTiType={scoreResult.cardTiType}
            currentCardName={currentCardName}
            disabled={!scoreResult.ready}
          />
        </div>
      ) : null}

    </div>
  );
}
