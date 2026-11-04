// Design Ref: §4 lib/rules/ — 두 덩어리(참가자)의 종류에 맞는 순위 규칙을 골라 판단한다.
// Plan SC: 작업 8 — 모든 쌍의 순위를 규칙으로 정하고, 규칙이 없는 쌍은 계산하지 않고 알린다.

import { judgeLeaseVsTax } from "./leaseTax";
import { judgeMortgageVsLease } from "./mortgageLease";
import { judgeMortgageVsDangHaeSe } from "./mortgageDangHaeSe";
import { judgeMortgageVsProvisional } from "./mortgageSeizure";
import { judgeMortgageVsTax } from "./mortgageTax";
import { judgeChargeVsLease, judgeChargeVsSecured } from "./publicCharge";
import { judgeChargeVsTax, judgeTaxVsProvisional } from "./fixedPriority";
import { judgeTaxVsTax } from "./taxTax";
import { judgedClaim, judgedTaxPart, swapJudgment, type Judgment, type TaxPart } from "./judgment";
import {
  judgeChargeVsProvisional,
  judgeGeneralWageBeforeProvisional,
  judgeGeneralWageLast,
  judgeLeaseVsDangHaeSe,
  judgeLeaseVsLease,
  judgeLeaseVsProvisional,
  judgeMortgageVsMortgage,
  judgeProvisionalVsProvisional,
} from "./others";
import { KIND_ORDER, type Participant } from "./participant";

export type PairResult =
  | { type: "judgment"; judgment: Judgment }
  /** 같은 조세 청구서 안의 세목끼리는 서로 순위를 가르지 않는다. */
  | { type: "sameClaim" }
  /** 이 두 종류 사이의 순위 규칙이 없다. */
  | { type: "noRule"; reason: string };

const judged = (judgment: Judgment): PairResult => ({ type: "judgment", judgment });

function partOf(p: Extract<Participant, { kind: "tax" }>): TaxPart {
  return { claim: p.claim, item: p.item };
}

/** 종류 순서가 앞선 쪽을 a로 둔 쌍을 판단한다. */
function judgeOrdered(a: Participant, b: Participant): PairResult {
  switch (a.kind) {
    case "mortgage":
      switch (b.kind) {
        case "mortgage":
          return judged(judgeMortgageVsMortgage(a.claim, b.claim));
        case "lease":
          return judged(judgeMortgageVsLease(a.claim, b.claim));
        case "tax":
          return judged(
            b.item.isDangHaeSe ? judgeMortgageVsDangHaeSe(a.claim, partOf(b)) : judgeMortgageVsTax(a.claim, partOf(b)),
          );
        case "charge":
          return judged(swapJudgment(judgeChargeVsSecured(b.claim, a.claim)));
        case "wageGeneral":
          return judged(judgeGeneralWageLast(judgedClaim(a.claim), b.claim));
        case "provisional":
          return judged(judgeMortgageVsProvisional(a.claim, b.claim));
      }
      break;
    case "lease":
      switch (b.kind) {
        case "lease":
          return judged(judgeLeaseVsLease(a.claim, b.claim));
        case "tax":
          return judged(b.item.isDangHaeSe ? judgeLeaseVsDangHaeSe(a.claim, partOf(b)) : judgeLeaseVsTax(a.claim, partOf(b)));
        case "charge":
          return judged(swapJudgment(judgeChargeVsLease(b.claim, a.claim)));
        case "wageGeneral":
          return judged(judgeGeneralWageLast(judgedClaim(a.claim), b.claim));
        case "provisional":
          return judged(judgeLeaseVsProvisional(a.claim, b.claim));
      }
      break;
    case "tax":
      switch (b.kind) {
        case "tax":
          return a.claim.id === b.claim.id ? { type: "sameClaim" } : judged(judgeTaxVsTax(a.claim, b.claim));
        case "charge":
          return judged(swapJudgment(judgeChargeVsTax(b.claim, a.claim)));
        case "wageGeneral":
          return judged(judgeGeneralWageLast(judgedTaxPart(partOf(a)), b.claim));
        case "provisional":
          return judged(judgeTaxVsProvisional(a.claim, b.claim));
      }
      break;
    case "charge":
      switch (b.kind) {
        case "charge":
          return { type: "noRule", reason: "공과금 두 건 사이의 순위 규칙이 정해지지 않았습니다." };
        case "wageGeneral":
          return judged(judgeGeneralWageLast(judgedClaim(a.claim), b.claim));
        case "provisional":
          return judged(judgeChargeVsProvisional(a.claim, b.claim));
      }
      break;
    case "wageGeneral":
      switch (b.kind) {
        case "wageGeneral":
          return { type: "noRule", reason: "일반 임금채권 두 건 사이의 순위 규칙이 정해지지 않았습니다." };
        case "provisional":
          return judged(judgeGeneralWageBeforeProvisional(a.claim, b.claim));
      }
      break;
    case "provisional":
      if (b.kind === "provisional") return judged(judgeProvisionalVsProvisional(a.claim, b.claim));
      break;
  }
  return { type: "noRule", reason: `${a.label}와(과) ${b.label} 사이의 순위 규칙이 없습니다.` };
}

/**
 * 두 덩어리의 순위를 판단한다. 결과의 a·b는 인자로 넘긴 a·b와 같은 방향이다.
 */
export function judgePair(a: Participant, b: Participant): PairResult {
  if (KIND_ORDER[a.kind] <= KIND_ORDER[b.kind]) return judgeOrdered(a, b);
  const flipped = judgeOrdered(b, a);
  return flipped.type === "judgment" ? judged(swapJudgment(flipped.judgment)) : flipped;
}
