// Design Ref: §2.2 ⑤ — 배분표 (채권별 배분액, 합계 = 매각대금)
// Plan SC: 작업 13 — 계산 결과의 숫자를 그대로 보여준다 (여기서 다시 계산하지 않는다)

import type { DistributionSuccess } from "@/lib/distribute";
import { formatWon, sumWon } from "@/lib/money";

interface Row {
  group: string;
  label: string;
  claimed: number;
  paid: number;
  notes: string[];
}

export default function DistributionTable({ result }: { result: DistributionSuccess }) {
  const rows: Row[] = [
    ...result.superPriority.map((line) => ({
      group: "먼저 배분",
      label: line.label,
      claimed: line.entitled,
      paid: line.paid,
      notes: line.notes,
    })),
    ...result.lines.map((line) => ({
      group: `${line.rank}순위`,
      label: line.label,
      claimed: line.claimed,
      paid: line.paid,
      notes: line.notes,
    })),
  ];
  const paidTotal = sumWon([...result.superPriority.map((l) => l.paid), ...result.lines.map((l) => l.paid)]);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
              <th className="px-3 py-2 font-semibold">순서</th>
              <th className="px-3 py-2 font-semibold">채권</th>
              <th className="px-3 py-2 text-right font-semibold">청구액</th>
              <th className="px-3 py-2 text-right font-semibold">배분액</th>
              <th className="px-3 py-2 text-right font-semibold">미배분액</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const unpaid = row.claimed - row.paid;
              return (
                <tr key={index} className="border-b border-zinc-200 align-top dark:border-zinc-800">
                  <td className="whitespace-nowrap px-3 py-2 font-medium">{row.group}</td>
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
                  <td className="whitespace-nowrap px-3 py-2 text-right font-semibold">{formatWon(row.paid)}</td>
                  <td
                    className={`whitespace-nowrap px-3 py-2 text-right ${unpaid > 0 ? "text-amber-700 dark:text-amber-300" : "text-zinc-400"}`}
                  >
                    {formatWon(unpaid)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-zinc-300 dark:border-zinc-700">
              <td className="px-3 py-2 font-semibold" colSpan={3}>
                배분액 합계
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right font-semibold">{formatWon(paidTotal)}</td>
              <td />
            </tr>
            <tr>
              <td className="px-3 py-2" colSpan={3}>
                남은 금액 (모든 채권에 배분하고 남은 돈)
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right">{formatWon(result.leftover)}</td>
              <td />
            </tr>
            <tr className="border-t border-zinc-300 dark:border-zinc-700">
              <td className="px-3 py-2 font-semibold" colSpan={3}>
                매각대금
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right font-semibold">{formatWon(result.saleProceeds)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {result.rule5Transfers.length > 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          ※ 순위 번호는 규칙 5 조정 전(당해세 우선) 기준입니다. 조정 결과는 배분액에 이미 반영되어 있습니다.
        </p>
      ) : null}
    </div>
  );
}
