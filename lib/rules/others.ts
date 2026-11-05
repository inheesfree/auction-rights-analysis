// Design Ref: §4 lib/rules/ — 배분 계산에 필요한 나머지 쌍의 순위
// (근저당권끼리, 임차인끼리, 임차인과 당해세, 일반 임금채권의 위치 등)
//
// 판단규칙_초안.md에 규칙 번호가 없는 쌍이다. 담당자 확정이 아니라 AI가 기본 원칙으로 채운 것은
// 이유 문구에 "(AI 가정, 담당자 확인 필요)"를 붙이고 법적 근거 미확인으로 표시한다.

import { compareDates } from "../dates";
import type { LeaseClaim, MortgageClaim, ProvisionalSeizureClaim, PublicChargeClaim, WageClaim } from "../types";
import {
  dateLine,
  judgedClaim,
  judgedTaxPart,
  requireDate,
  type JudgedClaim,
  type Judgment,
  type TaxPart,
} from "./judgment";
import { leaseBaseDate } from "./lease";

const ASSUMPTION = "(AI 가정, 담당자 확인 필요)";

/**
 * 서로 다른 청구서의 조세 세목 두 개 중 당해세가 있을 때 (담당자 확인, 2026-11-04).
 * - 당해세는 압류선착주의보다 먼저, 모든 조세 중 최선순위다.
 * - 당해세끼리는 압류 여부와 상관없이 동순위로 안분한다.
 * 둘 다 당해세가 아니면 이 규칙이 아니라 규칙 7(압류선착주의)로 판단한다.
 */
export function judgeDangHaeSeAmongTaxes(a: TaxPart, b: TaxPart): Judgment {
  const aDang = a.item.isDangHaeSe === true;
  const bDang = b.item.isDangHaeSe === true;
  if (!aDang && !bDang) throw new RangeError("당해세가 있는 쌍만 이 규칙으로 판단합니다. 둘 다 일반 조세면 규칙 7로 판단합니다.");

  const dates = [a, b].flatMap((part, index) =>
    part.item.legalDueDate === null ? [] : [dateLine(`${index === 0 ? "첫째" : "둘째"} 세목 법정기일`, part.item.legalDueDate)],
  );
  const base = {
    ruleNo: 7,
    ruleName: "당해세 우선 (조세 상호간)",
    a: judgedTaxPart(a),
    b: judgedTaxPart(b),
    comparedDates: dates,
    law: null,
    legalBasisUnverified: true,
  };
  if (aDang && bDang) {
    return {
      ...base,
      winner: "equal",
      reason: "당해세끼리는 압류 여부와 상관없이 동순위로 채권액에 비례해 안분합니다. (담당자 업무 기준, 법적 근거 미확인)",
    };
  }
  return {
    ...base,
    winner: aDang ? "a" : "b",
    reason: "당해세는 압류선착주의보다 먼저 모든 조세 중 최선순위로 배분합니다. (담당자 업무 기준, 법적 근거 미확인)",
  };
}

/** 근저당권끼리: 설정일자가 빠른 쪽이 우선. 같은 날이면 등기 접수번호가 앞선 쪽 (담당자 확인). */
export function judgeMortgageVsMortgage(a: MortgageClaim, b: MortgageClaim): Judgment {
  const dateA = requireDate(a.registrationDate, "근저당권 설정일자");
  const dateB = requireDate(b.registrationDate, "근저당권 설정일자");
  const order = compareDates(dateA, dateB);
  const base = {
    ruleNo: null,
    ruleName: "근저당권 상호간 (등기 순서)",
    a: judgedClaim(a),
    b: judgedClaim(b),
    comparedDates: [dateLine("첫째 근저당권 설정일자", dateA), dateLine("둘째 근저당권 설정일자", dateB)],
    law: null,
    legalBasisUnverified: false,
  };
  if (order !== 0) {
    return { ...base, winner: order < 0 ? "a" : "b", reason: "설정일자가 빠른 근저당권이 우선합니다." };
  }
  const numberA = a.registrationNumber;
  const numberB = b.registrationNumber;
  if (numberA !== null && numberB !== null) {
    const byNumber = numberA.localeCompare(numberB, "ko", { numeric: true });
    if (byNumber !== 0) {
      return {
        ...base,
        winner: byNumber < 0 ? "a" : "b",
        reason: `설정일자가 같아 등기 접수번호가 앞선 근저당권이 우선합니다. (${numberA} / ${numberB})`,
      };
    }
  }
  return {
    ...base,
    winner: "undetermined",
    reason: "근저당권 두 건의 설정일자가 같고 접수번호로도 선후를 가릴 수 없습니다. 이 경우는 이 앱이 판단하지 않습니다.",
  };
}

/** 임차인끼리: 우선변제권 취득일(전입일·확정일자 중 늦은 날)이 빠른 쪽이 우선. 같은 날은 판단하지 않는다. */
export function judgeLeaseVsLease(a: LeaseClaim, b: LeaseClaim): Judgment {
  const dateA = leaseBaseDate(a);
  const dateB = leaseBaseDate(b);
  const order = compareDates(dateA, dateB);
  const base = {
    ruleNo: null,
    ruleName: "임차인 상호간",
    a: judgedClaim(a),
    b: judgedClaim(b),
    comparedDates: [dateLine("첫째 임차인 기준일", dateA), dateLine("둘째 임차인 기준일", dateB)],
    law: "주택임대차보호법 제3조의2 제2항",
    legalBasisUnverified: true,
  };
  if (order === 0) {
    return { ...base, winner: "undetermined", reason: `임차인 두 명의 기준일이 같은 경우의 처리 방식이 정해지지 않았습니다. 이 경우는 이 앱이 판단하지 않습니다.` };
  }
  return {
    ...base,
    winner: order < 0 ? "a" : "b",
    reason: `우선변제권을 먼저 갖춘 임차인이 우선합니다. ${ASSUMPTION}`,
  };
}

/**
 * 임차인(a)과 당해세(b). 규칙 5(2023년 개정)의 앞부분이다.
 * - 임차인 기준일이 당해세 법정기일 이상이면 당해세 우선 (규칙 5의 둘째 줄)
 * - 임차인 기준일이 당해세 법정기일보다 빠르면 순위는 당해세가 먼저(가상 배분)이고,
 *   배분한 뒤 임차인이 당해세의 우선징수액 범위에서 대신 변제받는 조정(lib/rule5.ts)을 적용한다.
 *   그래서 `rule5Adjustment` 표시를 남긴다.
 */
export function judgeLeaseVsDangHaeSe(lease: LeaseClaim, tax: TaxPart): Judgment {
  if (tax.item.isDangHaeSe !== true) throw new RangeError("당해세 세목만 이 규칙으로 판단합니다.");
  const tenantDate = leaseBaseDate(lease);
  const legalDueDate = requireDate(tax.item.legalDueDate, "법정기일");
  const base = {
    ruleNo: 5,
    ruleName: "주택임차보증금 vs 당해세",
    a: judgedClaim(lease),
    b: judgedTaxPart(tax),
    comparedDates: [dateLine("임차인 기준일(우선변제권 취득일)", tenantDate), dateLine("당해세 법정기일", legalDueDate)],
    law: tax.claim.taxType === "local" ? "지방세기본법 제71조 제6항" : "국세기본법 제35조 제7항",
    legalBasisUnverified: false,
  };
  if (compareDates(tenantDate, legalDueDate) < 0) {
    return {
      ...base,
      winner: "b",
      rule5Adjustment: true,
      reason: "당해세가 원칙적으로 먼저 배분받습니다(가상 배분). 임차인의 우선변제권이 당해세 법정기일보다 앞서므로, 배분한 뒤 임차보증금이 당해세의 우선징수액 범위에서 대신 변제받는 조정(규칙 5)을 적용합니다.",
    };
  }
  return { ...base, winner: "b", reason: "임차인 기준일이 당해세 법정기일보다 늦거나 같아 당해세가 우선합니다." };
}

/** 임차인(a)과 일반 가압류채권(b): 확정일자부 임차인은 일반채권자보다 먼저 변제받는다. */
export function judgeLeaseVsProvisional(lease: LeaseClaim, seizure: ProvisionalSeizureClaim): Judgment {
  return {
    ruleNo: null,
    ruleName: "임차보증금 vs 가압류",
    a: judgedClaim(lease),
    b: judgedClaim(seizure),
    winner: "a",
    comparedDates: [],
    law: "주택임대차보호법 제3조의2 제2항",
    legalBasisUnverified: false,
    reason: "확정일자를 갖춘 임차인은 후순위권리자와 일반채권자보다 먼저 보증금을 변제받습니다.",
  };
}

/** 공과금(a)과 일반 가압류채권(b): 우선징수권이 있는 공과금이 먼저. */
export function judgeChargeVsProvisional(charge: PublicChargeClaim, seizure: ProvisionalSeizureClaim): Judgment {
  return {
    ruleNo: null,
    ruleName: "공과금 vs 가압류",
    a: judgedClaim(charge),
    b: judgedClaim(seizure),
    winner: "a",
    comparedDates: [],
    law: "국민건강보험법 제85조",
    legalBasisUnverified: false,
    reason: "우선징수권이 있는 공과금은 일반채권보다 먼저 징수합니다.",
  };
}

/** 일반 임금채권(최종 3개월분이 아닌 임금)은 기준일 비교 대상을 모두 배분한 뒤에 배분한다 (담당자 확정). */
export function judgeGeneralWageLast(higher: JudgedClaim, wage: WageClaim): Judgment {
  return {
    ruleNo: null,
    ruleName: "일반 임금채권의 위치",
    a: higher,
    b: judgedClaim(wage),
    winner: "a",
    comparedDates: [],
    law: "근로기준법 제38조 (조문 대조 전)",
    legalBasisUnverified: true,
    reason: "일반 임금채권은 기준일 비교 대상(근저당권·임차보증금·조세·공과금)을 모두 배분한 뒤에 배분합니다. (담당자 업무 기준, 법적 근거 미확인)",
  };
}

/** 일반 임금채권(a)은 일반채권(가압류)보다 먼저 배분한다 (담당자 확정). */
export function judgeGeneralWageBeforeProvisional(wage: WageClaim, seizure: ProvisionalSeizureClaim): Judgment {
  return {
    ruleNo: null,
    ruleName: "일반 임금채권의 위치",
    a: judgedClaim(wage),
    b: judgedClaim(seizure),
    winner: "a",
    comparedDates: [],
    law: "근로기준법 제38조 (조문 대조 전)",
    legalBasisUnverified: true,
    reason: "일반 임금채권은 일반채권(가압류 등)보다 먼저 배분합니다. (담당자 업무 기준, 법적 근거 미확인)",
  };
}

/** 가압류끼리(일반채권끼리)는 동순위로 안분한다. */
export function judgeProvisionalVsProvisional(a: ProvisionalSeizureClaim, b: ProvisionalSeizureClaim): Judgment {
  return {
    ruleNo: null,
    ruleName: "일반채권 상호간",
    a: judgedClaim(a),
    b: judgedClaim(b),
    winner: "equal",
    comparedDates: [],
    law: null,
    legalBasisUnverified: true,
    reason: `일반채권끼리는 동순위로 채권액에 비례해 안분합니다. ${ASSUMPTION}`,
  };
}
