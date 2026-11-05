/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { test } from "vitest";
import { buildClaim } from "../lib/claimForm";
import { distribute } from "../lib/distribute";


const t = test;
let seq = 0;
const mk = (kind: any, v: any, items: any[] = []) => buildClaim("c" + ++seq, kind, v, items, false).claim as any;
const mortgage = (d: string, amt = "200000000") => mk("mortgage", { creditor: "A은행", amount: amt, registrationDate: d });
const lease = (deposit: string, moveIn: string, fixed: string) =>
  mk("lease", { creditor: "B임차인" + seq, amount: deposit, moveInDate: moveIn, fixedDate: fixed, isHousing: "yes", region: "seoul" });
const dang = (legal: string, amt: string, type: "national" | "local" = "national", name = "종합부동산세") =>
  mk("tax", { creditor: "C" + seq, amount: amt, taxType: type, hasTaxCollateral: "no" }, [{ name, legalDueDate: legal, amount: amt, isDangHaeSe: "yes" }]);
const sum = (r: any) => r.superPriority.reduce((a: number, l: any) => a + l.paid, 0) + r.lines.reduce((a: number, l: any) => a + l.paid, 0) + r.leftover;
const paid = (r: any, c: any) => r.paidByClaim[c.id] ?? 0;

// 담당자 확인 예시(판단규칙_초안.md 규칙 5): 매각대금 2.5억, 근저당 2억(2020), 임차 (2021), 종부세 3천만(2022 당해세)
// 보증금 1억은 서울 2018 기준표(1.1억 이하)라서 소액임차 최우선변제가 끼므로, 소액임차가 아닌 1.2억으로 같은 구조를 시험한다.
t("규칙 5 예시: 종부세 0원, 근저당 2억 유지, 임차인 5천만원, 합계 = 매각대금", () => {
  const a = mortgage("2020-01-10"), b = lease("120000000", "2021-03-02", "2021-03-10"), c = dang("2022-11-20", "30000000");
  const r = distribute(250_000_000, [a, b, c]) as any;
  assert.equal(r.ok, true);
  assert.equal(paid(r, a), 200_000_000); assert.equal(paid(r, b), 50_000_000); assert.equal(paid(r, c), 0);
  assert.equal(sum(r), 250_000_000); assert.equal(r.leftover, 0);
  assert.equal(r.rule5Transfers.length, 1); assert.equal(r.rule5Transfers[0].amount, 30_000_000);
  assert.match(r.rule5Transfers[0].law, /국세기본법 제35조 제7항/);
  const lineB = r.lines.find((l: any) => l.kind === "lease"), lineC = r.lines.find((l: any) => l.kind === "tax");
  assert.ok(lineB.notes.some((s: string) => s.includes("규칙 5") && s.includes("2023.4.1."))); assert.ok(lineC.notes.some((s: string) => s.includes("규칙 5")));
  assert.ok(r.judgments.some((j: any) => j.ruleNo === 5 && j.rule5Adjustment === true));
});
t("임차인 부족액이 당해세 배분액보다 작으면 부족액까지만 (임차인 채권액 상한)", () => {
  const a = mortgage("2020-01-10"), b = lease("120000000", "2021-03-02", "2021-03-10"), c = dang("2022-11-20", "30000000");
  const r = distribute(345_000_000, [a, b, c]) as any; // 가상: 종부세 3천 근저당 2억 임차인 1.15억 → 부족 500만원
  assert.equal(paid(r, b), 120_000_000); assert.equal(paid(r, c), 25_000_000); assert.equal(paid(r, a), 200_000_000);
  assert.equal(r.rule5Transfers[0].amount, 5_000_000); assert.equal(sum(r), 345_000_000);
});
t("임차인이 이미 전액 배분받으면 조정 없음", () => {
  const a = mortgage("2020-01-10"), b = lease("120000000", "2021-03-02", "2021-03-10"), c = dang("2022-11-20", "30000000");
  const r = distribute(500_000_000, [a, b, c]) as any;
  assert.equal(r.rule5Transfers.length, 0); assert.equal(paid(r, c), 30_000_000); assert.equal(paid(r, b), 120_000_000);
  assert.equal(r.leftover, 150_000_000);
});
t("법정기일이 임차인보다 같거나 빠른 당해세에는 적용하지 않음 (당해세 그대로)", () => {
  const a = mortgage("2020-01-10"), b = lease("120000000", "2021-03-02", "2021-03-10");
  const sameDay = dang("2021-03-10", "30000000"), earlier = dang("2021-01-01", "30000000");
  const r1 = distribute(250_000_000, [a, b, sameDay]) as any;
  assert.equal(r1.rule5Transfers.length, 0); assert.equal(paid(r1, sameDay), 30_000_000); assert.equal(paid(r1, b), 20_000_000);
  const r2 = distribute(250_000_000, [a, b, earlier]) as any;
  assert.equal(r2.rule5Transfers.length, 0); assert.equal(paid(r2, earlier), 30_000_000);
  assert.ok(!r1.judgments.some((j: any) => j.rule5Adjustment));
});
t("당해세 두 건 중 임차인보다 늦은 것만 대신 변제", () => {
  const a = mortgage("2020-01-10"), b = lease("120000000", "2021-03-02", "2021-03-10");
  const both = mk("tax", { creditor: "세무서", amount: "40000000", taxType: "national", hasTaxCollateral: "no" }, [
    { name: "상속세", legalDueDate: "2021-01-01", amount: "10000000", isDangHaeSe: "yes" },
    { name: "종합부동산세", legalDueDate: "2022-11-20", amount: "30000000", isDangHaeSe: "yes" },
  ]);
  const r = distribute(250_000_000, [a, b, both]) as any;
  // 가상: 상속세 1천만 + 종부세 3천만 + 근저당 2억 = 2.4억 → 임차인 1천만원, 부족 1.1억
  const line = (name: string) => r.lines.find((l: any) => l.label.includes(name));
  assert.equal(line("상속세").paid, 10_000_000); assert.equal(line("종합부동산세").paid, 0); assert.equal(paid(r, b), 40_000_000);
  assert.equal(r.rule5Transfers.length, 1); assert.equal(paid(r, both), 10_000_000); assert.equal(sum(r), 250_000_000);
});
t("지방세 당해세는 지방세기본법 제71조 제6항 근거", () => {
  const a = mortgage("2020-01-10"), b = lease("120000000", "2021-03-02", "2021-03-10"), c = dang("2022-06-01", "30000000", "local", "재산세");
  const r = distribute(250_000_000, [a, b, c]) as any;
  assert.match(r.rule5Transfers[0].law, /지방세기본법 제71조 제6항/); assert.equal(paid(r, b), 50_000_000);
});
t("임차인이 둘이면 순위가 앞선 임차인부터 대신 변제", () => {
  const a = mortgage("2019-01-01", "100000000");
  const b1 = lease("120000000", "2020-03-01", "2020-03-02"), b2 = lease("120000000", "2021-03-01", "2021-03-02");
  const c = dang("2022-11-20", "50000000");
  const r = distribute(200_000_000, [a, b1, b2, c]) as any;
  // 가상: 종부세 5천 → 근저당 1억 → 임차인1 5천만 → 임차인2 0. 임차인1 부족 7천만 → 종부세 5천만 전부 이전
  assert.equal(paid(r, c), 0); assert.equal(paid(r, b1), 100_000_000); assert.equal(paid(r, b2), 0);
  assert.equal(sum(r), 200_000_000);
});
t("소액임차 최우선변제를 받은 임차인도 남은 보증금에 대해 적용, 합계 유지", () => {
  const a = mortgage("2020-01-10"), b = lease("100000000", "2021-03-02", "2021-03-10"), c = dang("2022-11-20", "30000000");
  const r = distribute(250_000_000, [a, b, c]) as any; // 소액임차 3,700만 먼저 → 남은 보증금 6,300만
  assert.equal(r.superPriority.find((s: any) => s.kind === "smallLease").paid, 37_000_000);
  // 최우선변제 3,700만원이 먼저 빠져 근저당은 2.13억 − 당해세 3천만 = 1.83억. 임차인은 3,700만 + 대신 변제 3천만 = 6,700만
  assert.equal(paid(r, a), 183_000_000); assert.equal(paid(r, c), 0); assert.equal(paid(r, b), 67_000_000);
  assert.equal(r.rule5Transfers[0].amount, 30_000_000);
  assert.equal(sum(r), 250_000_000);
});
t("무작위 300회: 규칙 5가 끼어도 합계 = 매각대금, 0 ≤ 배분 ≤ 청구, 근저당 배분은 가상 배분과 같음", () => {
  let seed = 99;
  const rnd = (max: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % max; };
  let applied = 0;
  for (let i = 0; i < 300; i++) {
    const claims: any[] = [];
    const m = mortgage("2020-0" + (1 + rnd(9)) + "-10", String(1 + rnd(300_000_000)));
    claims.push(m);
    claims.push(lease(String(111_000_000 + rnd(300_000_000)), "2021-0" + (1 + rnd(9)) + "-02", "2021-0" + (1 + rnd(9)) + "-10"));
    claims.push(dang("2022-" + (10 + rnd(3)) + "-20", String(1 + rnd(80_000_000)), "national"));
    // 같은 종류(국세) 조세 청구는 하나만 넣는다. 둘 이상이면 담당자 기준이 없어 계산을 멈춘다.
    if (rnd(2)) claims.push(dang("2021-0" + (1 + rnd(9)) + "-20", String(1 + rnd(30_000_000)), "local", "재산세"));
    const sale = 1 + rnd(600_000_000);
    const r = distribute(sale, claims) as any;
    if (!r.ok) continue;
    assert.equal(sum(r), sale);
    assert.ok(r.lines.every((l: any) => l.paid >= 0 && l.paid <= l.claimed));
    assert.equal(r.paidByClaim[m.id] ?? 0, r.lines.find((l: any) => l.claimId === m.id)?.paid ?? 0);
    if (r.rule5Transfers.length > 0) applied++;
  }
  assert.ok(applied > 20, "규칙 5가 적용된 사례가 적음: " + applied);
});
