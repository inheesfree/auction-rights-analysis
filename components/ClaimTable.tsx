// Design Ref: §2.2 ③, §2.4 — 확인 표. 담당자용·외부 사용자용이 같이 쓰는 부품이다.
// Plan SC: 작업 3 — 빈칸은 추측해서 채우지 않고 눈에 띄게 표시한다.

import { toClaimRow, type Cell } from "@/lib/claimForm";
import { RIGHT_KIND_LABELS, type SupportedClaim } from "@/lib/types";

/** 표의 한 칸. 빈칸이면 붉게 강조한다. */
function CellText({ cell }: { cell: Cell }) {
  if (cell.blank) {
    return (
      <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
        {cell.text}
      </span>
    );
  }
  return <span>{cell.text}</span>;
}

/** 여러 칸을 줄바꿈해서 보여준다. 칸이 없으면 "—". */
function CellList({ cells }: { cells: Cell[] }) {
  if (cells.length === 0) return <span className="text-zinc-400">—</span>;
  return (
    <ul className="space-y-1">
      {cells.map((cell, index) => (
        <li key={index}>
          <CellText cell={cell} />
        </li>
      ))}
    </ul>
  );
}

interface ClaimTableProps {
  claims: SupportedClaim[];
  /** 주면 줄마다 삭제 버튼이 나타난다. */
  onRemove?: (id: string) => void;
}

export default function ClaimTable({ claims, onRemove }: ClaimTableProps) {
  if (claims.length === 0) {
    return (
      <p className="rounded border border-dashed border-zinc-300 p-6 text-center text-zinc-500 dark:border-zinc-700">
        아직 입력한 채권이 없습니다. 위에서 권리를 골라 입력해 주세요.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
            <th className="px-3 py-2 font-semibold">권리 종류</th>
            <th className="px-3 py-2 font-semibold">채권자</th>
            <th className="px-3 py-2 font-semibold">기준일</th>
            <th className="px-3 py-2 font-semibold">채권액</th>
            <th className="px-3 py-2 font-semibold">접수번호</th>
            <th className="px-3 py-2 font-semibold">그 밖의 정보</th>
            <th className="px-3 py-2 font-semibold">원본 위치</th>
            {onRemove ? <th className="px-3 py-2" /> : null}
          </tr>
        </thead>
        <tbody>
          {claims.map((claim) => {
            const row = toClaimRow(claim);
            return (
              <tr key={row.id} className="border-b border-zinc-200 align-top dark:border-zinc-800">
                <td className="px-3 py-2 font-medium">{RIGHT_KIND_LABELS[row.kind]}</td>
                <td className="px-3 py-2">
                  <CellText cell={row.creditor} />
                </td>
                <td className="px-3 py-2">
                  <CellList cells={row.baseDates} />
                </td>
                <td className="px-3 py-2">
                  <CellText cell={row.amount} />
                </td>
                <td className="px-3 py-2">
                  {row.registrationNumber ? (
                    <CellText cell={row.registrationNumber} />
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <CellList cells={row.notes} />
                </td>
                {/* 직접 입력한 값이므로 원본 문서 위치가 없다. 파일에서 읽는 기능(작업 17~19)이 생기면 위치가 들어간다. */}
                <td className="px-3 py-2 text-zinc-500">직접 입력</td>
                {onRemove ? (
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => onRemove(row.id)}
                      className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    >
                      삭제
                    </button>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
