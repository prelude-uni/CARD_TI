import { classifyUnmappedMerchantsWithSolar } from "@/lib/merchant-llm-classifier";
import {
  classifyMerchant,
  getUnmappedClassification,
  type MerchantClassification,
} from "@/lib/merchant-classifier";
import { normalizeMerchantName } from "@/lib/merchant-normalizer";

export type TransactionType =
  | "payment"
  | "discount"
  | "refund"
  | "unknown";

export type ExtractedStatement = {
  billingMonth: string;
};

export type ExtractedTransaction = {
  date: string;
  merchantName: string;
  normalizedMerchantName: string;
  classification: MerchantClassification;
  amount: number;
  mcc: string;
  transactionType: TransactionType;
};

export type Transaction = ExtractedTransaction;

export type InformationExtractionResult = {
  statement: ExtractedStatement;
  transactions: ExtractedTransaction[];
};

const UPSTAGE_INFORMATION_EXTRACTION_URL =
  "https://api.upstage.ai/v1/information-extraction";

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["billingMonth", "transactions"],
  properties: {
    billingMonth: {
      type: "string",
      description:
        '카드명세서의 청구 대상 월 또는 이용 월. 문서에서 확인할 수 없으면 빈 문자열 ""을 반환한다. 고객 이름, 카드번호, 주소 등 개인정보는 추출하지 않는다.',
    },
    transactions: {
      type: "array",
      description:
        "카드명세서의 이용상세내역에 포함된 실제 거래만 반환한다. 합계, 소계, 리볼빙 내역, 고객센터 안내, 문서 머리말과 꼬리말은 제외한다. 같은 거래를 중복 생성하지 않는다.",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "date",
          "merchantName",
          "amount",
          "mcc",
          "transactionType",
        ],
        properties: {
          date: {
            type: "string",
            description:
              '문서에 표시된 이용일자. 확인할 수 없으면 빈 문자열 ""을 반환한다.',
          },
          merchantName: {
            type: "string",
            description:
              '문서에 표시된 가맹점명. 확인할 수 없으면 빈 문자열 ""을 반환한다. 고객 이름, 카드번호, 계좌번호, 주소, 전화번호, 이메일, 승인번호는 포함하지 않는다.',
          },
          amount: {
            type: "number",
            description:
              "이용금액에서 쉼표와 통화 기호를 제거한 숫자. 할인, 환급, 취소처럼 문서에 음수로 표시된 금액은 음수를 유지한다.",
          },
          mcc: {
            type: "string",
            description:
              '문서에 MCC가 실제로 표시된 경우에만 그대로 추출한다. 표시되지 않았다면 추측하지 말고 빈 문자열 ""을 반환한다.',
          },
          transactionType: {
            type: "string",
            description:
              '거래유형. payment, discount, refund, unknown 중 하나를 반환한다. 판단할 수 없으면 "unknown"을 반환한다.',
          },
        },
      },
    },
  },
} as const;

type UnknownRecord = Record<string, unknown>;

export class InformationExtractionError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "InformationExtractionError";
    this.status = status;
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/[^\d.-]/g, "");
    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeTransactionType(
  value: unknown,
  amount: number,
  merchantName: string,
): TransactionType {
  const normalizedType = safeString(value).toLowerCase();
  const normalizedMerchant = merchantName
    .replace(/\s+/g, "")
    .toLowerCase();

  // 양수 금액은 특별서비스 열에 '할인'이 표시되어도 실제 결제다.
  if (amount > 0) {
    return "payment";
  }

  // 금액이 0원이면 거래유형을 확정하지 않는다.
  if (amount === 0) {
    return "unknown";
  }

  const isRefund =
    normalizedType.includes("refund") ||
    normalizedType.includes("환급") ||
    normalizedType.includes("환불") ||
    normalizedType.includes("취소") ||
    normalizedMerchant.includes("환급금") ||
    normalizedMerchant.includes("환불") ||
    normalizedMerchant.includes("취소");

  if (isRefund) {
    return "refund";
  }

  const isDiscount =
    normalizedType.includes("discount") ||
    normalizedType.includes("할인") ||
    normalizedType.includes("캐시백") ||
    normalizedMerchant.includes("할인") ||
    normalizedMerchant.includes("캐시백");

  if (isDiscount) {
    return "discount";
  }

  return "unknown";
}

function sanitizeExtraction(value: unknown): InformationExtractionResult {
  if (!isRecord(value)) {
    throw new InformationExtractionError(
      "Upstage가 반환한 구조화 결과를 읽을 수 없습니다.",
      502,
    );
  }

  const rawTransactions = Array.isArray(value.transactions)
    ? value.transactions
    : [];

  const transactions: ExtractedTransaction[] = [];
  const seen = new Set<string>();

  for (const item of rawTransactions) {
    if (!isRecord(item)) {
      continue;
    }

    const merchantName = safeString(item.merchantName);
    const amount = safeAmount(item.amount);

    if (!merchantName || amount === null) {
      continue;
    }

    const normalizedMerchantName = normalizeMerchantName(merchantName);
    const mcc = safeString(item.mcc);
    const transactionType = normalizeTransactionType(
      item.transactionType,
      amount,
      merchantName,
    );
    const classification =
      transactionType === "payment"
        ? classifyMerchant(normalizedMerchantName, mcc, amount)
        : getUnmappedClassification();

    const transaction: ExtractedTransaction = {
      date: safeString(item.date),
      merchantName,
      normalizedMerchantName,
      classification,
      amount,
      mcc,
      transactionType,
    };

    const duplicateKey = [
      transaction.date,
      transaction.merchantName,
      transaction.amount,
      transaction.mcc,
      transaction.transactionType,
    ].join("|");

    if (seen.has(duplicateKey)) {
      continue;
    }

    seen.add(duplicateKey);
    transactions.push(transaction);
  }

  return {
    statement: {
      billingMonth: safeString(value.billingMonth),
    },
    transactions,
  };
}

function getMessageContent(responseBody: unknown): unknown {
  if (!isRecord(responseBody)) {
    return responseBody;
  }

  const choices = responseBody.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const firstChoice = choices[0];

    if (isRecord(firstChoice) && isRecord(firstChoice.message)) {
      return firstChoice.message.content;
    }
  }

  if ("billingMonth" in responseBody || "transactions" in responseBody) {
    return responseBody;
  }

  if ("result" in responseBody) {
    return responseBody.result;
  }

  if ("data" in responseBody) {
    return responseBody.data;
  }

  return responseBody;
}

function parseStructuredContent(content: unknown): unknown {
  if (typeof content === "string") {
    try {
      return JSON.parse(content);
    } catch {
      throw new InformationExtractionError(
        "Upstage의 구조화 결과가 올바른 JSON이 아닙니다.",
        502,
      );
    }
  }

  if (Array.isArray(content)) {
    const textPart = content.find(
      (part) =>
        isRecord(part) &&
        part.type === "text" &&
        typeof part.text === "string",
    );

    if (isRecord(textPart) && typeof textPart.text === "string") {
      try {
        return JSON.parse(textPart.text);
      } catch {
        throw new InformationExtractionError(
          "Upstage의 구조화 결과가 올바른 JSON이 아닙니다.",
          502,
        );
      }
    }
  }

  return content;
}

function getSafeUpstageError(
  responseBody: unknown,
  status: number,
): string {
  if (isRecord(responseBody)) {
    const errorValue = responseBody.error;

    if (typeof errorValue === "string") {
      return errorValue;
    }

    if (isRecord(errorValue) && typeof errorValue.message === "string") {
      return errorValue.message;
    }

    if (typeof responseBody.message === "string") {
      return responseBody.message;
    }
  }

  return `Upstage Information Extraction 요청에 실패했습니다. (${status})`;
}

export async function extractInformation(
  file: File,
): Promise<InformationExtractionResult> {
  const apiKey = process.env.UPSTAGE_API_KEY;

  if (!apiKey) {
    throw new InformationExtractionError(
      "UPSTAGE_API_KEY가 설정되어 있지 않습니다.",
      500,
    );
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";
  const dataUrl = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;

  const response = await fetch(UPSTAGE_INFORMATION_EXTRACTION_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "information-extract",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: dataUrl,
              },
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "card_statement_transactions",
          schema: EXTRACTION_SCHEMA,
        },
      },
    }),
    cache: "no-store",
  });

  let responseBody: unknown;

  try {
    responseBody = await response.json();
  } catch {
    throw new InformationExtractionError(
      `Upstage가 JSON이 아닌 응답을 반환했습니다. (${response.status})`,
      502,
    );
  }

  if (!response.ok) {
    throw new InformationExtractionError(
      getSafeUpstageError(responseBody, response.status),
      response.status,
    );
  }

  const messageContent = getMessageContent(responseBody);
  const structuredContent = parseStructuredContent(messageContent);
  const extractedResult = sanitizeExtraction(structuredContent);

  /*
   * 키워드와 실제 MCC로 분류되지 않은 결제 가맹점만
   * 중복을 제거해 Solar에 묶어서 보냅니다.
   */
  const llmTargetMerchants = extractedResult.transactions
    .filter(
      (transaction) =>
        transaction.transactionType === "payment" &&
        !transaction.classification.matched,
    )
    .map((transaction) => ({
      originalMerchantName: transaction.merchantName,
      normalizedMerchantName: transaction.normalizedMerchantName,
      actualMcc: transaction.mcc,
    }));

  const llmClassifications =
    await classifyUnmappedMerchantsWithSolar(
      llmTargetMerchants,
    );

  return {
    statement: extractedResult.statement,
    transactions: extractedResult.transactions.map((transaction) => {
      if (transaction.classification.matched) {
        return transaction;
      }

      const llmClassification = llmClassifications.get(
        transaction.normalizedMerchantName,
      );

      if (!llmClassification) {
        return transaction;
      }

      return {
        ...transaction,
        classification: llmClassification,
      };
    }),
  };
}
