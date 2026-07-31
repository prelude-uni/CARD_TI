import Link from "next/link";
import { notFound } from "next/navigation";

import { supabaseAdmin } from "@/utils/supabase/server-admin";

export const dynamic = "force-dynamic";

const BUCKET_NAME = "card-ti-share-images";
const SIGNED_URL_EXPIRES_SECONDS = 60 * 60;

type SharePageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ShareResultPage({
  params,
}: SharePageProps) {
  const { id } = await params;

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  ) {
    notFound();
  }

  const { data: result, error } =
    await supabaseAdmin
      .from("shared_results")
      .select(
        `
          id,
          card_ti_type,
          card_ti_name,
          image_path,
          created_at,
          expires_at
        `,
      )
      .eq("id", id)
      .maybeSingle();

  if (error || !result) {
    notFound();
  }

  const expiresAt = new Date(result.expires_at);

  if (
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt.getTime() <= Date.now()
  ) {
    return (
      <main className="min-h-screen bg-[#f5f7fb] px-5 py-16">
        <section className="mx-auto max-w-xl rounded-3xl border border-[#e2e7f0] bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-[#252b38]">
            공유 기간이 만료됐어요
          </h1>

          <p className="mt-3 text-sm leading-6 text-[#737b8d]">
            이 CARD-TI 결과는 더 이상 확인할 수 없습니다.
          </p>

          <Link
            href="/test-information-extract"
            className="mt-7 inline-flex rounded-xl bg-[#4565ed] px-5 py-3 font-semibold text-white"
          >
            나도 CARD-TI 분석하기
          </Link>
        </section>
      </main>
    );
  }

  const { data: signedUrlData, error: signedUrlError } =
    await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .createSignedUrl(
        result.image_path,
        SIGNED_URL_EXPIRES_SECONDS,
      );

  if (signedUrlError || !signedUrlData?.signedUrl) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-5 py-10 sm:py-16">
      <section className="mx-auto max-w-2xl">
        <header className="mb-6 text-center">
          <p className="text-sm font-semibold text-[#4565ed]">
            CARD-TI 소비 유형 결과
          </p>

          <h1 className="mt-2 text-3xl font-black text-[#252b38]">
            {result.card_ti_type} · {result.card_ti_name}
          </h1>
        </header>

        <div className="overflow-hidden rounded-3xl border border-[#e2e7f0] bg-white p-3 shadow-[0_18px_55px_rgba(38,51,94,0.10)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={signedUrlData.signedUrl}
            alt={`${result.card_ti_type} ${result.card_ti_name} CARD-TI 결과`}
            className="h-auto w-full rounded-2xl"
          />
        </div>

        <p className="mt-4 text-center text-xs text-[#8b93a4]">
          공유 결과는 생성일로부터 30일 동안 확인할 수 있습니다.
        </p>

        <div className="mt-7 flex justify-center">
          <Link
            href="/test-information-extract"
            className="rounded-xl bg-[#4565ed] px-6 py-3 font-semibold text-white"
          >
            나도 CARD-TI 분석하기
          </Link>
        </div>
      </section>
    </main>
  );
}