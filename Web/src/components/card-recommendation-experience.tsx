"use client";

import { useState } from "react";

import {
  getTopCardRecommendations,
  type CardRecommendation,
  type RecommendationCategoryInput,
} from "@/lib/card-recommendation";
import type { Transaction } from "@/lib/upstage/information-extract";

type Props = {
  categories: RecommendationCategoryInput[];
  transactions: Transaction[];
  monthlySpend: number;
  cardTiType: string;
  currentCardName?: string;
  disabled?: boolean;
};

function formatAmount(value: number): string {
  return Math.round(value).toLocaleString("ko-KR");
}

function CardIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3 10h18" />
      <path d="M7 15h4" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function RecommendationCard({
  recommendation,
}: {
  recommendation: CardRecommendation;
}) {
  const feeLabel =
    recommendation.annualFee === null
      ? recommendation.cardType === "체크카드"
        ? "연회비 정보 없음"
        : "연회비 정보 없음"
      : `연회비 ${formatAmount(recommendation.annualFee)}원부터`;

  return (
    <article className="relative overflow-hidden rounded-[26px] border border-[#e2e7f0] bg-white p-6 shadow-[0_14px_38px_rgba(43,56,100,0.06)]">
      <div className="absolute -right-12 -top-16 h-40 w-40 rounded-full bg-[#eef1ff]" />
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#4565ed] text-lg font-extrabold text-white">
            {recommendation.rank}
          </span>
          <div className="text-right text-xs leading-5 text-[#8a93a5]">
            <p>{recommendation.cardType}</p>
            <p>{feeLabel}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-[#687184]">
            {recommendation.issuerName}
          </p>
          <span
            className={
              recommendation.isCardDataVerified
                ? "rounded-full bg-[#e8fbf5] px-2.5 py-1 text-[10px] font-bold text-[#248f6c]"
                : "rounded-full bg-[#fff4df] px-2.5 py-1 text-[10px] font-bold text-[#a36b17]"
            }
          >
            {recommendation.isCardDataVerified
              ? "카드 정보 검증 표시"
              : "혜택 DB 기반 추정"}
          </span>
        </div>
        <h3 className="mt-1 text-2xl font-extrabold tracking-[-0.04em] text-[#171b27]">
          {recommendation.cardName}
        </h3>

        {recommendation.estimatedMonthlyBenefit !== null ? (
          <div className="mt-4 rounded-2xl bg-[#eef1ff] px-4 py-3">
            <p className="text-xs font-bold text-[#687184]">
              현재 소비 기준 보수적 예상 월 혜택
            </p>
            <p className="mt-1 text-xl font-extrabold text-[#4565ed]">
              약 {formatAmount(recommendation.estimatedMonthlyBenefit)}원
            </p>
          </div>
        ) : null}

        {recommendation.matchedCategories.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {recommendation.matchedCategories.map((category) => (
              <span
                key={category}
                className="rounded-full bg-[#eef1ff] px-3 py-1.5 text-xs font-bold text-[#4565ed]"
              >
                {category}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-2 flex flex-wrap gap-2">
          {recommendation.benefitTypes.map((benefitType) => (
            <span
              key={benefitType}
              className="rounded-full bg-[#eff8f3] px-3 py-1.5 text-xs font-bold text-[#23805a]"
            >
              {benefitType}
            </span>
          ))}
        </div>

        <div className="mt-5 rounded-2xl bg-[#f7f8fc] p-4">
          <p className="text-xs font-bold text-[#4565ed]">추천 이유</p>
          <p className="mt-1.5 text-sm font-semibold leading-6 text-[#303747]">
            {recommendation.recommendationReason}
          </p>
        </div>

        <div className="mt-4 space-y-3">
          {recommendation.benefits.map((benefit) => (
            <div
              key={benefit.benefitId}
              className="rounded-2xl border border-[#e7eaf1] bg-white p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#eef1ff] px-2.5 py-1 text-[11px] font-bold text-[#4565ed]">
                  {benefit.consumerCategory}
                </span>
                <span className="rounded-full bg-[#eff8f3] px-2.5 py-1 text-[11px] font-bold text-[#23805a]">
                  {benefit.benefitType}
                </span>
              </div>
              <p className="mt-3 text-xs font-bold text-[#596274]">
                적용처: {benefit.merchantGroup}
              </p>
              <p className="mt-2 text-xs leading-5 text-[#727b8d]">
                {benefit.rawText}
              </p>
              <div className="mt-3 border-t border-[#edf0f5] pt-3 text-[11px] font-semibold text-[#929aab]">
                <p>{benefit.usageConditionLabel}</p>
                <p className="mt-1">{benefit.estimateMethodLabel}</p>
                {benefit.estimatedMonthlyBenefit !== null ? (
                  <p className="mt-1 text-[#4565ed]">
                    이 혜택 보수적 예상: 월 약 {formatAmount(benefit.estimatedMonthlyBenefit)}원
                  </p>
                ) : (
                  <p className="mt-1">수치화하지 않고 추천 근거에만 반영했어요.</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {recommendation.applicationUrl ? (
          <a
            href={recommendation.applicationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#4565ed] px-5 py-4 font-bold text-white transition hover:bg-[#3858dc]"
          >
            카드사에서 자세히 보기
            <ArrowIcon />
          </a>
        ) : (
          <span className="mt-5 flex w-full cursor-not-allowed items-center justify-center rounded-2xl bg-[#edf0f5] px-5 py-4 font-bold text-[#9aa2b2]">
            신청 링크 준비 중
          </span>
        )}
      </div>
    </article>
  );
}

export function CardRecommendationExperience({
  categories,
  transactions,
  monthlySpend,
  cardTiType,
  currentCardName = "",
  disabled = false,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<CardRecommendation[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);

  async function loadRecommendations() {
    if (disabled || isLoading) return;

    setIsOpen(true);
    setIsLoading(true);
    setError(null);
    setRecommendations([]);

    try {
      const result = await getTopCardRecommendations({
        categories,
        transactions,
        monthlySpend,
        cardTiType,
        excludedCardName: currentCardName,
      });
      setRecommendations(result);
    } catch (recommendationError) {
      setError(
        recommendationError instanceof Error
          ? recommendationError.message
          : "카드 추천 정보를 불러오지 못했습니다.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#dfe4ed] bg-[#f7f8fc]/95 px-5 py-5 backdrop-blur sm:px-8">
        <button
          type="button"
          onClick={loadRecommendations}
          disabled={disabled || isLoading}
          className="mx-auto flex w-full max-w-[1120px] items-center justify-center gap-2 rounded-[20px] bg-[#4565ed] px-6 py-5 text-lg font-bold text-white shadow-[0_14px_28px_rgba(69,101,237,0.24)] transition hover:bg-[#3858dc] disabled:cursor-not-allowed disabled:bg-[#aab5e8]"
        >
          <CardIcon />
          나에게 맞는 카드 추천 받기
        </button>
      </div>

      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="card-recommendation-title"
          className="fixed inset-0 z-50 overflow-y-auto bg-[#f7f8fc]"
        >
          <header className="sticky top-0 z-20 border-b border-[#e1e6ef] bg-[#f7f8fc]/95 backdrop-blur">
            <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-5 py-5 sm:px-8">
              <div>
                <h2
                  id="card-recommendation-title"
                  className="text-xl font-extrabold tracking-[-0.04em]"
                >
                  나를 위한 카드 TOP 3
                </h2>
                <p className="mt-1 text-sm text-[#858d9e]">
                  소비처와 혜택 DB의 적용처를 연결해 추천했어요.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="카드 추천 닫기"
                className="grid h-11 w-11 place-items-center rounded-full bg-white text-[#384052] shadow-sm transition hover:bg-[#eef1ff]"
              >
                <CloseIcon />
              </button>
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1180px] px-5 py-8 sm:px-8">
            <section className="overflow-hidden rounded-[28px] bg-[#4964e8] p-7 text-white shadow-[0_22px_48px_rgba(68,94,220,0.2)] sm:p-9">
              <p className="text-sm font-semibold text-white/70">
                {cardTiType} 소비 유형 기반
              </p>
              <h3 className="mt-2 text-3xl font-extrabold tracking-[-0.045em]">
                자주 쓰는 소비처에서 실제 혜택이 있는 카드를 찾았어요
              </h3>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">
                merchant_groups로 소비 결과와 적용처를 연결하고, 현재 명세서가
                전월 실적을 충족하는 혜택만 보수적으로 계산했어요.
              </p>
            </section>

            {isLoading ? (
              <section className="mt-6 grid min-h-[360px] place-items-center rounded-[26px] border border-[#e2e7f0] bg-white p-8 text-center">
                <div>
                  <span className="mx-auto block h-10 w-10 animate-spin rounded-full border-4 border-[#dfe5ff] border-t-[#4565ed]" />
                  <p className="mt-5 font-bold text-[#303747]">
                    카드 혜택 DB를 비교하고 있어요
                  </p>
                  <p className="mt-2 text-sm text-[#8a93a5]">
                    5,487개 혜택에서 현재 소비와 연결되는 항목을 확인합니다.
                  </p>
                </div>
              </section>
            ) : null}

            {!isLoading && error ? (
              <section className="mt-6 rounded-[26px] border border-[#ffd7d2] bg-[#fff7f6] p-8 text-center">
                <h3 className="text-lg font-bold text-[#a9483d]">
                  카드 추천 정보를 불러오지 못했어요
                </h3>
                <p className="mt-2 break-words text-sm leading-6 text-[#a9675f]">
                  {error}
                </p>
                <button
                  type="button"
                  onClick={loadRecommendations}
                  className="mt-5 rounded-2xl bg-[#4565ed] px-5 py-3 text-sm font-bold text-white"
                >
                  다시 불러오기
                </button>
              </section>
            ) : null}

            {!isLoading && !error && recommendations.length > 0 ? (
              <section className="mt-6 grid gap-5 lg:grid-cols-3">
                {recommendations.map((recommendation) => (
                  <RecommendationCard
                    key={recommendation.cardId}
                    recommendation={recommendation}
                  />
                ))}
              </section>
            ) : null}

            {!isLoading && !error && recommendations.length === 0 ? (
              <section className="mt-6 rounded-[26px] border border-[#e2e7f0] bg-white p-8 text-center">
                <h3 className="text-lg font-bold text-[#303747]">
                  연결되는 카드 혜택을 찾지 못했어요
                </h3>
                <p className="mt-2 text-sm leading-6 text-[#858d9e]">
                  거래 카테고리를 다시 확인하거나 merchant_groups 매핑을
                  보완해 주세요.
                </p>
              </section>
            ) : null}

            <div className="mt-6 rounded-2xl bg-[#eef1ff] px-5 py-4 text-xs leading-5 text-[#687184]">
              예상 혜택은 현재 명세서의 소비금액, DB의 혜택률·정액·한도,
              전월 실적 충족 여부를 적용한 보수적 추정치예요. 혜택 DB는 카드사
              실시간 원장이 아니므로 실제 적용처·제외 조건·최신 혜택은 카드사
              공식 페이지에서 반드시 다시 확인해 주세요.
            </div>
          </main>
        </div>
      ) : null}
    </>
  );
}
