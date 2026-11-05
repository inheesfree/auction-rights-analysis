// Design Ref: §4 lib/rules/ — 규칙 7: 국세 vs 지방세
// 판단규칙_초안.md 규칙 7 (담당자 확인: 무조건 압류선착주의, 압류가 없으면 교부청구끼리 안분,
// 납세담보가 있는 조세는 다른 조세보다 우선)

import { compareDates } from "../dates";
import type { TaxClaim } from "../types";
import { dateLine, judgedClaim, type Judgment } from "./judgment";

function needFlag(value: boolean | null, label: string): boolean {
  if (value === null) throw new RangeError(`${label}이(가) 없어 순위를 비교할 수 없습니다. 입력값 검사를 먼저 통과해야 합니다.`);
  return value;
}

/**
 * 조세 두 건(일반 조세끼리)을 비교한다. 조세 한 건 단위로 비교한다(세목 단위가 아님).
 * 1. 납세담보가 한쪽에만 있으면 담보된 조세가 우선한다.
 * 2. 압류일로 비교한다: 둘 다 압류했으면 먼저 압류한 쪽, 한쪽만 압류했으면 압류한 쪽이 우선한다.
 * 3. 둘 다 압류하지 않고 교부청구만 했으면 동순위로 안분한다.
 * 담당자 기준이 아직 없는 경우(참가압류, 압류일이 같은 날, 납세담보가 둘 다 있음)는
 * 판단하지 않고 `undetermined`로 알린다.
 */
function judgeTaxVsTaxCore(a: TaxClaim, b: TaxClaim): Judgment {
  const base = {
    ruleNo: 7,
    ruleName: "국세 vs 지방세",
    a: judgedClaim(a),
    b: judgedClaim(b),
  };
  const undetermined = (reason: string): Judgment => ({
    ...base,
    winner: "undetermined",
    comparedDates: [],
    law: null,
    legalBasisUnverified: false,
    reason: `${reason} 이 경우는 이 앱이 판단하지 않습니다.`,
  });

  if (a.taxType === null || b.taxType === null) {
    throw new RangeError("국세/지방세 구분이 없어 순위를 비교할 수 없습니다. 입력값 검사를 먼저 통과해야 합니다.");
  }
  if (a.hasParticipatingSeizure === true || b.hasParticipatingSeizure === true) {
    return undetermined("참가압류가 있는 경우의 처리 방식이 정해지지 않았습니다.");
  }

  // 1. 납세담보
  const collateralA = needFlag(a.hasTaxCollateral, "납세담보 여부");
  const collateralB = needFlag(b.hasTaxCollateral, "납세담보 여부");
  if (collateralA && collateralB) {
    return undetermined("납세담보가 둘 다 있는 경우의 처리 방식이 정해지지 않았습니다.");
  }
  if (collateralA !== collateralB) {
    const winner = collateralA ? "a" : "b";
    return {
      ...base,
      winner,
      comparedDates: [],
      law: "국세기본법 제37조, 지방세기본법 제74조",
      legalBasisUnverified: false,
      reason: `납세담보가 있는 쪽이 다른 조세보다 우선합니다. (우선: ${winner === "a" ? base.a.label : base.b.label})`,
    };
  }

  // 2. 압류선착주의
  const lawSeizure = "국세기본법 제36조, 지방세기본법 제73조";
  const seizureA = a.seizureDate;
  const seizureB = b.seizureDate;
  const dates = [
    seizureA === null ? "첫째 조세: 압류 없음(교부청구만)" : dateLine("첫째 조세 압류일", seizureA),
    seizureB === null ? "둘째 조세: 압류 없음(교부청구만)" : dateLine("둘째 조세 압류일", seizureB),
  ];
  if (seizureA !== null && seizureB !== null) {
    const order = compareDates(seizureA, seizureB);
    if (order === 0) {
      return { ...undetermined("압류일이 같은 날인 경우의 처리 방식이 정해지지 않았습니다."), comparedDates: dates };
    }
    const winner = order < 0 ? "a" : "b";
    return {
      ...base,
      winner,
      comparedDates: dates,
      law: lawSeizure,
      legalBasisUnverified: false,
      reason: `먼저 압류한 쪽이 우선합니다. (압류선착주의, 우선: ${winner === "a" ? base.a.label : base.b.label})`,
    };
  }
  if (seizureA !== null || seizureB !== null) {
    const winner = seizureA !== null ? "a" : "b";
    return {
      ...base,
      winner,
      comparedDates: dates,
      law: lawSeizure,
      legalBasisUnverified: false,
      reason: `압류한 쪽이 교부청구만 한 쪽보다 우선합니다. (압류선착주의, 우선: ${winner === "a" ? base.a.label : base.b.label})`,
    };
  }

  // 3. 둘 다 교부청구만
  return {
    ...base,
    winner: "equal",
    comparedDates: dates,
    law: null,
    legalBasisUnverified: true,
    reason: "둘 다 압류하지 않고 교부청구만 해서 동순위로 안분합니다. (담당자 업무 기준, 법적 근거 미확인)",
  };
}

/**
 * 규칙 7: 조세 두 건(일반 조세끼리)의 순위.
 * 담당자 확인 내용은 국세와 지방세 사이이고, 국세끼리·지방세끼리에도 같은 방식(압류선착주의, 납세담보,
 * 교부청구끼리 안분)을 적용한다. 같은 종류끼리 적용하는 것은 AI 가정이라 법적 근거 미확인으로 표시한다.
 * (사례 2: 압류권자 양천세무서·용산세무서가 모두 국세)
 */
export function judgeTaxVsTax(a: TaxClaim, b: TaxClaim): Judgment {
  const judgment = judgeTaxVsTaxCore(a, b);
  if (a.taxType !== b.taxType || judgment.winner === "undetermined") return judgment;
  return {
    ...judgment,
    ruleName: "조세 상호간 (같은 종류)",
    legalBasisUnverified: true,
    reason: `${judgment.reason} (같은 종류의 조세끼리도 같은 방식을 적용: AI 가정, 담당자 확인 필요)`,
  };
}
