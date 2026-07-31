import { NextResponse } from "next/server";

import {
  UpstageDocumentParseError,
  parseDocument,
} from "@/lib/upstage/document-parse";

export const runtime = "nodejs";

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
]);

const ALLOWED_EXTENSIONS = new Set([".pdf", ".png", ".jpg", ".jpeg"]);

function getFileExtension(filename: string): string {
  const lastDotIndex = filename.lastIndexOf(".");

  if (lastDotIndex === -1) {
    return "";
  }

  return filename.slice(lastDotIndex).toLowerCase();
}

function isAllowedFile(file: File): boolean {
  const extension = getFileExtension(file.name);
  const hasAllowedExtension = ALLOWED_EXTENSIONS.has(extension);
  const hasAllowedMimeType =
    file.type.length > 0 && ALLOWED_MIME_TYPES.has(file.type);

  return hasAllowedExtension || hasAllowedMimeType;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    if (!isAllowedFile(file)) {
      return NextResponse.json(
        { error: "Only PDF, PNG, JPG, and JPEG files are allowed" },
        { status: 400 },
      );
    }

    const result = await parseDocument(file);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UpstageDocumentParseError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }

    return NextResponse.json(
      { error: "Failed to parse document" },
      { status: 500 },
    );
  }
}
