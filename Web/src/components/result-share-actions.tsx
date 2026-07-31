"use client";

import NextImage from "next/image";

import { useEffect, useState } from "react";

import type { CardTiAxisResult } from "@/lib/card-ti-scoring";
import type { PeerCategoryComparison } from "@/lib/peer-spending";

type Props = {
  cardTiType: string;
  profileName: string;
  profileDescription: string;
  billingMonth: string;
  ageLabel: string;
  ie: CardTiAxisResult;
  vr: CardTiAxisResult;
  nw: CardTiAxisResult;
  categories: PeerCategoryComparison[];
};

type ShareAxis = {
  title: string;
  left: string;
  right: string;
  result: CardTiAxisResult;
};

const WIDTH = 1080;
const HEIGHT = 1350;
const TYPE_IMAGE_SIZE = 360;

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function drawTextLines(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 3,
): number {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (context.measureText(next).width <= maxWidth) {
      current = next;
      continue;
    }

    if (current) lines.push(current);
    current = word;
    if (lines.length >= maxLines - 1) break;
  }

  if (current && lines.length < maxLines) lines.push(current);

  lines.forEach((line, index) => {
    const isLast = index === maxLines - 1 && words.join(" ") !== lines.join(" ");
    context.fillText(isLast ? `${line.replace(/…$/, "")}…` : line, x, y + index * lineHeight);
  });

  return y + lines.length * lineHeight;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("유형 이미지를 불러오지 못했습니다."));
    image.src = src;
  });
}

function drawContainedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  context.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("이미지 파일을 생성하지 못했습니다."));
      },
      "image/png",
      1,
    );
  });
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function getSelectedPercent(result: CardTiAxisResult): number {
  return result.letter === "I" || result.letter === "V" || result.letter === "N"
    ? result.negativePercent
    : result.positivePercent;
}

function getIndexLabel(category: PeerCategoryComparison): string {
  if (category.spendingIndex === null) {
    return "또래 비교 제외";
  }

  return `소비지수 ${Math.round(category.spendingIndex)}`;
}

async function createResultImage({
  cardTiType,
  profileName,
  profileDescription,
  billingMonth,
  ageLabel,
  ie,
  vr,
  nw,
  categories,
}: Props): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("이미지 생성 기능을 사용할 수 없습니다.");
  }

  context.fillStyle = "#f7f8fc";
  context.fillRect(0, 0, WIDTH, HEIGHT);

  roundedRect(context, 54, 52, 972, 440, 42);
  context.fillStyle = "#4964e8";
  context.fill();

  context.fillStyle = "rgba(255,255,255,0.10)";
  context.beginPath();
  context.arc(920, 90, 190, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "rgba(255,255,255,0.72)";
  context.font = "700 28px Arial, sans-serif";
  context.fillText("나의 소비 MBTI", 100, 116);

  context.fillStyle = "#ffffff";
  context.font = "800 64px Arial, sans-serif";
  context.fillText(profileName, 100, 196);
  context.font = "800 52px Arial, sans-serif";
  context.fillText(cardTiType, 100, 260);

  context.fillStyle = "rgba(255,255,255,0.78)";
  context.font = "500 24px Arial, sans-serif";
  drawTextLines(context, profileDescription, 100, 314, 500, 36, 3);

  try {
    const typeImage = await loadImage(`/card-ti-types/${cardTiType}.png`);
    drawContainedImage(context, typeImage, 650, 102, TYPE_IMAGE_SIZE, 320);
  } catch {
    // 이미지가 실패해도 텍스트 결과 이미지는 저장할 수 있게 유지합니다.
  }

  roundedRect(context, 54, 520, 972, 278, 34);
  context.fillStyle = "#ffffff";
  context.fill();

  context.fillStyle = "#202637";
  context.font = "800 32px Arial, sans-serif";
  context.fillText("3가지 소비 성향", 94, 574);

  const axes: ShareAxis[] = [
    { title: "소비 관계", left: "I 혼자", right: "E 함께", result: ie },
    { title: "소비 채널", left: "V 오프라인", right: "R 온라인", result: vr },
    { title: "소비 목적", left: "N 필수", right: "W 기호", result: nw },
  ];

  axes.forEach((axis, index) => {
    const top = 610 + index * 58;
    const selectedPercent = getSelectedPercent(axis.result);

    context.fillStyle = "#697184";
    context.font = "700 20px Arial, sans-serif";
    context.fillText(axis.title, 94, top + 18);

    roundedRect(context, 270, top, 560, 22, 11);
    context.fillStyle = "#e8ebf3";
    context.fill();

    roundedRect(context, 270, top, Math.max(22, 560 * (selectedPercent / 100)), 22, 11);
    context.fillStyle = "#4964e8";
    context.fill();

    context.fillStyle = "#202637";
    context.font = "700 20px Arial, sans-serif";
    context.fillText(`${axis.result.letter} ${formatPercent(selectedPercent)}`, 854, top + 18);
  });

  roundedRect(context, 54, 826, 972, 384, 34);
  context.fillStyle = "#ffffff";
  context.fill();

  context.fillStyle = "#202637";
  context.font = "800 32px Arial, sans-serif";
  context.fillText("내 소비 분석", 94, 882);

  const topCategories = [...categories]
    .sort((a, b) => b.userAmount - a.userAmount)
    .slice(0, 4);

  topCategories.forEach((category, index) => {
    const top = 920 + index * 64;
    const badgeX = 94;

    context.beginPath();
    context.arc(badgeX + 18, top + 18, 18, 0, Math.PI * 2);
    context.fillStyle = index === 0 ? "#4964e8" : "#dfe5ff";
    context.fill();

    context.fillStyle = index === 0 ? "#ffffff" : "#4964e8";
    context.font = "800 18px Arial, sans-serif";
    context.textAlign = "center";
    context.fillText(String(index + 1), badgeX + 18, top + 24);
    context.textAlign = "left";

    context.fillStyle = "#303747";
    context.font = "700 23px Arial, sans-serif";
    context.fillText(category.categoryName, 142, top + 23);

    context.fillStyle = "#697184";
    context.font = "600 20px Arial, sans-serif";
    context.fillText(`내 소비 ${formatPercent(category.userRatio * 100)}`, 515, top + 23);

    context.fillStyle = category.spendingIndex === null ? "#9aa2b2" : "#4964e8";
    context.font = "700 20px Arial, sans-serif";
    context.fillText(getIndexLabel(category), 760, top + 23);
  });

  context.fillStyle = "#8a93a5";
  context.font = "500 20px Arial, sans-serif";
  context.fillText(
    [billingMonth, ageLabel].filter(Boolean).join(" · ") || "CARD-TI 소비 분석",
    64,
    1284,
  );

  context.fillStyle = "#4964e8";
  context.font = "800 25px Arial, sans-serif";
  context.textAlign = "right";
  context.fillText("CARD-TI", 1016, 1284);
  context.textAlign = "left";

  return canvasToBlob(canvas);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
      <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
      <path d="M5 19h14" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" />
    </svg>
  );
}

async function createShareLink(
  imageBlob: Blob,
  cardTiType: string,
  cardTiName: string,
): Promise<string> {
  const formData = new FormData();

  formData.append(
    "image",
    imageBlob,
    `CARD-TI-${cardTiType}.png`,
  );
  formData.append("cardTiType", cardTiType);
  formData.append("cardTiName", cardTiName);

  const response = await fetch("/api/share-result", {
    method: "POST",
    body: formData,
  });

  const result = (await response.json()) as {
    shareUrl?: string;
    error?: string;
  };

  if (!response.ok || !result.shareUrl) {
    throw new Error(
      result.error ?? "공유 링크를 만들지 못했습니다.",
    );
  }

  return result.shareUrl;
}

export function ResultShareActions(props: Props) {
  const [isSharing, setIsSharing] = useState(false);
  const [generatedShareUrl, setGeneratedShareUrl] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function updatePreview(blob: Blob) {
    const nextUrl = URL.createObjectURL(blob);
    setPreviewUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      return nextUrl;
    });
  }

  async function makeBlob(): Promise<Blob> {
    setIsWorking(true);
    setMessage(null);

    try {
      const blob = await createResultImage(props);
      updatePreview(blob);
      return blob;
    } finally {
      setIsWorking(false);
    }
  }

  async function handleDownload() {
    try {
      const blob = await makeBlob();
      downloadBlob(blob, `CARD-TI-${props.cardTiType}.png`);
      setMessage(
        "소비 분석 이미지를 저장했어요. 아래에서 미리보기도 확인할 수 있어요.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "이미지를 저장하지 못했어요.",
      );
    }
  }

  async function handleShare() {
    try {
      setIsSharing(true);
      setMessage("공유 이미지를 만들고 있어요.");

      const imageBlob = await makeBlob();

      const shareUrl = await createShareLink(
        imageBlob,
        props.cardTiType,
        props.profileName,
      );

      setGeneratedShareUrl(shareUrl);
      setMessage("공유 링크가 만들어졌어요.");

      if (typeof navigator.share === "function") {
        try {
          await navigator.share({
            title: `나의 CARD-TI는 ${props.cardTiType}`,
            text: `${props.profileName} 소비 유형 결과를 확인해 보세요.`,
            url: shareUrl,
          });

          setMessage("공유창을 열었어요.");
          return;
        } catch (error) {
          if (
            error instanceof DOMException &&
            error.name === "AbortError"
          ) {
            setMessage(
              "공유가 취소됐어요. 링크를 직접 복사할 수 있어요.",
            );
            return;
          }
        }
      }

      await navigator.clipboard.writeText(shareUrl);
      setMessage("공유 링크를 복사했어요.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "공유 링크를 만들지 못했습니다.",
      );
    } finally {
      setIsSharing(false);
    }
  }

  return (
    <section className="mt-6 rounded-[26px] border border-[#dfe5ff] bg-[#eef1ff] p-6">
      <div className="sm:flex sm:items-center sm:justify-between sm:gap-6">
        <div>
          <h2 className="text-lg font-bold text-[#252b38]">내 결과 공유하기</h2>
          <p className="mt-1 text-sm leading-6 text-[#687184]">
            모바일에서는 공유창을 열고, 지원하지 않는 브라우저에서는 PNG를 자동 저장합니다. 가맹점명과 개별 결제금액은 이미지에서 제외됩니다.
          </p>
          {message ? (
            <p className="mt-2 text-xs font-semibold text-[#4565ed]">{message}</p>
          ) : null}
        </div>
        <div className="mt-5 grid gap-3 sm:mt-0 sm:min-w-[360px] sm:grid-cols-2">
          <button
            type="button"
            onClick={handleDownload}
            disabled={isWorking || isSharing}
            className="flex items-center justify-center gap-2 rounded-2xl border border-[#cbd5ff] bg-white px-5 py-4 text-sm font-bold text-[#4565ed] transition hover:border-[#8ea2f7] disabled:cursor-wait disabled:opacity-60"
          >
            <DownloadIcon />
            {isWorking ? "이미지 생성 중" : "이미지 저장"}
          </button>
          <button
            type="button"
            onClick={handleShare}
            disabled={isWorking || isSharing}
            className="flex items-center justify-center gap-2 rounded-2xl bg-[#4565ed] px-5 py-4 text-sm font-bold text-white transition hover:bg-[#3858dc] disabled:cursor-wait disabled:opacity-60"
          >
            <ShareIcon />
            {isSharing
              ? "링크 생성 중"
              : isWorking
                ? "공유 준비 중"
                : "결과 링크 공유"}
          </button>
        </div>
      </div>

      {generatedShareUrl ? (
  <div className="mt-5 rounded-2xl border border-[#d9e0ff] bg-white p-4">
    <p className="text-sm font-bold text-[#303747]">
      생성된 공유 링크
    </p>

    <div className="mt-3 flex flex-col gap-3 sm:flex-row">
      <a
        href={generatedShareUrl}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 flex-1 break-all rounded-xl bg-[#f5f7ff] px-4 py-3 text-sm text-[#4565ed] underline"
      >
        {generatedShareUrl}
      </a>

      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(
              generatedShareUrl,
            );
            setMessage("공유 링크를 복사했어요.");
          } catch {
            setMessage(
              "링크를 복사하지 못했어요. 링크를 직접 선택해 주세요.",
            );
          }
        }}
        className="rounded-xl bg-[#4565ed] px-5 py-3 text-sm font-bold text-white"
      >
        링크 복사
      </button>
    </div>
  </div>
) : null}

      {previewUrl ? (
        <div className="mt-5 rounded-[22px] border border-[#d9e0ff] bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-[#303747]">생성된 공유 이미지 미리보기</p>
            <button
              type="button"
              onClick={() => setPreviewUrl(null)}
              className="rounded-full bg-[#f0f2f7] px-3 py-1.5 text-xs font-bold text-[#687184]"
            >
              닫기
            </button>
          </div>
          <NextImage
            src={previewUrl}
            alt="CARD-TI 공유 이미지 미리보기"
            width={WIDTH}
            height={HEIGHT}
            unoptimized
            className="mx-auto h-auto max-h-[620px] w-auto max-w-full rounded-2xl border border-[#edf0f5] object-contain"
          />
        </div>
      ) : null}
    </section>
  );
}
