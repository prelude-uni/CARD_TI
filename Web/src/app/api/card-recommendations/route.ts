import { NextRequest, NextResponse } from "next/server";
import { getTopCardRecommendations } from "@/lib/card-recommendation";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      categories,
      transactions,
      monthlySpend,
      cardTiType,
      excludedCardName,
    } = body;

    const recommendations = await getTopCardRecommendations({
      categories: Array.isArray(categories) ? categories : [],
      transactions: Array.isArray(transactions) ? transactions : [],
      monthlySpend: Number(monthlySpend) || 0,
      cardTiType: typeof cardTiType === "string" ? cardTiType : "",
      excludedCardName:
        typeof excludedCardName === "string" ? excludedCardName : "",
    });

    return NextResponse.json(recommendations);
  } catch (error) {
    console.error("Card recommendation error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "카드 추천 정보를 불러오는 중 오류가 발생했습니다.",
      },
      { status: 500 },
    );
  }
}
