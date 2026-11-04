// Design Ref: §2.4 — 다루지 않는 경우 안내(노란 안내 상자), §3 ④ 입력값 검사 결과
// Plan SC: 작업 4 — 문제가 있으면 계산을 막고, 어떤 채권의 무엇이 문제인지 이유를 보여준다.

import type { Issue, ValidationResult } from "@/lib/validate";

/** 채권별로 문제를 묶는다. 순서는 입력한 순서를 따른다. */
function groupByClaim(issues: Issue[]): { label: string; messages: string[] }[] {
  const groups = new Map<string, { label: string; messages: string[] }>();
  for (const issue of issues) {
    const key = issue.claimId ?? "all";
    const group = groups.get(key) ?? { label: issue.claimLabel, messages: [] };
    group.messages.push(issue.message);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export default function ValidationPanel({ result }: { result: ValidationResult }) {
  const others = result.issues.filter((issue) => issue.kind !== "unsupported");

  if (result.canCalculate) {
    return (
      <p className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-700 dark:bg-green-950 dark:text-green-200">
        입력에 문제가 없습니다. (순위 분석과 배분 계산은 이후 단계에서 붙습니다.)
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">아직 계산할 수 없습니다. 아래를 확인해 주세요.</p>

      {result.unsupported.length > 0 ? (
        <div
          role="alert"
          className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
        >
          <p className="font-semibold">이 앱이 다루지 않는 경우</p>
          <ul className="list-disc space-y-1 pl-5">
            {groupByClaim(result.unsupported).map((group) => (
              <li key={group.label}>
                <span className="font-medium">{group.label}</span>: {group.messages.join(" ")}
              </li>
            ))}
          </ul>
          <p>이 앱은 해당 권리를 계산하지 않습니다. 입력에서 지우거나 담당자가 별도로 처리해 주세요.</p>
        </div>
      ) : null}

      {others.length > 0 ? (
        <div className="space-y-2 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
          <p className="font-semibold">고쳐야 할 입력</p>
          <ul className="list-disc space-y-1 pl-5">
            {groupByClaim(others).map((group) => (
              <li key={group.label}>
                <span className="font-medium">{group.label}</span>: {group.messages.join(" ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
