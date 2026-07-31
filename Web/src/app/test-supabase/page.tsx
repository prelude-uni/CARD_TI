"use client";

import { useState } from "react";
import { supabase } from "@/utils/supabase/client";

type CardPreview = {
  card_id: number;
  card_name: string;
};

type TestResult = {
  cardCount: number;
  benefitCount: number;
  cards: CardPreview[];
};

export default function TestSupabasePage() {
  const [result, setResult] = useState<TestResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleTest() {
    setIsLoading(true);
    setErrorMessage("");
    setResult(null);

    try {
      const [cardCountResult, benefitCountResult, cardListResult] =
        await Promise.all([
          supabase
            .from("cards")
            .select("card_id", { count: "exact", head: true }),

          supabase
            .from("benefits")
            .select("benefit_id", { count: "exact", head: true }),

          supabase
            .from("cards")
            .select("card_id, card_name")
            .order("card_id", { ascending: true })
            .limit(3),
        ]);

      const queryError =
        cardCountResult.error ??
        benefitCountResult.error ??
        cardListResult.error;

      if (queryError) {
        throw new Error(queryError.message);
      }

      setResult({
        cardCount: cardCountResult.count ?? 0,
        benefitCount: benefitCountResult.count ?? 0,
        cards: cardListResult.data ?? [],
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Supabase 연결 중 알 수 없는 오류가 발생했습니다.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main style={{ padding: "40px" }}>
      <h1>Supabase 연결 테스트</h1>

      <button
        type="button"
        onClick={handleTest}
        disabled={isLoading}
        style={{ marginTop: "20px", padding: "10px 16px" }}
      >
        {isLoading ? "확인 중..." : "연결 확인"}
      </button>

      {errorMessage && (
        <p style={{ marginTop: "20px", color: "red" }}>
          오류: {errorMessage}
        </p>
      )}

      {result && (
        <section style={{ marginTop: "20px" }}>
          <p>Supabase 연결 성공</p>
          <p>cards: {result.cardCount}</p>
          <p>benefits: {result.benefitCount}</p>

          <h2 style={{ marginTop: "20px" }}>카드 예시</h2>

          <ul>
            {result.cards.map((card) => (
              <li key={card.card_id}>
                {card.card_id}: {card.card_name}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}