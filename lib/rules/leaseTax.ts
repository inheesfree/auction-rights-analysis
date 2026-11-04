// Design Ref: §4 lib/rules/ — 규칙 4: 임차보증금 vs 일반 조세
// 판단규칙_초안.md 규칙 4 (같은 날이면 조세 우선은 담당자 업무 기준, 법적 근거 미확인)

import { compareDates } from "../dates";
import type { LeaseClaim } from "../types";
import { dateLine, judgedClaim, judgedTaxPart, requireDate, type Judgment, type TaxPart } from "./judgment";
import { leaseBaseDate } from "./lease";

/**
 * 주택임차인(a)과 일반 조세(b)를 비교한다.
 * 비교하는 날짜: 임차인 기준일(전입일과 확정일자 중 늦은 날) ↔ 조세 세목의 법정기일.
 * 소액임차인의 최우선변제 부분은 이 규칙 이전에 먼저 배분한다 (작업 7).
 * 당해세와 주택임차보증금은 규칙 5(작업 10)로 판단한다.
 */
export function judgeLeaseVsTax(lease: LeaseClaim, tax: TaxPart): Judgment {
  if (tax.item.isDangHaeSe !== false) {
    throw new RangeError("일반 조세(당해세가 아닌 세목)만 이 규칙으로 판단합니다. 당해세는 규칙 5로 판단합니다.");
  }
  const taxType = tax.claim.taxType;
  if (taxType === null) throw new RangeError("국세/지방세 구분이 없어 규칙을 고를 수 없습니다.");

  const national = taxType === "national";
  const tenantDate = leaseBaseDate(lease);
  const legalDueDate = requireDate(tax.item.legalDueDate, "법정기일");
  const order = compareDates(tenantDate, legalDueDate);

  const taxName = national ? "국세" : "지방세";
  const base = {
    ruleNo: 4,
    ruleName: `임차보증금 vs 일반 ${taxName}`,
    a: judgedClaim(lease),
    b: judgedTaxPart(tax),
    comparedDates: [
      dateLine("임차인 기준일(전입일·확정일자 중 늦은 날)", tenantDate),
      dateLine(`${taxName} 법정기일`, legalDueDate),
    ],
    law: `주택임대차보호법 제3조의2 제2항, ${national ? "국세기본법 제35조 제1항" : "지방세기본법 제71조 제1항"}`,
  };

  if (order < 0) {
    return { ...base, winner: "a", legalBasisUnverified: false, reason: `임차인 기준일이 ${taxName} 법정기일보다 빨라 임차보증금이 우선합니다.` };
  }
  if (order > 0) {
    return { ...base, winner: "b", legalBasisUnverified: false, reason: `${taxName} 법정기일이 임차인 기준일보다 빨라 ${taxName}이 우선합니다.` };
  }
  return {
    ...base,
    winner: "b",
    legalBasisUnverified: true,
    reason: `같은 날이면 ${taxName}이 우선합니다. (담당자 업무 기준, 법적 근거 미확인)`,
  };
}
