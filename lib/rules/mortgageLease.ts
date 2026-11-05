// Design Ref: §4 lib/rules/ — 규칙 6: 근저당권 vs 임차보증금
// 판단규칙_초안.md 규칙 6과 "같은 날 세부 사례" (담당자 제공). 같은 날 사례는 법적 근거 미확인.

import { compareDates } from "../dates";
import type { LeaseClaim, MortgageClaim } from "../types";
import { dateLine, judgedClaim, requireDate, type Judgment } from "./judgment";

/**
 * 근저당권(a)과 주택임차인(b)을 비교한다.
 * 전입일 N, 확정일자 F, 근저당권 설정일 M으로 다음처럼 판단한다.
 * - N > M 또는 F > M: 근저당권 우선
 * - N = M: 근저당권 우선 (대항력은 전입 다음 날 0시부터이므로, 사례 ③)
 * - N < M 이고 F < M: 임차인 우선 (사례 ①)
 * - N < M 이고 F = M: 동순위 안분 (사례 ②, 법무부 유권해석)
 * 확정일자가 없는 임차인은 배분을 받지 못하므로 이 규칙으로 판단하지 않는다.
 */
export function judgeMortgageVsLease(mortgage: MortgageClaim, lease: LeaseClaim): Judgment {
  const mortgageDate = requireDate(mortgage.registrationDate, "근저당권 설정일자");
  const moveInDate = requireDate(lease.moveInDate, "전입일");
  if (lease.fixedDate === null) {
    throw new RangeError("확정일자가 없는 임차인은 배분을 받지 못하므로 순위를 비교하지 않습니다.");
  }
  const fixedDate = lease.fixedDate;

  const moveInVsMortgage = compareDates(moveInDate, mortgageDate);
  const fixedVsMortgage = compareDates(fixedDate, mortgageDate);

  const base = {
    ruleNo: 6,
    ruleName: "근저당권 vs 임차보증금",
    a: judgedClaim(mortgage),
    b: judgedClaim(lease),
    comparedDates: [
      dateLine("근저당권 설정일자", mortgageDate),
      dateLine("임차인 전입일", moveInDate),
      dateLine("임차인 확정일자", fixedDate),
    ],
    law: "주택임대차보호법 제3조 제1항·제3조의2 제2항",
  };

  // 전입이 근저당권보다 늦으면 임차인의 대항력이 늦게 생긴다.
  if (moveInVsMortgage > 0 || fixedVsMortgage > 0) {
    return {
      ...base,
      winner: "a",
      legalBasisUnverified: false,
      reason: "임차인의 전입일 또는 확정일자가 근저당권 설정일보다 늦어 근저당권이 우선합니다.",
    };
  }
  if (moveInVsMortgage === 0) {
    return {
      ...base,
      winner: "a",
      legalBasisUnverified: true,
      reason: "전입신고가 근저당권 설정일과 같은 날이면 대항력이 다음 날 0시에 생기므로 근저당권이 우선합니다. (담당자 업무 기준, 법적 근거 미확인)",
    };
  }
  if (fixedVsMortgage < 0) {
    return {
      ...base,
      winner: "b",
      legalBasisUnverified: false,
      reason: "임차인의 전입일과 확정일자가 모두 근저당권 설정일보다 앞서 임차보증금이 우선합니다.",
    };
  }
  return {
    ...base,
    winner: "equal",
    legalBasisUnverified: true,
    reason: "전입은 전날이고 확정일자를 근저당권 설정일에 받아 선후를 가리기 어려워 동순위로 안분합니다. (담당자 업무 기준, 법적 근거 미확인)",
  };
}
