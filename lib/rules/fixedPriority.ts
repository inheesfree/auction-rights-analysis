// Design Ref: §4 lib/rules/ — 규칙 9·12·13: 날짜와 상관없이 정해지는 우선순위
// 판단규칙_초안.md 규칙 9(임금채권 vs 조세), 규칙 12(공과금 vs 조세), 규칙 13(조세 vs 가압류)

import type { ProvisionalSeizureClaim, PublicChargeClaim, TaxClaim, WageClaim } from "../types";
import { judgedClaim, type Judgment } from "./judgment";

/**
 * 규칙 9: 최종 3개월분 임금채권(a)은 조세(b)보다 날짜와 상관없이 무조건 우선한다.
 * 최종 3개월분이 아닌 일반 임금채권은 이 규칙이 아니라, 기준일 비교 대상을 모두 배분한 뒤
 * 일반채권 앞에서 배분한다(담당자 확정).
 */
export function judgeWageVsTax(wage: WageClaim, tax: TaxClaim): Judgment {
  if (wage.wageType !== "last3Months") {
    throw new RangeError("최종 3개월분 임금채권만 이 규칙으로 판단합니다. 일반 임금채권은 기준일 비교 대상 뒤에서 배분합니다.");
  }
  return {
    ruleNo: 9,
    ruleName: "최선순위 임금채권 vs 조세",
    a: judgedClaim(wage),
    b: judgedClaim(tax),
    winner: "a",
    comparedDates: [],
    law: "근로기준법 제38조 (조문 대조 전)",
    legalBasisUnverified: true,
    reason: "최종 3개월분 임금채권은 조세보다 날짜와 상관없이 우선합니다. (담당자 업무 기준, 법적 근거 미확인)",
  };
}

/**
 * 규칙 12: 공과금(a)과 조세(b)는 날짜와 상관없이 조세가 우선한다.
 * 국민건강보험법 제85조는 보험료가 국세·지방세를 제외한 다른 채권에 우선한다고 정한다.
 */
export function judgeChargeVsTax(charge: PublicChargeClaim, tax: TaxClaim): Judgment {
  return {
    ruleNo: 12,
    ruleName: "공과금 vs 조세",
    a: judgedClaim(charge),
    b: judgedClaim(tax),
    winner: "b",
    comparedDates: [],
    law: "국민건강보험법 제85조 (국세·지방세는 제외)",
    legalBasisUnverified: false,
    reason: "공과금과 조세가 함께 있으면 날짜와 상관없이 조세가 우선합니다.",
  };
}

/**
 * 규칙 13: 조세(a)와 일반 가압류채권(b)은 날짜와 상관없이 조세가 우선한다.
 * 국세·지방세는 다른 공과금이나 그 밖의 채권에 우선해 징수한다.
 */
export function judgeTaxVsProvisional(tax: TaxClaim, seizure: ProvisionalSeizureClaim): Judgment {
  const national = tax.taxType === "national";
  if (tax.taxType === null) throw new RangeError("국세/지방세 구분이 없어 규칙을 고를 수 없습니다.");
  return {
    ruleNo: 13,
    ruleName: "일반 조세 vs 가압류",
    a: judgedClaim(tax),
    b: judgedClaim(seizure),
    winner: "a",
    comparedDates: [],
    law: national ? "국세기본법 제35조 제1항 본문" : "지방세기본법 제71조 제1항 본문",
    legalBasisUnverified: false,
    reason: "조세와 일반 가압류채권이 함께 있으면 날짜와 상관없이 조세가 우선합니다.",
  };
}
