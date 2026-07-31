import "server-only";

import {
  getClassificationFromRuleId,
  getMerchantLlmRuleOptions,
  type MerchantClassification,
} from "@/lib/merchant-classifier";

type UnknownRecord = Record<string, unknown>;

export type MerchantLlmInput = {
  originalMerchantName: string;
  normalizedMerchantName: string;
  actualMcc?: string;
};

type MerchantLlmInputValue = MerchantLlmInput | string;

type SolarClassificationItem = {
  id: string;
  ruleId: string;
  confidence: number;
};

const CONFIDENCE_THRESHOLD = 0.55;
const BATCH_SIZE = 6;
const CONVENIENCE_STORE_RULE_ID = "R001";

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeMcc(value: string | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length === 4 ? digits : "";
}

function normalizeInput(value: MerchantLlmInputValue): MerchantLlmInput {
  if (typeof value === "string") {
    const merchantName = value.trim();

    return {
      originalMerchantName: merchantName,
      normalizedMerchantName: merchantName,
      actualMcc: "",
    };
  }

  return {
    originalMerchantName: value.originalMerchantName.trim(),
    normalizedMerchantName: value.normalizedMerchantName.trim(),
    actualMcc: value.actualMcc?.trim() ?? "",
  };
}

function uniqueMerchantInputs(
  inputs: MerchantLlmInputValue[],
): MerchantLlmInput[] {
  const unique = new Map<string, MerchantLlmInput>();

  for (const rawInput of inputs) {
    const input = normalizeInput(rawInput);
    const key = input.normalizedMerchantName;

    if (!key || unique.has(key)) {
      continue;
    }

    unique.set(key, input);
  }

  return [...unique.values()];
}

function getMessageContent(responseBody: unknown): string {
  if (!isRecord(responseBody) || !Array.isArray(responseBody.choices)) {
    return "";
  }

  const firstChoice = responseBody.choices[0];

  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    return "";
  }

  const content = firstChoice.message.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .flatMap((part) => {
        if (!isRecord(part) || typeof part.text !== "string") {
          return [];
        }

        return [part.text];
      })
      .join("\n");
  }

  return "";
}

function extractJsonText(content: string): string {
  const codeBlockMatch = content.match(
    /```(?:json)?\s*([\s\S]*?)```/i,
  );

  if (codeBlockMatch?.[1]) {
    return codeBlockMatch[1].trim();
  }

  const firstBrace = content.indexOf("{");
  const lastBrace = content.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return content.slice(firstBrace, lastBrace + 1);
  }

  return content.trim();
}

function parseSolarResult(
  content: string,
): SolarClassificationItem[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(extractJsonText(content));
  } catch {
    console.error(
      "[CARD-TI] Solar 분류 응답을 JSON으로 읽지 못했습니다.",
    );
    return [];
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.results)) {
    console.error(
      "[CARD-TI] Solar 분류 응답에 results 배열이 없습니다.",
    );
    return [];
  }

  return parsed.results.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const id =
      typeof item.id === "string"
        ? item.id
        : typeof item.id === "number"
          ? String(item.id)
          : "";

    const ruleId =
      typeof item.ruleId === "string"
        ? item.ruleId.trim().toUpperCase()
        : "";

    const confidence =
      typeof item.confidence === "number"
        ? item.confidence
        : typeof item.confidence === "string"
          ? Number(item.confidence)
          : Number.NaN;

    if (!id || !ruleId || !Number.isFinite(confidence)) {
      return [];
    }

    return [
      {
        id,
        ruleId,
        confidence: Math.max(0, Math.min(1, confidence)),
      },
    ];
  });
}

function confidenceLabel(score: number): string {
  if (score >= 0.9) {
    return "높음";
  }

  if (score >= 0.7) {
    return "중";
  }

  return "낮음";
}

function hasConvenienceStoreEvidence(
  merchant: MerchantLlmInput,
  confidence: number,
): boolean {
  const combinedName =
    `${merchant.originalMerchantName} ${merchant.normalizedMerchantName}`;

  const hasBrand =
    /gs\s*25|\bcu\b|씨유|세븐일레븐|이마트\s*24|미니스톱/i.test(
      combinedName,
    );

  const actualMcc = normalizeMcc(merchant.actualMcc);
  const hasStrongMccEvidence =
    actualMcc === "5499" && confidence >= 0.9;

  return hasBrand || hasStrongMccEvidence;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

async function classifyBatch(
  inputs: MerchantLlmInput[],
  apiKey: string,
): Promise<Map<string, MerchantClassification>> {
  const classifications = new Map<
    string,
    MerchantClassification
  >();

  /*
   * 편의점 규칙을 선택지 마지막으로 보내 배열 첫 항목을
   * 기본값처럼 선택하는 편향을 줄입니다.
   */
  const allowedRules = [
    ...getMerchantLlmRuleOptions(),
  ].sort((left, right) => {
    const leftConvenience =
      left.ruleId === CONVENIENCE_STORE_RULE_ID ? 1 : 0;
    const rightConvenience =
      right.ruleId === CONVENIENCE_STORE_RULE_ID ? 1 : 0;

    return leftConvenience - rightConvenience;
  });

  const allowedRuleIds = new Set(
    allowedRules.map((rule) => rule.ruleId),
  );

  const merchants = inputs.map((input, index) => ({
    id: String(index),
    originalMerchantName: input.originalMerchantName,
    normalizedMerchantName: input.normalizedMerchantName,
    actualMcc: input.actualMcc ?? "",
  }));

  const response = await fetch(
    "https://api.upstage.ai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "solar-pro3",
        temperature: 0,
        messages: [
          {
            role: "system",
            content: `
너는 한국 카드명세서의 가맹점명을 CARD-TI 표준카테고리로 분류하는 도우미다.

반드시 지킬 규칙:
1. merchants의 각 id에 대해 결과를 하나씩 반환한다.
2. 자유로운 카테고리명을 만들지 않고 allowedRules의 ruleId만 선택한다.
3. 가맹점명과 실제 MCC를 바탕으로 가장 가까운 allowedRules의 ruleId를 선택한다. 정보가 거의 없어 합리적인 추정이 불가능할 때만 빈 문자열을 반환한다.
4. allowedRules 배열의 첫 항목이나 특정 규칙을 기본값으로 사용하지 않는다.
5. R001 편의점은 GS25, CU, 씨유, 세븐일레븐, 이마트24, 미니스톱처럼 직접적인 브랜드 근거가 있을 때만 선택한다.
6. 생소한 상호명이나 법인명이라는 이유만으로 편의점으로 분류하지 않는다. 편의점 외의 다른 업종은 상호명 단서와 실제 MCC를 함께 보고 가장 가까운 규칙을 선택한다.
7. 원본 가맹점명과 정규화 가맹점명을 함께 보고 판단한다.
8. 실제 MCC가 비어 있으면 MCC를 추측하거나 새로 만들지 않는다.
9. confidence는 0부터 1 사이의 숫자로 반환한다.
10. JSON 이외의 설명은 작성하지 않는다.

반환 형식:
{
  "results": [
    {
      "id": "0",
      "ruleId": "R015",
      "confidence": 0.82
    }
  ]
}
            `.trim(),
          },
          {
            role: "user",
            content: JSON.stringify({
              allowedRules,
              merchants,
            }),
          },
        ],
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const errorText = await response.text();

    console.error(
      "[CARD-TI] Solar 분류 요청 실패:",
      response.status,
      errorText.slice(0, 500),
    );

    return classifications;
  }

  const responseBody: unknown = await response.json();
  const solarResults = parseSolarResult(
    getMessageContent(responseBody),
  );
  const merchantById = new Map(
    merchants.map((merchant) => [
      merchant.id,
      merchant,
    ]),
  );

  for (const result of solarResults) {
    const merchant = merchantById.get(result.id);

    if (
      !merchant ||
      result.confidence < CONFIDENCE_THRESHOLD ||
      !allowedRuleIds.has(result.ruleId)
    ) {
      continue;
    }

    if (
      result.ruleId === CONVENIENCE_STORE_RULE_ID &&
      !hasConvenienceStoreEvidence(
        merchant,
        result.confidence,
      )
    ) {
      continue;
    }

    const classification = getClassificationFromRuleId(
      result.ruleId,
      "llm_fallback",
      confidenceLabel(result.confidence),
    );

    if (classification) {
      classifications.set(
        merchant.normalizedMerchantName,
        classification,
      );
    }
  }

  return classifications;
}

export async function classifyUnmappedMerchantsWithSolar(
  merchantInputs: MerchantLlmInputValue[],
): Promise<Map<string, MerchantClassification>> {
  const classifications = new Map<
    string,
    MerchantClassification
  >();
  const uniqueInputs =
    uniqueMerchantInputs(merchantInputs);

  if (uniqueInputs.length === 0) {
    return classifications;
  }

  const apiKey = process.env.UPSTAGE_API_KEY;

  if (!apiKey) {
    console.error(
      "[CARD-TI] UPSTAGE_API_KEY가 없어 LLM 분류를 건너뜁니다.",
    );
    return classifications;
  }

  for (const merchantBatch of chunk(
    uniqueInputs,
    BATCH_SIZE,
  )) {
    try {
      const batchClassifications =
        await classifyBatch(merchantBatch, apiKey);

      for (const [
        merchantName,
        classification,
      ] of batchClassifications) {
        classifications.set(
          merchantName,
          classification,
        );
      }
    } catch (error) {
      console.error(
        "[CARD-TI] Solar 분류 중 예외:",
        error,
      );
    }
  }

  return classifications;
}
