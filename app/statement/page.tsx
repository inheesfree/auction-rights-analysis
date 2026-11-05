import type { Metadata } from "next";
import StatementEditor from "@/components/StatementEditor";

export const metadata: Metadata = {
  title: "공매재산명세서 권리분석",
};

export default function StatementPage() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">공매재산명세서 권리분석</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          공매재산명세서에 적힌 권리를 입력하면 권리 순위와 그 근거, 매수인이 인수할 수 있는 임차보증금을 알려줍니다.
          매각금액을 모르므로 금액은 계산하지 않고 순위만 보여줍니다.
        </p>
        <p className="rounded border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          참고용이며 법적 효력이 없습니다. 입력한 내용은 서버에 저장하지 않으며, 이름은 가려서 보여줍니다.
        </p>
      </header>
      <StatementEditor />
    </main>
  );
}
