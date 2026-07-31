const UPSTAGE_DOCUMENT_DIGITIZATION_URL =
  "https://api.upstage.ai/v1/document-digitization";

export class UpstageDocumentParseError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "UpstageDocumentParseError";
    this.statusCode = statusCode;
  }
}

function sanitizeErrorMessage(message: string, apiKey: string): string {
  if (!apiKey) {
    return message;
  }

  return message.split(apiKey).join("[REDACTED]");
}

async function extractSafeErrorMessage(
  response: Response,
  apiKey: string,
): Promise<string> {
  const fallback = `Document parse request failed with status ${response.status}`;

  try {
    const errorBody: unknown = await response.json();

    if (typeof errorBody === "object" && errorBody !== null) {
      if ("message" in errorBody && typeof errorBody.message === "string") {
        return sanitizeErrorMessage(errorBody.message, apiKey);
      }

      if ("error" in errorBody) {
        if (typeof errorBody.error === "string") {
          return sanitizeErrorMessage(errorBody.error, apiKey);
        }

        if (
          typeof errorBody.error === "object" &&
          errorBody.error !== null &&
          "message" in errorBody.error &&
          typeof errorBody.error.message === "string"
        ) {
          return sanitizeErrorMessage(errorBody.error.message, apiKey);
        }
      }
    }
  } catch {
    // Ignore JSON parse errors and use the fallback message.
  }

  return fallback;
}

export async function parseDocument(file: File): Promise<unknown> {
  const apiKey = process.env.UPSTAGE_API_KEY;

  if (!apiKey) {
    throw new UpstageDocumentParseError(
      "UPSTAGE_API_KEY is not configured",
      500,
    );
  }

  const formData = new FormData();
  formData.append("document", file);
  formData.append("model", "document-parse");
  formData.append("ocr", "force");

  const response = await fetch(UPSTAGE_DOCUMENT_DIGITIZATION_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const message = await extractSafeErrorMessage(response, apiKey);
    throw new UpstageDocumentParseError(message, response.status);
  }

  return response.json();
}
