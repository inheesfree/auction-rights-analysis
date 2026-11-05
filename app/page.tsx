import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-4 py-16">
      <header className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight">공매 재산 권리분석 모델 서비스</h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          공매 재산에 설정된 권리의 순위를 판단하고, 그 근거를 함께 보여줍니다.
        </p>
        <p className="rounded border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          참고용이며 법적 효력이 없습니다. 입력한 내용은 서버에 저장하지 않습니다.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/officer"
          className="space-y-2 rounded border border-zinc-300 p-5 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          <h2 className="text-xl font-semibold">담당자용 권리분석</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            채권을 입력하고 매각대금을 넣으면 순위, 배분액, 예상 회수액과 그 근거를 보여줍니다.
          </p>
        </Link>
        <Link
          href="/statement"
          className="space-y-2 rounded border border-zinc-300 p-5 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          <h2 className="text-xl font-semibold">공매재산명세서 권리분석</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            명세서의 권리를 입력하면 권리 순위와 매수인이 인수할 수 있는 임차보증금을 알려줍니다.
          </p>
        </Link>
      </div>
    </main>
  );
}
