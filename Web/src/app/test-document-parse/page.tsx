"use client";

import { useState } from "react";

export default function TestDocumentParsePage() {
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setError("파일을 선택해 주세요.");
      setResult(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/document-parse", {
        method: "POST",
        body: formData,
      });

      const data: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : "Document parse request failed";

        setError(message);
        return;
      }

      setResult(data);
    } catch {
      setError("요청 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-full bg-zinc-50 px-6 py-12 font-sans dark:bg-black">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
            Document Parse 테스트
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            PDF 또는 이미지 파일을 업로드해 Upstage Document Parse API를
            테스트합니다.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="space-y-2">
            <label
              htmlFor="document-file"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              파일 선택
            </label>
            <input
              id="document-file"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setError(null);
                setResult(null);
              }}
              className="block w-full text-sm text-zinc-700 file:mr-4 file:rounded-full file:border-0 file:bg-zinc-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-zinc-800 hover:file:bg-zinc-200 dark:text-zinc-300 dark:file:bg-zinc-800 dark:file:text-zinc-100 dark:hover:file:bg-zinc-700"
            />
            {file ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                선택된 파일: {file.name}
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={isLoading || !file}
            className="rounded-full bg-black px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-400"
          >
            {isLoading ? "분석 중..." : "Document Parse 테스트"}
          </button>
        </form>

        {error ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-6 dark:border-red-900 dark:bg-red-950/40">
            <h2 className="mb-2 text-lg font-medium text-red-700 dark:text-red-300">
              오류
            </h2>
            <p className="text-red-600 dark:text-red-200">{error}</p>
          </section>
        ) : null}

        {result ? (
          <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="mb-4 text-lg font-medium text-black dark:text-zinc-50">
              응답 JSON
            </h2>
            <pre className="overflow-x-auto rounded-xl bg-zinc-100 p-4 text-sm leading-6 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
              {JSON.stringify(result, null, 2)}
            </pre>
          </section>
        ) : null}
      </main>
    </div>
  );
}
