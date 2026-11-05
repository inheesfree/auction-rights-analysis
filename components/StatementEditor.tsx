"use client";

// Design Ref: §2.3 — 공매재산명세서 권리분석 (외부 사용자용)
// 직접 입력 → 읽은(입력한) 내용 확인 → 입력값 검사 → 권리 순위와 근거
// 매각금액을 모르므로 금액은 계산하지 않고 순위만 보여준다. 이름은 마스킹해서 보여준다.
// 서류(PDF·이미지)에서 값을 읽는 기능은 작업 17~19에서 붙인다.

import { useMemo, useRef, useState } from "react";
import ClaimForm from "@/components/ClaimForm";
import ClaimTable from "@/components/ClaimTable";
import EvidencePanel from "@/components/EvidencePanel";
import StatementRanking from "@/components/StatementRanking";
import ValidationPanel from "@/components/ValidationPanel";
import { buildClaim, type FormValues } from "@/lib/claimForm";
import { maskClaim } from "@/lib/privacy";
import { analyzeStatement, type StatementAnalysis } from "@/lib/statement";
import type { Claim, RightKind } from "@/lib/types";
import { validateClaims } from "@/lib/validate";

type Outcome = { kind: "analysis"; analysis: StatementAnalysis } | { kind: "error"; message: string };

function analyze(claims: readonly Claim[]): Outcome {
  try {
    return { kind: "analysis", analysis: analyzeStatement(claims) };
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : "알 수 없는 오류" };
  }
}

export default function StatementEditor() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [notice, setNotice] = useState<string[]>([]);
  const nextId = useRef(1);
  const validation = validateClaims(claims);
  // 화면에는 이름을 가린 채권을 보여준다. 입력한 원래 값은 이 화면 안에만 있고 서버로 보내거나 저장하지 않는다.
  const shown = useMemo(() => claims.map(maskClaim), [claims]);
  const outcome = useMemo<Outcome | null>(
    () => (validation.canCalculate ? analyze(claims) : null),
    [validation.canCalculate, claims],
  );

  const handleAdd = (kind: RightKind, values: FormValues, taxItems: FormValues[]) => {
    const id = `claim-${nextId.current++}`;
    const { claim, unreadable } = buildClaim(id, kind, values, taxItems, false);
    setClaims((prev) => [...prev, claim]);
    setNotice(unreadable);
  };

  return (
    <div className="space-y-8">
      <section aria-labelledby="stmt-input-heading" className="space-y-3">
        <h2 id="stmt-input-heading" className="text-xl font-semibold">
          ① 명세서 내용 입력
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          <li>명세서의 「배분요구 및 채권신고 현황」 표에 있는 권리를 하나씩 입력해 주세요.</li>
          <li>법정기일이 기간(예: 2026-02-10 ~ 2026-09-10)으로 적혀 있으면 <strong>시작일</strong>을 입력합니다.</li>
          <li>당해세라고 별도로 적혀 있지 않으면 당해세 여부는 「아니오」로 입력합니다.</li>
          <li>임차인은 「임차인 배분 요구 및 채권신고 현황」의 전입일, 확정일자, 보증금을 입력합니다.</li>
        </ul>
        <ClaimForm onAdd={handleAdd} showEntrusted={false} />
        {notice.length > 0 ? (
          <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            형식을 읽지 못해 빈칸으로 둔 칸이 있습니다: {notice.join(", ")}. 날짜는 2021-03-10처럼, 금액은 숫자만 입력해 주세요.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="stmt-table-heading" className="space-y-3">
        <h2 id="stmt-table-heading" className="text-xl font-semibold">
          ② 입력한 내용 확인
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">이름은 개인정보 보호를 위해 가려서 보여줍니다. 빈칸은 추측해서 채우지 않습니다.</p>
        <ClaimTable claims={shown} onRemove={(id) => setClaims((prev) => prev.filter((c) => c.id !== id))} />
      </section>

      {claims.length > 0 ? (
        <section aria-labelledby="stmt-validation-heading" className="space-y-3">
          <h2 id="stmt-validation-heading" className="text-xl font-semibold">
            ③ 입력값 검사
          </h2>
          <ValidationPanel result={validation} successMessage="입력에 문제가 없습니다. 아래에 권리 순위가 나옵니다." />
        </section>
      ) : null}

      {outcome === null ? null : outcome.kind === "error" ? (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
          분석하지 못했습니다: {outcome.message}
        </p>
      ) : !outcome.analysis.ok ? (
        <section aria-labelledby="stmt-stop-heading" className="space-y-2">
          <h2 id="stmt-stop-heading" className="text-xl font-semibold">
            ④ 권리 순위
          </h2>
          <div role="alert" className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            <p className="font-semibold">이 앱이 분석하지 않는 경우</p>
            <ul className="list-disc space-y-1 pl-5">
              {outcome.analysis.messages.map((message, index) => (
                <li key={index}>{message}</li>
              ))}
            </ul>
          </div>
        </section>
      ) : (
        <>
          <section aria-labelledby="stmt-rank-heading" className="space-y-3">
            <h2 id="stmt-rank-heading" className="text-xl font-semibold">
              ④ 권리 순위
            </h2>
            <StatementRanking analysis={outcome.analysis} />
            <ul className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
              {outcome.analysis.notices.map((text, index) => (
                <li key={index}>※ {text}</li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="stmt-evidence-heading" className="space-y-3">
            <h2 id="stmt-evidence-heading" className="text-xl font-semibold">
              ⑤ 분석 근거
            </h2>
            <EvidencePanel
              evidence={{
                steps: [],
                judgments: outcome.analysis.judgments,
                unverifiedCount: outcome.analysis.unverifiedCount,
                notices: [],
                verification: "",
              }}
              showProcess={false}
            />
          </section>
        </>
      )}
    </div>
  );
}
