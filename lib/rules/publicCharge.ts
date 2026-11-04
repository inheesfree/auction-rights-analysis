// Design Ref: §4 lib/rules/ — 규칙 10·11: 공과금 vs 담보권, 공과금 vs 임차보증금
// 판단규칙_초안.md 규칙 10, 11. 입력된 공과금은 우선징수권이 있는 공과금(건강보험료 등)으로 본다.

import { compareDates } from "../dates";
import type { JeonseClaim, LeaseClaim, MortgageClaim, PublicChargeClaim } from "../types";
import { dateLine, judgedClaim, requireDate, type Judgment } from "./judgment";

const LAW_HEALTH_INSURANCE = "국민건강보험법 제85조";

/**
 * 규칙 10: 공과금(a)과 담보권(b: 근저당권 또는 주택 전세권)을 비교한다.
 * 비교하는 날짜: 공과금 납부기한 ↔ 담보권 설정일.
 * 납부기한 전에 설정된 담보권이 우선하고, 이후에 설정된 담보권보다는 공과금이 우선한다.
 * 같은 날이면 공과금이 우선한다 (담당자 업무 기준, 법적 근거 미확인).
 */
export function judgeChargeVsSecured(charge: PublicChargeClaim, secured: MortgageClaim | JeonseClaim): Judgment {
  const dueDate = requireDate(charge.dueDate, "공과금 납부기한");
  const securedDate = requireDate(secured.registrationDate, "담보권 설정일(등기 접수일)");
  const order = compareDates(securedDate, dueDate);

  const base = {
    ruleNo: 10,
    ruleName: "공과금 vs 담보권",
    a: judgedClaim(charge),
    b: judgedClaim(secured),
    comparedDates: [dateLine("공과금 납부기한", dueDate), dateLine("담보권 설정일", securedDate)],
    law: LAW_HEALTH_INSURANCE,
  };

  if (order < 0) {
    return { ...base, winner: "b", legalBasisUnverified: false, reason: "담보권이 공과금 납부기한 전에 설정되어 담보권이 우선합니다." };
  }
  if (order > 0) {
    return {
      ...base,
      winner: "a",
      legalBasisUnverified: true,
      reason: "담보권이 공과금 납부기한 이후에 설정되어 공과금이 우선합니다. (담당자 업무 기준, 법적 근거를 일부만 확인)",
    };
  }
  return {
    ...base,
    winner: "a",
    legalBasisUnverified: true,
    reason: "같은 날이면 공과금이 우선합니다. (담당자 업무 기준, 법적 근거 미확인)",
  };
}

/**
 * 규칙 11: 공과금(a)과 확정일자부 주택임차보증금(b)을 비교한다.
 * 우선징수권이 있는 공과금이 날짜와 상관없이 우선한다 (담당자 업무 기준, 법적 근거 미확인).
 * 확정일자가 없는 임차인은 배분을 받지 못하므로 이 규칙으로 판단하지 않는다.
 */
export function judgeChargeVsLease(charge: PublicChargeClaim, lease: LeaseClaim): Judgment {
  if (lease.fixedDate === null) {
    throw new RangeError("확정일자가 없는 임차인은 배분을 받지 못하므로 순위를 비교하지 않습니다.");
  }
  return {
    ruleNo: 11,
    ruleName: "공과금 vs 임차보증금",
    a: judgedClaim(charge),
    b: judgedClaim(lease),
    winner: "a",
    comparedDates: [],
    law: LAW_HEALTH_INSURANCE,
    legalBasisUnverified: true,
    reason: "우선징수권이 있는 공과금은 날짜와 상관없이 확정일자부 임차보증금보다 우선합니다. (담당자 업무 기준, 법적 근거 미확인: 조문에 확정일자 임차권이 명시되어 있지 않음)",
  };
}
