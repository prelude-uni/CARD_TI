import type { Transaction } from "@/lib/upstage/information-extract";

export type AxisLetter = "I" | "E" | "V" | "R" | "N" | "W" | "-";

export type CardTiAxisResult = {
  score: number;
  letter: AxisLetter;
  isBoundary: boolean;
  negativePercent: number;
  positivePercent: number;
};

export type CardTiScoreResult = {
  ready: boolean;
  cardTiType: string;
  eligibleTotalAmount: number;
  includedTransactionCount: number;
  excludedTransactionCount: number;
  ie: CardTiAxisResult;
  vr: CardTiAxisResult;
  nw: CardTiAxisResult;
};

const BOUNDARY_THRESHOLD = 0.05;
const LOGISTIC_K = 3;

function scoreToPositivePercent(score: number): number {
  return 100 / (1 + Math.exp(-LOGISTIC_K * score));
}

function makeAxisResult(
  score: number,
  negativeLetter: AxisLetter,
  positiveLetter: AxisLetter,
): CardTiAxisResult {
  const positivePercent = scoreToPositivePercent(score);

  return {
    score,
    letter: score < 0 ? negativeLetter : positiveLetter,
    isBoundary: Math.abs(score) < BOUNDARY_THRESHOLD,
    negativePercent: 100 - positivePercent,
    positivePercent,
  };
}

function makeEmptyResult(transactionCount: number): CardTiScoreResult {
  const emptyAxis: CardTiAxisResult = {
    score: 0,
    letter: "-",
    isBoundary: true,
    negativePercent: 50,
    positivePercent: 50,
  };

  return {
    ready: false,
    cardTiType: "---",
    eligibleTotalAmount: 0,
    includedTransactionCount: 0,
    excludedTransactionCount: transactionCount,
    ie: emptyAxis,
    vr: emptyAxis,
    nw: emptyAxis,
  };
}

export function calculateCardTiScore(
  transactions: Transaction[],
): CardTiScoreResult {
  const eligibleTransactions = transactions.filter(
    (transaction) =>
      transaction.transactionType === "payment" &&
      transaction.amount > 0 &&
      transaction.classification?.matched === true,
  );

  const eligibleTotalAmount = eligibleTransactions.reduce(
    (sum, transaction) => sum + transaction.amount,
    0,
  );

  if (eligibleTotalAmount <= 0) {
    return makeEmptyResult(transactions.length);
  }

  const rawScores = eligibleTransactions.reduce(
    (scores, transaction) => {
      const classification = transaction.classification;

      scores.ie += transaction.amount * classification.ieWeight;
      scores.vr += transaction.amount * classification.vrWeight;
      scores.nw += transaction.amount * classification.nwWeight;

      return scores;
    },
    { ie: 0, vr: 0, nw: 0 },
  );

  const ie = makeAxisResult(
    rawScores.ie / eligibleTotalAmount,
    "I",
    "E",
  );
  const vr = makeAxisResult(
    rawScores.vr / eligibleTotalAmount,
    "V",
    "R",
  );
  const nw = makeAxisResult(
    rawScores.nw / eligibleTotalAmount,
    "N",
    "W",
  );

  return {
    ready: true,
    cardTiType: `${ie.letter}${vr.letter}${nw.letter}`,
    eligibleTotalAmount,
    includedTransactionCount: eligibleTransactions.length,
    excludedTransactionCount:
      transactions.length - eligibleTransactions.length,
    ie,
    vr,
    nw,
  };
}
