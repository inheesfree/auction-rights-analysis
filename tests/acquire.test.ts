// 매수인이 인수할 임차보증금 (담당자 확인: 전입일자·확정일자가 둘 다 있으면 대항력 있는 임차인,
// 인수 금액 = 보증금 전체 − 임차인이 배분받은 금액)

import { expect, test } from "vitest";
import { acquiredDeposits, hasOpposingPower } from "../lib/acquire";
import { buildClaim } from "../lib/claimForm";
import { distribute } from "../lib/distribute";
import { buildEvidence, evidenceToText } from "../lib/evidence";
import type { LeaseClaim } from "../lib/types";

let seq = 0;
const lease = (deposit: string, moveIn: string, fixed: string, name = "홍길동") =>
  buildClaim(`a${++seq}`, "lease", { creditor: name, amount: deposit, moveInDate: moveIn, fixedDate: fixed, isHousing: "yes", region: "seoul" }, [], false).claim as LeaseClaim;

test("전입일자와 확정일자가 둘 다 있어야 대항력 있는 임차인", () => {
  expect(hasOpposingPower(lease("1000", "2016-10-05", "2016-10-05"))).toBe(true);
  expect(hasOpposingPower(lease("1000", "2016-10-05", ""))).toBe(false);
  expect(hasOpposingPower(lease("1000", "", "2016-10-05"))).toBe(false);
});

test("사례 5: 보증금 6,550만원 − 배분 2,200만원 = 인수 4,350만원", () => {
  const tenant = lease("65500000", "2016-10-05", "2016-10-05");
  const result = acquiredDeposits([tenant], { [tenant.id]: 22_000_000 });
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({ deposit: 65_500_000, paid: 22_000_000, acquired: 43_500_000 });
});

test("전액 배분받으면 인수 0원, 배분을 못 받으면 보증금 전체를 인수", () => {
  const a = lease("1000", "2016-10-05", "2016-10-05", "가"), b = lease("2000", "2016-10-05", "2016-10-05", "나");
  const result = acquiredDeposits([a, b], { [a.id]: 1000 });
  expect(result.map((d) => [d.deposit, d.paid, d.acquired])).toEqual([[1000, 1000, 0], [2000, 0, 2000]]);
});

test("확정일자가 없는 임차인(대항력 없음)은 인수 대상이 아님", () => {
  expect(acquiredDeposits([lease("1000", "2016-10-05", "")], {})).toEqual([]);
});

test("배분 결과와 근거 글에 인수 금액이 함께 나온다", () => {
  const tenant = lease("65500000", "2016-10-05", "2016-10-05");
  const tax = (creditor: string, amount: string, legal: string, seizure: string) =>
    buildClaim(`t-${creditor}`, "tax", { creditor, amount, taxType: "national", hasTaxCollateral: "no", seizureDate: seizure }, [{ name: "세목", legalDueDate: legal, amount, isDangHaeSe: "no" }], false).claim;
  const claims = [
    buildClaim("cost", "dispositionCost", { creditor: "공사", amount: "1000000" }, [], false).claim,
    tax("양천", "2000000", "2010-05-05", "2015-02-05"),
    tenant,
    tax("관악", "30000000", "2017-10-06", "2018-03-01"),
  ];
  const result = distribute(25_000_000, claims);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.acquiredDeposits).toHaveLength(1);
  expect(result.acquiredDeposits[0].acquired).toBe(43_500_000);
  const evidence = buildEvidence(result);
  expect(evidence.steps.some((step) => step.title.includes("인수할 임차보증금"))).toBe(true);
  expect(evidenceToText(evidence)).toContain("인수 43,500,000원");
});
