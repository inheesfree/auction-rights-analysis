// Design Ref: §2.3 ④ — 권리 순위 (매각금액을 모르므로 금액은 계산하지 않는다)
// Plan SC: 작업 15 — 순위, 명세서에 적힌 채권액, 인수 대상, 순위 근거를 보여준다

import { formatWon } from "@/lib/money";
import type { StatementAnalysis } from "@/lib/statement";

type Ok = Extract<StatementAnalysis, { ok: true }>;

export default function StatementRanking({ analysis }: { analysis: Ok }) {
  return (
    <div className="space-y-6">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
              <th className="px-3 py-2 font-semibold">순서</th>
              <th className="px-3 py-2 font-semibold">권리</th>
              <th className="px-3 py-2 text-right font-semibold">명세서의 채권액</th>
            </tr>
          </thead>
          <tbody>
            {analysis.rows.map((row, index) => (
              <tr key={index} className="border-b border-zinc-200 align-top dark:border-zinc-800">
                <td className="whitespace-nowrap px-3 py-2 font-medium">{row.stage}</td>
                <td className="px-3 py-2">
                  <div>{row.label}</div>
                  {row.notes.length > 0 ? (
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-zinc-500 dark:text-zinc-400">
                      {row.notes.map((note, i) => (
                        <li key={i}>{note}</li>
                      ))}
                    </ul>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">{formatWon(row.claimed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {analysis.acquiringTenants.length > 0 ? (
        <div className="space-y-2 rounded border border-sky-300 bg-sky-50 p-4 text-sm text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200">
          <p className="font-medium">매수인이 인수할 수 있는 임차보증금 (대항력 있는 임차인)</p>
          <ul className="list-disc space-y-1 pl-5">
            {analysis.acquiringTenants.map((tenant) => (
              <li key={tenant.label}>
                {tenant.label}: 보증금 {formatWon(tenant.deposit)} 중 배분받지 못한 금액은 매수인이 인수합니다.
              </li>
            ))}
          </ul>
          <p className="text-xs">인수할 정확한 금액은 매각금액을 알아야 정해집니다. (보증금 전체 − 임차인이 배분받은 금액)</p>
        </div>
      ) : null}

      {analysis.excluded.length > 0 ? (
        <div className="space-y-1 rounded border border-zinc-300 p-3 text-sm dark:border-zinc-700">
          <p className="font-medium">순위 단계에서 배분하지 않는 채권</p>
          <ul className="list-disc space-y-1 pl-5">
            {analysis.excluded.map((item) => (
              <li key={item.label}>
                {item.label}: {item.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
