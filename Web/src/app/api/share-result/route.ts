import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function sanitizePathPart(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const image = formData.get("image");
    const rawCardTiType = formData.get("cardTiType");

    if (!(image instanceof File)) {
      return NextResponse.json(
        { error: "공유할 이미지 파일이 없습니다." },
        { status: 400 },
      );
    }

    if (!image.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "이미지 파일만 공유할 수 있습니다." },
        { status: 400 },
      );
    }

    const cardTiType = sanitizePathPart(
      typeof rawCardTiType === "string" ? rawCardTiType : "result",
    );

    const blob = await put(
      `card-ti-results/${cardTiType || "result"}.png`,
      image,
      {
        access: "public",
        addRandomSuffix: true,
        contentType: image.type || "image/png",
      },
    );

    return NextResponse.json({
      shareUrl: blob.url,
    });
  } catch (error) {
    console.error("Failed to create CARD-TI share link:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "공유 링크를 만들지 못했습니다.",
      },
      { status: 500 },
    );
  }
}
