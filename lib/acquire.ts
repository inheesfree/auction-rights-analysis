// Design Ref: PRD 흐름 C — 매수인이 인수할 금액
// Plan SC: 대항력 있는 임차인의 배분받지 못한 보증금은 매수인이 인수한다
//
// 담당자 확인 (2026-11-05, 사례 5)
//   - 전입일자와 확정일자가 **둘 다 있으면** 대항력 있는 임차인이다.
//     (말소기준권리의 날짜와 비교하지 않고, 두 날짜가 있는지만 본다.)
//   - 매수인이 인수할 임차보증금 = 임차보증금 전체 금액 − 임차인이 배분받은 금액
//     (사례 5: 65,500,000 − 22,000,000 = 43,500,000)

import { claimLabel } from "./claimLabel";
import type { Claim, LeaseClaim, Won } from "./types";

/** 대항력 있는 임차인 한 명의 인수 내역. */
export interface AcquiredDeposit {
  claimId: string;
  /** 알아볼 이름. 예: "주택임차보증금(홍○○)" */
  label: string;
  /** 임차보증금 전체 금액. */
  deposit: Won;
  /** 임차인이 배분받은 금액 (소액임차 최우선변제를 포함한 총액). */
  paid: Won;
  /** 매수인이 인수할 임차보증금. */
  acquired: Won;
}

/** 대항력 있는 임차인인지: 전입일자와 확정일자가 둘 다 있어야 한다 (담당자 확인). */
export function hasOpposingPower(lease: LeaseClaim): boolean {
  return lease.moveInDate !== null && lease.fixedDate !== null;
}

/**
 * 대항력 있는 임차인마다 매수인이 인수할 임차보증금을 계산한다.
 * 보증금을 모르는(빈칸) 임차인은 계산하지 않는다. 입력값 검사를 통과한 채권만 넣는다.
 * @param paidByClaim 채권(청구서) 한 건당 받은 총액 (lib/distribute.ts의 결과)
 */
export function acquiredDeposits(claims: readonly Claim[], paidByClaim: Readonly<Record<string, Won>>): AcquiredDeposit[] {
  return claims.flatMap((claim) => {
    if (claim.kind !== "lease" || claim.amount === null || !hasOpposingPower(claim)) return [];
    const paid = paidByClaim[claim.id] ?? 0;
    return [
      {
        claimId: claim.id,
        label: claimLabel(claim),
        deposit: claim.amount,
        paid,
        acquired: Math.max(0, claim.amount - paid),
      },
    ];
  });
}
