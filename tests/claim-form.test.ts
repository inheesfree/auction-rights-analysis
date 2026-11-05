/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { test } from "vitest";
import { buildClaim, toClaimRow } from "../lib/claimForm";


const t = test;

t("근저당: 입력 글자 → 채권, 형식 다른 날짜도 읽음", () => {
  const { claim, unreadable } = buildClaim("c1", "mortgage",
    { creditor: "A은행", amount: "200,000,000원", registrationDate: "2020.1.10.", registrationNumber: "1234" }, [], false);
  assert.equal(claim.kind, "mortgage");
  assert.equal(claim.amount, 200000000);
  assert.equal((claim as any).registrationDate, "2020-01-10");
  assert.deepEqual(unreadable, []);
});
t("읽지 못한 값은 추측 없이 빈칸 + 알림", () => {
  const { claim, unreadable } = buildClaim("c2", "mortgage",
    { creditor: "A", amount: "2억", registrationDate: "2020-02-30" }, [], false);
  assert.equal(claim.amount, null);
  assert.equal((claim as any).registrationDate, null);
  assert.deepEqual(unreadable, ["채권액", "등기 접수일"]);
});
t("안 쓴 칸은 빈칸(알림 없음)", () => {
  const { claim, unreadable } = buildClaim("c3", "mortgage", {}, [], false);
  assert.equal(claim.amount, null); assert.equal(claim.creditor, ""); assert.deepEqual(unreadable, []);
});
t("임차인: 기준일 = 전입일·확정일자 중 늦은 날", () => {
  const { claim } = buildClaim("c4", "lease",
    { creditor: "B", amount: "100000000", moveInDate: "2021-03-02", fixedDate: "2021-03-10", isHousing: "yes" }, [], false);
  const row = toClaimRow(claim);
  assert.equal(row.baseDates.length, 1);
  assert.match(row.baseDates[0].text, /2021년 3월 10일/);
  assert.equal(row.baseDates[0].blank, false);
});
t("임차인: 확정일자 없으면 기준일을 정하지 않고 빈칸 표시", () => {
  const { claim } = buildClaim("c5", "lease", { creditor: "B", amount: "1", moveInDate: "2021-03-02" }, [], false);
  const row = toClaimRow(claim);
  assert.equal(row.baseDates.length, 2);
  assert.equal(row.baseDates[1].blank, true);
});
t("조세: 세목별 법정기일을 따로 보관·표시", () => {
  const { claim } = buildClaim("c6", "tax",
    { creditor: "○○세무서", amount: "50000000", taxType: "national" },
    [{ name: "종합부동산세", legalDueDate: "2022-11-20", amount: "30000000", isDangHaeSe: "yes" },
     { name: "양도소득세", legalDueDate: "", amount: "20000000" }], true);
  assert.equal(claim.kind, "tax");
  assert.equal((claim as any).items.length, 2);
  assert.equal(claim.isEntrusted, true);
  const row = toClaimRow(claim);
  assert.equal(row.baseDates.length, 2);
  assert.equal(row.baseDates[0].blank, false);
  assert.equal(row.baseDates[1].blank, true);
  assert.ok(row.notes.some((c) => c.text.includes("당해세")));
  assert.ok(row.notes.some((c) => c.text === "수임 채권"));
});
t("임금채권·체납처분비·공과금", () => {
  assert.equal((buildClaim("c7", "wage", { wageType: "last3Months" }, [], false).claim as any).wageType, "last3Months");
  assert.equal(buildClaim("c8", "dispositionCost", { amount: "1000" }, [], false).claim.kind, "dispositionCost");
  assert.equal(toClaimRow(buildClaim("c9", "publicCharge", { dueDate: "2021/5/1" }, [], false).claim).baseDates[0].text, "납부기한 2021년 5월 1일");
});
