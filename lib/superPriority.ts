// Design Ref: §3 ⑤ — 배분 순서의 맨 앞: 체납처분비 → 소액임차 최우선변제·최종 3개월분 임금채권
// Plan SC: 작업 7 — 체납처분비가 소액임차 최우선변제보다 항상 먼저 배분된다 (담당자 확정)
//
// 담당자 확정 내용 (2026-11-04)
// - 체납처분비가 소액임차 최우선변제보다 무조건 먼저다.
// - 소액임차 최우선변제의 합계는 매각대금의 2분의 1을 넘을 수 없고, 넘으면 최우선변제액 비율로 안분한다.
// - 소액임차 최우선변제와 최종 3개월분 임금채권은 동순위다. 배분재원이 모자라면 채권액에 비례해 안분한다.
// - 확정일자가 없어도 소액임차인이면 최우선변제를 받는다.
// [확인 필요] 주택가액의 2분의 1이 홀수 원일 때는 내림한다. 안분의 1원 나머지는 lib/prorate.ts의 임시 규칙을 따른다.

import { claimLabel } from "./claimLabel";
import { formatWon, assertWon, sumWon } from "./money";
import { prorate } from "./prorate";
import { decideSmallLease } from "./smallLease";
import type { Claim, Won } from "./types";

export type SuperPriorityKind = "dispositionCost" | "smallLease" | "wage";

/** 배분 한 줄. */
export interface SuperPriorityLine {
  claimId: string;
  label: string;
  kind: SuperPriorityKind;
  /** 받을 자격이 있는 금액 (안분하기 전). */
  entitled: Won;
  /** 실제로 배분한 금액. */
  paid: Won;
  /** 계산 근거를 사람이 읽는 글로 적은 것. */
  notes: string[];
}

export type SuperPriorityResult =
  | {
      ok: true;
      lines: SuperPriorityLine[];
      /** 이 단계를 거치고 남은 금액 (다음 단계에서 배분한다). */
      remaining: Won;
      /** 소액임차 최우선변제를 이미 받은 임차인과 그 금액 (이후 단계에서 남은 보증금을 계산할 때 쓴다). */
      smallLeasePaid: Record<string, Won>;
    }
  | {
      ok: false;
      /** 이 앱이 다루지 않는 경우의 이유. 계산을 멈추고 이 이유를 안내한다. */
      unsupported: string[];
    };

/**
 * 체납처분비와 소액임차 최우선변제·최종 3개월분 임금채권을 배분한다.
 * 입력값 검사(lib/validate.ts)를 통과한 채권만 넣는다.
 */
export function allocateSuperPriority(saleProceeds: Won, claims: readonly Claim[]): SuperPriorityResult {
  assertWon(saleProceeds);
  const lines: SuperPriorityLine[] = [];

  // 1. 체납처분비: 소액임차보다 항상 먼저. 입력 순서대로 배분한다.
  let remaining = saleProceeds;
  for (const claim of claims) {
    if (claim.kind !== "dispositionCost") continue;
    assertWon(claim.amount);
    const paid = Math.min(claim.amount, remaining);
    remaining -= paid;
    lines.push({
      claimId: claim.id,
      label: claimLabel(claim),
      kind: "dispositionCost",
      entitled: claim.amount,
      paid,
      notes: [
        "체납처분비는 소액임차 최우선변제보다 먼저 배분합니다.",
        ...(paid < claim.amount ? ["매각대금이 모자라 일부만 배분합니다."] : []),
      ],
    });
  }

  // 2. 소액임차 최우선변제 대상 판정
  const unsupported: string[] = [];
  const smallLeases: { id: string; label: string; entitlement: Won; baseDate: string }[] = [];
  for (const claim of claims) {
    if (claim.kind !== "lease") continue;
    const decision = decideSmallLease(claim, claims);
    if (decision.status === "unsupported") unsupported.push(decision.reason);
    else if (decision.status === "small") {
      smallLeases.push({ id: claim.id, label: claimLabel(claim), entitlement: decision.entitlement, baseDate: decision.baseDate });
    }
  }
  if (unsupported.length > 0) return { ok: false, unsupported };

  // 3. 소액임차 합계가 매각대금의 2분의 1을 넘으면 최우선변제액 비율로 안분 (시행령 제10조 제2항)
  const halfCap = Math.floor(saleProceeds / 2);
  const entitlements = smallLeases.map((s) => s.entitlement);
  const leaseSum = sumWon(entitlements);
  const capped = leaseSum > halfCap;
  const cappedAmounts = capped ? prorate(halfCap, entitlements).shares : entitlements;

  // 4. 소액임차 + 최종 3개월분 임금채권은 동순위. 배분재원이 모자라면 채권액에 비례해 안분한다.
  const wages = claims.flatMap((claim) => {
    if (claim.kind !== "wage" || claim.wageType !== "last3Months") return [];
    assertWon(claim.amount);
    return [{ id: claim.id, label: claimLabel(claim), amount: claim.amount }];
  });
  const poolAmounts = [...cappedAmounts, ...wages.map((w) => w.amount)];
  const poolTotal = sumWon(poolAmounts);
  const shortage = poolTotal > remaining;
  const paidAmounts = shortage ? prorate(remaining, poolAmounts).shares : poolAmounts;

  const smallLeasePaid: Record<string, Won> = {};
  smallLeases.forEach((s, i) => {
    const paid = paidAmounts[i];
    smallLeasePaid[s.id] = paid;
    const notes = [`소액임차인 최우선변제 (기준 시점 ${s.baseDate}): ${formatWon(s.entitlement)}`];
    if (capped) notes.push(`소액임차 합계가 매각대금의 2분의 1(${formatWon(halfCap)})을 넘어 최우선변제액 비율로 안분했습니다.`);
    if (shortage) notes.push("최종 3개월분 임금채권과 동순위인데 배분재원이 모자라 채권액에 비례해 안분했습니다.");
    lines.push({ claimId: s.id, label: s.label, kind: "smallLease", entitled: s.entitlement, paid, notes });
  });
  wages.forEach((w, j) => {
    const paid = paidAmounts[smallLeases.length + j];
    const notes = ["최종 3개월분 임금채권은 소액임차 최우선변제와 동순위입니다. (담당자 업무 기준)"];
    if (shortage) notes.push("배분재원이 모자라 채권액에 비례해 안분했습니다.");
    lines.push({ claimId: w.id, label: w.label, kind: "wage", entitled: w.amount, paid, notes });
  });

  remaining -= sumWon(paidAmounts);
  return { ok: true, lines, remaining, smallLeasePaid };
}
