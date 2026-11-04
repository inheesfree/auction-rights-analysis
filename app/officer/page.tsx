import type { Metadata } from "next";
import ClaimEditor from "@/components/ClaimEditor";

export const metadata: Metadata = {
  title: "담당자용 권리분석",
};

export default function OfficerPage() {
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">담당자용 권리분석</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          채권자 정보를 직접 입력하고 확인합니다. 순위 분석과 배분 계산은 이후 단계에서 붙습니다.
        </p>
        <p className="rounded border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          참고용이며 법적 효력이 없습니다. 이번 시험에서는 실제 업무 자료를 넣지 말고 가상 데이터만 입력하세요.
        </p>
      </header>
      <ClaimEditor />
    </main>
  );
}
