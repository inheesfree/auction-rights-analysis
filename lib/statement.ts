// Design Ref: PRD 흐름 C — 공매재산명세서 권리분석 (외부 사용자용)
// Plan SC: 작업 15 — 매각금액을 모르므로 금액은 계산하지 않고 권리 순위와 근거, 인수 대상만 보여준다
//
// 담당자 확인 (2026-11-05)
//   - 명세서 분석에서는 매각금액을 모르니 순위만 알려준다.
//   - 이름은 마스킹해서 보여준다 (lib/privacy.ts).
//   - 대항력 있는 임차인(전입일자·확정일자가 모두 있음)은 배분받지 못한 보증금을 매수인이 인수한다.
//
// 구현 방식: 순위는 담당자용과 같은 규칙(lib/distribute.ts)으로 정한다. 금액이 모자라서 생기는 변화가 없도록
// 매각대금을 채권액 합계의 두 배로 두고 계산해서 "순위 구조"만 가져오고, 배분액은 결과에 담지 않는다.

import { distribute } from "./distribute";
import { describeJudgment, type JudgmentEvidence } from "./evidence";
import { maskClaim } from "./privacy";
import type { Claim, Won } from "./types";

/** 순위표의 한 줄. 금액은 명세서에 적힌 채권액이고, 배분받는 금액이 아니다. */
export interface RankRow {
  /** "먼저 배분" 또는 "1순위" 같은 순서 이름. */
  stage: string;
  /** 알아볼 이름 (채권자 이름은 가려져 있다). */
  label: string;
  /** 명세서에 적힌 채권액. 먼저 배분 단계의 소액임차는 최우선변제 해당액. */
  claimed: Won;
  notes: string[];
}

/** 대항력 있는 임차인: 배분받지 못한 보증금은 매수인이 인수한다. */
export interface AcquiringTenant {
  label: string;
  /** 보증금 전체 금액. 인수할 금액은 매각금액을 알아야 정해진다. */
  deposit: Won;
}

export type StatementAnalysis =
  | {
      ok: true;
      rows: RankRow[];
      /** 순위 단계에서 배분 대상이 아닌 채권과 이유 (예: 확정일자 없는 임차인). */
      excluded: { label: string; reason: string }[];
      acquiringTenants: AcquiringTenant[];
      /** 순위 판단 근거. */
      judgments: JudgmentEvidence[];
      unverifiedCount: number;
      notices: string[];
    }
  | { ok: false; reason: string; messages: string[] };

/** 채권액 합계 (채권액을 모르는 채권은 0으로 본다). */
function totalClaimed(claims: readonly Claim[]): Won {
  return claims.reduce((sum, claim) => sum + (claim.amount ?? 0), 0);
}

/**
 * 공매재산명세서에서 읽은(확인한) 채권의 권리 순위를 분석한다.
 * 입력값 검사(lib/validate.ts)를 통과한 채권만 넣는다. 이름은 이 함수 안에서 마스킹한다.
 */
export function analyzeStatement(claims: readonly Claim[]): StatementAnalysis {
  const masked = claims.map(maskClaim);
  // 어떤 채권도 모자라지 않을 만큼 큰 매각대금(채권액 합계의 두 배). 순위 구조만 얻는 데 쓰고 금액은 쓰지 않는다.
  const result = distribute(Math.max(1, totalClaimed(masked) * 2), masked);
  if (!result.ok) {
    return { ok: false, reason: result.reason, messages: result.messages };
  }

  const smallLeaseIds = new Set(result.superPriority.filter((line) => line.kind === "smallLease").map((line) => line.claimId));
  const rows: RankRow[] = [
    ...result.superPriority.map((line) => ({
      stage: "먼저 배분",
      label: line.label,
      claimed: line.entitled,
      notes: line.notes,
    })),
    ...result.lines.map((line) => ({
      stage: `${line.rank}순위`,
      label: line.label,
      claimed: line.claimed,
      notes: [...(line.kind === "lease" && smallLeaseIds.has(line.claimId) ? ["소액임차 최우선변제를 뺀 나머지 보증금"] : []), ...line.notes],
    })),
  ];

  const judgments = result.judgments.map(describeJudgment);
  const unverifiedCount = judgments.filter((j) => j.legalBasisUnverified).length;

  const notices = [
    "매각금액을 모르므로 금액은 계산하지 않고 권리 순위만 보여줍니다. 실제로 얼마를 배분받는지는 매각금액에 따라 달라집니다.",
    "참고용이며 법적 효력이 없습니다.",
  ];
  if (result.acquiredDeposits.length > 0) {
    notices.push("대항력 있는 임차인(전입일자와 확정일자가 모두 있는 임차인)의 보증금 중 배분받지 못한 금액은 매수인이 인수합니다.");
  }
  if (result.circular.length > 0) {
    notices.push("순위가 서로 엇갈리는 권리(순환)가 있어 같은 순위로 묶어 보여줍니다. 실제 배분은 매각금액에 따라 안분됩니다.");
  }
  if (result.judgments.some((judgment) => judgment.rule5Adjustment)) {
    notices.push("당해세와 주택임차보증금이 함께 있어 규칙 5(대신 변제) 조정이 적용될 수 있습니다. 실제 배분액은 매각금액에 따라 달라집니다.");
  }
  if (unverifiedCount > 0) {
    notices.push(`순위 판단 ${unverifiedCount}건은 법적 근거를 확인하지 못한 담당자 업무 기준을 적용했습니다.`);
  }

  return {
    ok: true,
    rows,
    excluded: result.excluded.map((e) => ({ label: e.label, reason: e.reason })),
    acquiringTenants: result.acquiredDeposits.map((d) => ({ label: d.label, deposit: d.deposit })),
    judgments,
    unverifiedCount,
    notices,
  };
}
