import { NextResponse } from "next/server";

import {
  extractInformation,
  InformationExtractionError,
} from "@/lib/upstage/information-extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
]);

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const fileValue = formData.get("file");

    if (!(fileValue instanceof File)) {
      return NextResponse.json(
        { error: "PDF 또는 이미지 파일을 선택해 주세요." },
        { status: 400 },
      );
    }

    if (!ALLOWED_MIME_TYPES.has(fileValue.type)) {
      return NextResponse.json(
        { error: "PDF, PNG, JPG, JPEG 파일만 업로드할 수 있습니다." },
        { status: 400 },
      );
    }

    if (fileValue.size === 0) {
      return NextResponse.json(
        { error: "빈 파일은 업로드할 수 없습니다." },
        { status: 400 },
      );
    }

    if (fileValue.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "파일 크기는 50MB 이하여야 합니다." },
        { status: 413 },
      );
    }

    const result = await extractInformation(fileValue);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof InformationExtractionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: "거래내역을 구조화하는 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
