// 공매재산명세서(울산 중구 공동주택) 사례의 배분 순서 — 담당자 정답 순서
// 강제징수비(0원) > 근저당권 > 임차인 > 압류한 국세 > 지방세 2곳(동순위) > 공과금
//
// 읽기 기준(담당자 확인): 기간으로 적힌 법정기일은 시작일자, 당해세는 별도 표기가 없으면 당해세가 아님.
// 소액임차 기준표에 광역시가 없어서(울산 중구는 광역시) 임차인 보증금을 서울 소액 기준(2023.2.21. 1.65억)을
// 넘는 2억원으로 두어 소액임차인이 되지 않게 했다. 순서만 확인하는 시험이다. 광역시 기준표가 들어오면 실제 값으로 바꾼다.

import assert from "node:assert/strict";
import { expect, test } from "vitest";
import { buildClaim } from "../lib/claimForm";
import { distribute } from "../lib/distribute";
import type { RightKind } from "../lib/types";
import { validateClaims } from "../lib/validate";

const claim = (kind: RightKind, values: Record<string, string>, items: Record<string, string>[] = []) =>
  buildClaim("s" + Math.random().toString(36).slice(2, 8), kind, values, items, false).claim;

function statementClaims(leaseDeposit: string) {
  return [
    claim("dispositionCost", { creditor: "(강제징수비)", amount: "0" }),
    claim("mortgage", { creditor: "농○○○○○", amount: "47261108", registrationDate: "2024-02-16" }),
    claim("lease", { creditor: "노○○", amount: leaseDeposit, moveInDate: "2025-01-22", fixedDate: "2025-01-23", isHousing: "yes", region: "seoul" }),
    claim("tax", { creditor: "동울산세무서", amount: "46318260", taxType: "national", hasTaxCollateral: "no", seizureDate: "2026-05-26" },
      [{ name: "(세목 미기재)", legalDueDate: "2025-05-31", amount: "46318260", isDangHaeSe: "no" }]),
    claim("tax", { creditor: "울산북구청", amount: "2895510", taxType: "local", hasTaxCollateral: "no" },
      [{ name: "(세목 미기재)", legalDueDate: "2025-12-10", amount: "2895510", isDangHaeSe: "no" }]),
    claim("tax", { creditor: "울산중구청", amount: "909160", taxType: "local", hasTaxCollateral: "no" },
      [{ name: "(세목 미기재)", legalDueDate: "2025-05-14", amount: "909160", isDangHaeSe: "no" }]),
    claim("publicCharge", { creditor: "국민건강보험공단", amount: "2978400", dueDate: "2026-02-10" }),
  ];
}

test("명세서 사례: 담당자 정답 순서와 같다 (임차인은 근저당 다음, 공과금은 맨 끝)", () => {
  const claims = statementClaims("200000000");
  expect(validateClaims(claims).canCalculate).toBe(true);
  const result = distribute(1_000_000_000, claims);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const byCreditor = (name: string) => result.lines.find((line) => line.label.includes(name))!;
  expect(byCreditor("농○○○○○").rank).toBe(1);
  expect(byCreditor("노○○").rank).toBe(2);
  expect(byCreditor("동울산세무서").rank).toBe(3);
  expect(byCreditor("울산북구청").rank).toBe(4);
  expect(byCreditor("울산중구청").rank).toBe(4); // 지방세 두 곳은 동순위
  expect(byCreditor("국민건강보험공단").rank).toBe(5);
  expect(result.lines).toHaveLength(6);
  expect(result.circular).toHaveLength(0); // 순환이 생기지 않는다
});

test("명세서 사례: 매각대금이 모자라면 앞 순위부터 받고 지방세 두 곳은 안분", () => {
  // 근저당 47,261,108 + 임차인 2억을 채우고도 모자라는 금액 → 근저당·임차인이 먼저 받아 뒤 순위는 0원
  const claims = statementClaims("200000000");
  const result = distribute(100_000_000, claims);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const paid = (name: string) => result.lines.find((line) => line.label.includes(name))!.paid;
  expect(paid("농○○○○○")).toBe(47_261_108);
  expect(paid("노○○")).toBe(52_738_892);
  expect(paid("동울산세무서") + paid("울산북구청") + paid("울산중구청") + paid("국민건강보험공단")).toBe(0);

  // 지방세 두 곳까지 내려오는 금액: 근저당 + 임차인 + 국세를 채우고 남는 돈을 지방세 두 곳이 채권액에 비례해 안분
  const enough = distribute(47_261_108 + 200_000_000 + 46_318_260 + 2_000_000, claims);
  assert.equal(enough.ok, true);
  if (!enough.ok) return;
  const p2 = (name: string) => enough.lines.find((line) => line.label.includes(name))!.paid;
  expect(p2("울산북구청") + p2("울산중구청")).toBe(2_000_000);
  expect(p2("울산북구청")).toBeGreaterThan(p2("울산중구청")); // 채권액이 더 큰 쪽이 더 받음
  expect(p2("국민건강보험공단")).toBe(0);
});
