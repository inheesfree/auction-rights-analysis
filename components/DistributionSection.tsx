"use client";

// Design Ref: §2.2 ④⑤⑥ — 금액 입력 → 배분 결과(배분표) → 분석 근거
// Plan SC: 작업 13 — 담당자용 결과 화면: 수임 시 판단(예상 회수액)과 배분계산서 작성(배분표)
//
// 계산은 lib/distribute.ts가 한다. 이 화면은 매각대금을 받아 결과와 근거를 보여주기만 한다.
// 입력값 검사를 통과한 채권만 계산한다 (ClaimEditor가 검사 결과를 넘겨 준다).

import { useId, useMemo, useState } from "react";
import DistributionTable from "@/components/DistributionTable";
import EvidencePanel from "@/components/EvidencePanel";
import { claimLabel } from "@/lib/claimLabel";
import { distribute, type DistributionResult } from "@/lib/distribute";
import { buildEvidence } from "@/lib/evidence";
import { formatWon, parseWon } from "@/lib/money";
import type { Claim } from "@/lib/types";
import type { ValidationResult } from "@/lib/validate";

type Mode = "entrust" | "final";

const STOP_TITLES: Record<Extract<DistributionResult, { ok: false }>["reason"], string> = {
  unsupported: "이 앱이 다루지 않는 경우",
  undetermined: "담당자 기준이 정해지지 않은 경우",
  cycle: "이 앱이 다루지 않는 순환",
  mismatch: "계산 검증에 실패했습니다",
};

/** 계산 결과 또는 계산하지 못한 이유. */
type Outcome = { kind: "result"; result: DistributionResult } | { kind: "error"; message: string };

function calculate(saleProceeds: number, claims: readonly Claim[]): Outcome {
  try {
    return { kind: "result", result: distribute(saleProceeds, claims) };
  } catch (error) {
    // 입력값 검사를 통과했다면 일어나지 않아야 한다. 일어나면 숫자를 내지 않고 이유를 알린다.
    return { kind: "error", message: error instanceof Error ? error.message : "알 수 없는 오류" };
  }
}

export default function DistributionSection({
  claims,
  validation,
}: {
  claims: Claim[];
  validation: ValidationResult;
}) {
  const formId = useId();
  const [mode, setMode] = useState<Mode>("entrust");
  const [saleText, setSaleText] = useState("");
  const sale = parseWon(saleText);

  const outcome = useMemo<Outcome | null>(
    () => (validation.canCalculate && sale !== null ? calculate(sale, claims) : null),
    [validation.canCalculate, sale, claims],
  );

  const isEntrust = mode === "entrust";
  const saleLabel = isEntrust ? "예상 매각대금" : "매각대금";

  return (
    <div className="space-y-8">
      <section aria-labelledby="sale-heading" className="space-y-3">
        <h2 id="sale-heading" className="text-xl font-semibold">
          ④ 금액 입력
        </h2>
        <fieldset className="flex flex-wrap gap-4 text-sm">
          <legend className="mb-1 font-medium">작업 선택</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name={`${formId}-mode`} checked={isEntrust} onChange={() => setMode("entrust")} />
            수임 시 공매 진행 여부 판단
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name={`${formId}-mode`} checked={!isEntrust} onChange={() => setMode("final")} />
            공매 완료 후 배분계산서 작성
          </label>
        </fieldset>
        <div className="max-w-sm">
          <label htmlFor={`${formId}-sale`} className="mb-1 block text-sm font-medium">
            {saleLabel}
          </label>
          <input
            id={`${formId}-sale`}
            type="text"
            inputMode="numeric"
            className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            placeholder={isEntrust ? "담당자가 직접 입력합니다. 예: 250,000,000" : "예: 250,000,000"}
            value={saleText}
            onChange={(event) => setSaleText(event.target.value)}
          />
          {saleText.trim() !== "" && sale === null ? (
            <p className="mt-1 text-sm text-red-700 dark:text-red-300">
              금액을 읽지 못했습니다. 숫자만 입력해 주세요. (예: 250,000,000)
            </p>
          ) : null}
        </div>
      </section>

      {!validation.canCalculate ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">③ 입력값 검사를 통과해야 계산할 수 있습니다.</p>
      ) : outcome === null ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{saleLabel}을 입력하면 결과가 나옵니다.</p>
      ) : (
        <Result outcome={outcome} claims={claims} isEntrust={isEntrust} />
      )}
    </div>
  );
}

function Result({ outcome, claims, isEntrust }: { outcome: Outcome; claims: Claim[]; isEntrust: boolean }) {
  if (outcome.kind === "error") {
    return (
      <section aria-labelledby="result-heading" className="space-y-3">
        <h2 id="result-heading" className="text-xl font-semibold">
          ⑤ 결과
        </h2>
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
          계산하지 못했습니다: {outcome.message}
        </p>
      </section>
    );
  }

  const result = outcome.result;
  if (!result.ok) {
    return (
      <section aria-labelledby="result-heading" className="space-y-3">
        <h2 id="result-heading" className="text-xl font-semibold">
          ⑤ 결과
        </h2>
        <div role="alert" className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-semibold">{STOP_TITLES[result.reason]}</p>
          <ul className="list-disc space-y-1 pl-5">
            {result.messages.map((message, index) => (
              <li key={index}>{message}</li>
            ))}
          </ul>
          <p>이 경우는 이 앱이 계산하지 않습니다. 담당자가 별도로 처리해 주세요.</p>
        </div>
      </section>
    );
  }

  const evidence = buildEvidence(result);
  const entrusted = claims.filter((claim) => claim.isEntrusted);

  return (
    <>
      <section aria-labelledby="result-heading" className="space-y-4">
        <h2 id="result-heading" className="text-xl font-semibold">
          ⑤ 결과
        </h2>
        {isEntrust ? <Recovery entrusted={entrusted} paidByClaim={result.paidByClaim} /> : null}
        <DistributionTable result={result} />
        <p className="rounded border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          참고용이며 법적 효력이 없습니다.
        </p>
      </section>

      <section aria-labelledby="evidence-heading" className="space-y-3">
        <h2 id="evidence-heading" className="text-xl font-semibold">
          ⑥ 분석 근거
        </h2>
        <EvidencePanel evidence={evidence} />
      </section>
    </>
  );
}

/** 수임 시 판단: 수임 채권(우리가 맡은 체납세금)의 예상 회수액. */
function Recovery({ entrusted, paidByClaim }: { entrusted: Claim[]; paidByClaim: Record<string, number> }) {
  if (entrusted.length === 0) {
    return (
      <p className="rounded border border-zinc-300 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900">
        수임 채권(우리가 맡은 체납세금)으로 표시한 채권이 없어 예상 회수액을 계산할 수 없습니다. 채권을 입력할 때 &quot;수임 채권&quot;을 체크해 주세요.
      </p>
    );
  }
  const rows = entrusted.map((claim) => ({
    id: claim.id,
    label: claimLabel(claim),
    claimed: claim.amount ?? 0,
    paid: paidByClaim[claim.id] ?? 0,
  }));
  const paidTotal = rows.reduce((sum, row) => sum + row.paid, 0);
  const claimedTotal = rows.reduce((sum, row) => sum + row.claimed, 0);

  return (
    <div className="space-y-2 rounded border border-green-300 bg-green-50 p-4 dark:border-green-700 dark:bg-green-950">
      <p className="text-sm font-medium text-green-900 dark:text-green-200">예상 회수액 (수임 채권) — 공매 진행 여부 판단 참고</p>
      <p className="text-2xl font-bold text-green-900 dark:text-green-100">{formatWon(paidTotal)}</p>
      <p className="text-sm text-green-900 dark:text-green-200">수임 채권 청구액 합계 {formatWon(claimedTotal)}</p>
      <ul className="list-disc space-y-0.5 pl-5 text-sm text-green-900 dark:text-green-200">
        {rows.map((row) => (
          <li key={row.id}>
            {row.label}: 청구 {formatWon(row.claimed)} → 예상 {formatWon(row.paid)}
          </li>
        ))}
      </ul>
    </div>
  );
}
