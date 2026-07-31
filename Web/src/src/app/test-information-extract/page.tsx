"use client";

import { type FormEvent, useMemo, useState } from "react";

type TransactionType =
  | "payment"
  | "discount"
  | "refund"
  | "unknown";

type ExtractionResult = {
  statement: {
    billingMonth: string;
  };
  transactions: Array<{
    date: string;
    merchantName: string;
    amount: number;
    mcc: string;
    transactionType: TransactionType;
  }>;
};

type ErrorResponse = {
  error?: string;
};

function formatAmount(amount: number): string {
  return new Intl.NumberFormat("ko-KR").format(amount);
}

function transactionTypeLabel(type: TransactionType): string {
  const labels: Record<TransactionType, string> = {
    payment: "결제",
    discount: "할인",
    refund: "환급·취소",
    unknown: "미확인",
  };

  return labels[type];
}

export default function TestInformationExtractPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const totalAmount = useMemo(() => {
    if (!result) {
      return 0;
    }

    return result.transactions.reduce(
      (sum, transaction) => sum + transaction.amount,
      0,
    );
  }, [result]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setError("테스트할 PDF 또는 이미지 파일을 선택해 주세요.");
      return;
    }

    setIsLoading(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/information-extract", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as
        | ExtractionResult
        | ErrorResponse;

      if (!response.ok) {
        const message =
          "error" in data && data.error
            ? data.error
            : "거래내역 구조화에 실패했습니다.";

        throw new Error(message);
      }

      setResult(data as ExtractionResult);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "거래내역 구조화 중 오류가 발생했습니다.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="mb-2 text-sm font-semibold text-indigo-600">
            CARD-TI 개발 테스트
          </p>
          <h1 className="text-3xl font-bold tracking-tight">
            Information Extraction 테스트
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            카드명세서에서 이용일자, 가맹점명, 금액, MCC,
            거래유형만 추출합니다. Upstage 원본 응답과 명세서의
            개인정보는 이 화면에 표시하지 않습니다.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <label
            htmlFor="statement-file"
            className="mb-2 block text-sm font-semibold"
          >
            카드명세서 파일
          </label>

          <input
            id="statement-file"
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setError("");
              setResult(null);
            }}
            className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:font-medium"
          />

          {file ? (
            <p className="mt-3 text-sm text-slate-600">
              선택된 파일: {file.name}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!file || isLoading}
            className="mt-5 rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isLoading ? "분석 중..." : "거래내역 구조화 테스트"}
          </button>
        </form>

        {error ? (
          <section
            role="alert"
            className="mb-8 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </section>
        ) : null}

        {result ? (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold">구조화된 거래내역</h2>
                <p className="mt-1 text-sm text-slate-600">
                  청구월: {result.statement.billingMonth || "-"} · 거래
                  {result.transactions.length}건
                </p>
              </div>

              <p className="text-sm font-semibold text-slate-700">
                단순 합계: {formatAmount(totalAmount)}원
              </p>
            </div>

            {result.transactions.length === 0 ? (
              <p className="p-6 text-sm text-slate-600">
                추출된 거래가 없습니다. 파일의 이용상세내역을 확인해
                주세요.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead className="bg-slate-100 text-slate-700">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">날짜</th>
                      <th className="min-w-64 px-4 py-3 font-semibold">가맹점명</th>
                      <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">금액</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">MCC</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold">거래유형</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.transactions.map((transaction, index) => (
                      <tr
                        key={`${transaction.date}-${transaction.merchantName}-${transaction.amount}-${index}`}
                        className="border-t border-slate-100"
                      >
                        <td className="whitespace-nowrap px-4 py-3">
                          {transaction.date || "-"}
                        </td>
                        <td className="px-4 py-3">{transaction.merchantName}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                          {formatAmount(transaction.amount)}원
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {transaction.mcc || "-"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {transactionTypeLabel(transaction.transactionType)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
