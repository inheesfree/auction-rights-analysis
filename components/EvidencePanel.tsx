// Design Ref: §2.2 ⑥ — 분석 근거 (판단마다 비교한 기준일 · 적용 규칙 · 법령 · 결과)
// Plan SC: 작업 13 — 모든 순위 판단에 근거를 함께 보여준다 (lib/evidence.ts의 글을 그대로 보여준다)

import type { Evidence } from "@/lib/evidence";

export default function EvidencePanel({ evidence, showProcess = true }: { evidence: Evidence; showProcess?: boolean }) {
  return (
    <div className="space-y-5">
      <div className={showProcess ? "space-y-3" : "hidden"}>
        <h3 className="text-base font-semibold">배분 과정</h3>
        {evidence.steps.map((step, index) => (
          <div key={index} className="space-y-1">
            <p className="text-sm font-medium">■ {step.title}</p>
            <ul className="space-y-1 pl-4 text-sm">
              {step.items.map((item, i) => (
                <li key={i} className="list-disc">
                  {item.text}
                  {item.notes.length > 0 ? (
                    <ul className="mt-0.5 space-y-0.5 pl-4 text-xs text-zinc-500 dark:text-zinc-400">
                      {item.notes.map((note, j) => (
                        <li key={j} className="list-[circle]">
                          {note}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <details className="rounded border border-zinc-300 p-3 dark:border-zinc-700" open>
        <summary className="cursor-pointer text-base font-semibold">
          순위 판단 근거 {evidence.judgments.length}건
          {evidence.unverifiedCount > 0 ? (
            <span className="ml-2 text-sm font-normal text-amber-700 dark:text-amber-300">
              (법적 근거 미확인 {evidence.unverifiedCount}건)
            </span>
          ) : null}
        </summary>
        <ol className="mt-3 space-y-3">
          {evidence.judgments.map((j, index) => (
            <li key={index} className="space-y-1 rounded bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
              <p className="font-medium">
                {index + 1}. {j.heading}
                {j.legalBasisUnverified ? (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    법적 근거 미확인 (담당자 업무 기준)
                  </span>
                ) : null}
              </p>
              <p className="text-zinc-600 dark:text-zinc-400">비교 대상: {j.pair}</p>
              {j.comparedDates.map((d, i) => (
                <p key={i} className="text-zinc-600 dark:text-zinc-400">
                  비교한 기준일: {d}
                </p>
              ))}
              <p>결과: {j.outcome}</p>
              {j.law ? <p className="text-zinc-600 dark:text-zinc-400">적용 법령: {j.law}</p> : null}
              <p>이유: {j.reason}</p>
            </li>
          ))}
        </ol>
      </details>

      {showProcess ? (
        <>
          <p className="text-sm font-medium">{evidence.verification}</p>
          <ul className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
            {evidence.notices.map((notice, index) => (
              <li key={index}>※ {notice}</li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
