/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { test } from "vitest";
import { buildClaim } from "../lib/claimForm";
import { prorate } from "../lib/prorate";
import { findSmallLeaseRow, decideSmallLease } from "../lib/smallLease";
import { allocateSuperPriority } from "../lib/superPriority";
import { validateClaims } from "../lib/validate";


const t = test;
let seq = 0;
const mk = (kind: any, v: any, items: any[] = []) => buildClaim("c" + ++seq, kind, v, items, false).claim as any;
const mortgage = (d: string, amt = "200000000") => mk("mortgage", { creditor: "A은행", amount: amt, registrationDate: d });
const lease = (deposit: string, moveIn: string, fixed: string, region = "seoul") =>
  mk("lease", { creditor: "임차인" + seq, amount: deposit, moveInDate: moveIn, fixedDate: fixed, isHousing: "yes", region });
const cost = (amt: string) => mk("dispositionCost", { creditor: "공매기관", amount: amt });
const wage = (amt: string, type = "last3Months") => mk("wage", { creditor: "근로자", amount: amt, wageType: type });
const sumPaid = (r: any) => r.lines.reduce((a: number, l: any) => a + l.paid, 0);

t("prorate: 합계가 항상 정확히 total과 같음 (무작위 500회, 큰 금액 포함)", () => {
  let seed = 12345;
  const rnd = (max: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % max; };
  for (let i = 0; i < 500; i++) {
    const k = 1 + rnd(5);
    const weights = Array.from({ length: k }, () => 1 + rnd(i % 2 ? 1_000_000_000_000 : 1000));
    const sum = weights.reduce((a, b) => a + b, 0);
    const total = rnd(Math.min(sum, Number.MAX_SAFE_INTEGER));
    const { shares } = prorate(total, weights);
    assert.equal(shares.reduce((a, b) => a + b, 0), total);
    shares.forEach((s) => assert.ok(Number.isInteger(s) && s >= 0));
  }
});
t("prorate: 나누어떨어지는 경우·1원 나머지", () => {
  assert.deepEqual(prorate(100, [1, 1, 3]).shares, [20, 20, 60]);
  const r = prorate(100, [1, 1, 1]);
  assert.deepEqual(r.shares, [34, 33, 33]); assert.equal(r.remainderWon, 1);
  assert.deepEqual(prorate(80_000_000, [50_000_000, 100_000_000]).shares, [26_666_667, 53_333_333]);
  assert.deepEqual(prorate(10, [0, 0]).shares, [0, 0]);
});

t("소액임차 기준표: 시행일 경계와 범위 밖", () => {
  assert.equal(findSmallLeaseRow("seoul", "2023-02-21")!.priorityAmount, 55_000_000);
  assert.equal(findSmallLeaseRow("seoul", "2023-02-20")!.priorityAmount, 50_000_000);
  assert.equal(findSmallLeaseRow("seoul", "2018-09-18")!.priorityAmount, 37_000_000);
  assert.equal(findSmallLeaseRow("seoul", "2010-07-26")!.priorityAmount, 25_000_000);
  assert.equal(findSmallLeaseRow("seoul", "2010-07-25"), null);
  assert.equal(findSmallLeaseRow("other", "2023-03-01"), null);
});
t("소액임차 판정: 기준 이하만, 최우선변제액은 min(보증금, 일정액)", () => {
  const base = (d: string, f: string, dep: string) => decideSmallLease(lease(dep, d, f), []);
  const eq = base("2023-03-01", "2023-03-02", "165000000"); // 한도와 같음 → 소액
  assert.equal(eq.status, "small"); assert.equal((eq as any).entitlement, 55_000_000);
  assert.equal(base("2023-03-01", "2023-03-02", "165000001").status, "notSmall");
  assert.equal((base("2023-03-01", "2023-03-02", "40000000") as any).entitlement, 40_000_000);
});
t("소액임차 기준 시점: 선순위 담보물권이 있으면 그 설정일, 없으면 임차인 기준일", () => {
  const l = lease("100000000", "2021-03-02", "2021-03-10");
  const withM = decideSmallLease(l, [mortgage("2020-01-10"), mortgage("2022-05-01"), l]) as any;
  assert.equal(withM.baseDate, "2020-01-10"); assert.equal(withM.entitlement, 37_000_000); // 2018 표: 1.1억 이하
  const noM = decideSmallLease(l, [l]) as any;
  assert.equal(noM.baseDate, "2021-03-10"); assert.equal(noM.entitlement, 37_000_000); // 2021-05-11 시행 전이라 2018 표
  const later = decideSmallLease(lease("100000000", "2021-06-01", "2021-06-02"), []) as any;
  assert.equal(later.entitlement, 50_000_000); // 2021-05-11 이후라 2021 표: 1.5억 이하, 5,000만원
  const noFixed = decideSmallLease(lease("100000000", "2021-03-02", ""), []) as any;
  assert.equal(noFixed.baseDate, "2021-03-02"); assert.equal(noFixed.status, "small"); // 확정일자 없어도 소액임차
});

t("배분: 체납처분비 → 소액임차·임금 (재원 충분)", () => {
  const m = mortgage("2020-01-10");
  const l = lease("60000000", "2021-03-02", "2021-03-10");
  const r = allocateSuperPriority(250_000_000, [m, cost("3000000"), l, wage("10000000")]) as any;
  assert.equal(r.ok, true);
  assert.equal(r.lines[0].kind, "dispositionCost"); assert.equal(r.lines[0].paid, 3_000_000);
  const leaseLine = r.lines.find((x: any) => x.kind === "smallLease");
  assert.equal(leaseLine.paid, 37_000_000);
  assert.equal(r.remaining, 250_000_000 - 3_000_000 - 37_000_000 - 10_000_000);
  assert.equal(sumPaid(r) + r.remaining, 250_000_000);
  assert.equal(r.smallLeasePaid[l.id], 37_000_000);
});
t("배분: 소액임차 합계가 매각대금 1/2 초과 → 안분", () => {
  const a = lease("100000000", "2023-03-01", "2023-03-02"), b = lease("100000000", "2023-03-01", "2023-03-02");
  const r = allocateSuperPriority(100_000_000, [a, b, wage("50000000")]) as any;
  const leases = r.lines.filter((x: any) => x.kind === "smallLease");
  assert.deepEqual(leases.map((x: any) => x.paid), [25_000_000, 25_000_000]);
  assert.ok(leases[0].notes.some((s: string) => s.includes("2분의 1")));
  assert.equal(r.remaining, 0); assert.equal(sumPaid(r) + r.remaining, 100_000_000);
});
t("배분: 재원 부족 시 소액임차와 임금채권을 채권액에 비례해 안분", () => {
  const l = lease("100000000", "2023-03-01", "2023-03-02");
  const r = allocateSuperPriority(100_000_000, [cost("20000000"), l, wage("100000000")]) as any;
  const lineL = r.lines.find((x: any) => x.kind === "smallLease"), lineW = r.lines.find((x: any) => x.kind === "wage");
  assert.equal(lineL.paid, 26_666_667); assert.equal(lineW.paid, 53_333_333);
  assert.equal(r.remaining, 0); assert.equal(sumPaid(r) + r.remaining, 100_000_000);
  assert.ok(lineW.notes.some((s: string) => s.includes("안분")));
});
t("배분: 체납처분비가 매각대금보다 크면 매각대금까지만", () => {
  const r = allocateSuperPriority(10_000_000, [cost("15000000"), lease("50000000", "2023-03-01", "2023-03-02")]) as any;
  assert.equal(r.lines[0].paid, 10_000_000);
  assert.equal(r.lines.find((x: any) => x.kind === "smallLease").paid, 0);
  assert.equal(r.remaining, 0);
});
t("배분: 소액임차가 아닌 임차인과 일반 임금채권은 이 단계에서 제외", () => {
  const r = allocateSuperPriority(500_000_000, [lease("300000000", "2023-03-01", "2023-03-02"), wage("5000000", "general")]) as any;
  assert.equal(r.lines.length, 0); assert.equal(r.remaining, 500_000_000);
});
t("배분: 기준표에 없는 지역·시기는 계산을 멈추고 이유를 알림", () => {
  const r = allocateSuperPriority(100_000_000, [lease("50000000", "2023-03-01", "2023-03-02", "metro")]) as any;
  assert.equal(r.ok, false); assert.match(r.unsupported[0], /기준표가 없는 지역/);
  const old = allocateSuperPriority(100_000_000, [mortgage("2005-01-01"), lease("50000000", "2005-02-01", "2005-02-02")]) as any;
  assert.equal(old.ok, false);
});

t("입력 검사: 임차인 소재지 구분 필수, 상가는 월세 입력 가능하지만 아직 계산하지 않음", () => {
  const noRegion = mk("lease", { creditor: "B", amount: "1", moveInDate: "2021-03-02", fixedDate: "2021-03-10", isHousing: "yes" });
  assert.ok(validateClaims([noRegion]).issues.some((i) => i.message.includes("소재지 구분")));
  const shop = buildClaim("s1", "lease", { creditor: "상가임차", amount: "50000000", moveInDate: "2021-03-02", fixedDate: "2021-03-10", isHousing: "no", monthlyRent: "1,000,000" }, [], false).claim as any;
  assert.equal(shop.monthlyRent, 1_000_000);
  const v = validateClaims([shop]);
  assert.equal(v.unsupported.length, 1); assert.equal(v.canCalculate, false);
  const house = buildClaim("h1", "lease", { creditor: "B", amount: "1", isHousing: "yes", monthlyRent: "5000" }, [], false).claim as any;
  assert.equal(house.monthlyRent, null); // 주택이면 월세는 받지 않음
  const nf = validateClaims([lease("100000000", "2021-03-02", "")]);
  assert.equal(nf.canCalculate, true); assert.match(nf.notices[0].message, /소액임차인에 해당하는 경우/);
});
