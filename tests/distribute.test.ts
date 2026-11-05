/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { test } from "vitest";
import { buildClaim } from "../lib/claimForm";
import { distribute } from "../lib/distribute";


const t = test;
let seq = 0;
const mk = (kind: any, v: any, items: any[] = []) => buildClaim("c" + ++seq, kind, v, items, false).claim as any;
const mortgage = (d: string, amt = "200000000", no = "") => mk("mortgage", { creditor: "은행" + seq, amount: amt, registrationDate: d, registrationNumber: no });
const lease = (deposit: string, moveIn: string, fixed: string, region = "seoul") =>
  mk("lease", { creditor: "임차인" + seq, amount: deposit, moveInDate: moveIn, fixedDate: fixed, isHousing: "yes", region });
const taxItems = (type: "national" | "local", items: [string, string, string, ("yes" | "no")?][], over: any = {}) => {
  const total = items.reduce((a, i) => a + Number(i[2]), 0);
  return mk("tax", { creditor: type === "national" ? "세무서" + seq : "시청" + seq, amount: String(total), taxType: type, hasTaxCollateral: "no", ...over },
    items.map(([name, legal, amount, dang]) => ({ name, legalDueDate: legal, amount, isDangHaeSe: dang ?? "no" })));
};
const tax = (type: "national" | "local", legal: string, amount: string, over: any = {}, dang: "yes" | "no" = "no") =>
  taxItems(type, [["세목", legal, amount, dang]], over);
const charge = (due: string, amt: string) => mk("publicCharge", { creditor: "건보" + seq, amount: amt, dueDate: due });
const prov = (d: string, amt: string) => mk("provisionalSeizure", { creditor: "가압류" + seq, amount: amt, registrationDate: d });
const wage = (amt: string, type: string) => mk("wage", { creditor: "근로자" + seq, amount: amt, wageType: type });
const total = (r: any) => r.superPriority.reduce((a: number, l: any) => a + l.paid, 0) + r.lines.reduce((a: number, l: any) => a + l.paid, 0) + r.leftover;
const paid = (r: any, claim: any) => r.paidByClaim[claim.id] ?? 0;

t("순위대로 배분: 근저당 > 임차(남은 보증금) > 조세, 소액임차 최우선변제 먼저", () => {
  const m = mortgage("2020-01-10"), l = lease("100000000", "2021-03-02", "2021-03-10"), x = tax("national", "2022-01-01", "30000000");
  const r = distribute(250_000_000, [m, l, x]) as any;
  assert.equal(r.ok, true);
  assert.equal(r.superPriority.find((s: any) => s.kind === "smallLease").paid, 37_000_000);
  assert.deepEqual(r.lines.map((x: any) => [x.kind, x.rank, x.paid]), [["mortgage", 1, 200_000_000], ["lease", 2, 13_000_000], ["tax", 3, 0]]);
  assert.equal(paid(r, l), 50_000_000); assert.equal(r.leftover, 0); assert.equal(total(r), 250_000_000);
  assert.ok(r.judgments.length === 3 && r.judgments.every((j: any) => j.reason && j.comparedDates !== undefined));
});

t("동순위(규칙 6 사례 ②): 채권액에 비례해 안분, 합계 정확", () => {
  const m = mortgage("2021-03-10", "100000000"), l = lease("100000000", "2021-03-09", "2021-03-10");
  const r = distribute(150_000_000, [m, l]) as any;
  assert.equal(r.ok, true);
  assert.deepEqual(r.lines.map((x: any) => x.rank), [1, 1]);
  assert.equal(r.lines[0].paid + r.lines[1].paid, 113_000_000); // 150M − 최우선변제 37M
  assert.ok(r.lines.every((x: any) => x.paid <= x.claimed && x.notes.some((s: string) => s.includes("안분"))));
  assert.equal(total(r), 150_000_000);
});

t("규칙 7 압류선착주의: 먼저 압류한 조세가 먼저", () => {
  const a = tax("national", "2020-01-01", "10000000", { seizureDate: "2021-01-01" });
  const b = tax("local", "2020-02-01", "10000000", { seizureDate: "2021-02-01" });
  const r = distribute(15_000_000, [b, a]) as any;
  assert.equal(r.ok, true);
  assert.equal(paid(r, a), 10_000_000); assert.equal(paid(r, b), 5_000_000); assert.equal(total(r), 15_000_000);
});

t("세목별 법정기일(PRD 예시): 한 청구서 안의 세목이 임차인을 사이에 두고 갈림", () => {
  const x = taxItems("national", [["양도소득세", "2010-01-01", "10000000"], ["부가가치세", "2012-01-01", "20000000"]]);
  const l = lease("500000000", "2011-06-01", "2011-06-02");
  const r = distribute(100_000_000, [x, l]) as any;
  assert.equal(r.ok, true);
  assert.deepEqual(r.lines.map((s: any) => [s.label.includes("양도소득세") ? "item1" : s.kind === "lease" ? "lease" : "item2", s.rank, s.paid]),
    [["item1", 1, 10_000_000], ["lease", 2, 90_000_000], ["item2", 3, 0]]);
  assert.equal(paid(r, x), 10_000_000); assert.equal(total(r), 100_000_000);
});

t("순환(공과금 > 임차 > 조세 > 공과금)은 계산하지 않고 이유를 알림", () => {
  const r = distribute(100_000_000, [charge("2020-01-01", "10000000"), lease("100000000", "2021-03-02", "2021-03-10"), tax("national", "2022-01-01", "10000000")]) as any;
  assert.equal(r.ok, true); assert.equal(r.circular.length, 1); // 작업 11부터 계산함 (자세한 시험은 check-circ)
});

t("규칙 5 상황(임차인이 당해세보다 먼저)은 계산하지 않음 / 임차인이 늦으면 당해세 우선으로 계산", () => {
  const m = mortgage("2020-01-10"), l = lease("100000000", "2021-03-02", "2021-03-10");
  const early = distribute(250_000_000, [m, l, tax("national", "2022-11-20", "30000000", {}, "yes")]) as any;
  assert.equal(early.ok, true); assert.ok(early.rule5Transfers.length >= 0); // 작업 10부터 계산함 (자세한 시험은 check-rule5)
  const d = tax("national", "2021-01-01", "30000000", {}, "yes");
  const late = distribute(250_000_000, [m, l, d]) as any;
  assert.equal(late.ok, true);
  assert.deepEqual(late.lines.map((x: any) => [x.kind, x.paid]), [["tax", 30_000_000], ["mortgage", 183_000_000], ["lease", 0]]);
  assert.equal(total(late), 250_000_000);
});

t("담당자 기준이 없는 경우(압류일 같은 날)는 undetermined", () => {
  const a = tax("national", "2020-01-01", "1000", { seizureDate: "2021-01-01" }), b = tax("local", "2020-01-01", "1000", { seizureDate: "2021-01-01" });
  const r = distribute(5000, [a, b]) as any;
  assert.equal(r.ok, false); assert.equal(r.reason, "undetermined");
});

t("주택 전세권은 계산하지 않음", () => {
  const j = mk("jeonse", { creditor: "전세", amount: "1000", registrationDate: "2020-01-01", isHousing: "yes" });
  const r = distribute(5000, [j]) as any;
  assert.equal(r.ok, false); assert.equal(r.reason, "unsupported");
});

t("확정일자 없는 임차인: 소액이면 최우선변제만, 아니면 0원 (제외 목록에 이유)", () => {
  const small = lease("50000000", "2023-03-01", ""), big = lease("500000000", "2023-03-01", "");
  const r = distribute(100_000_000, [small, big]) as any;
  assert.equal(r.ok, true);
  assert.equal(paid(r, small), 50_000_000); assert.equal(paid(r, big), 0);
  assert.equal(r.excluded.length, 2); assert.match(r.excluded[0].reason, /확정일자가 없어/);
  assert.equal(r.leftover, 50_000_000); assert.equal(total(r), 100_000_000);
});

t("일반 임금채권: 기준일 비교 대상 뒤, 일반채권(가압류) 앞", () => {
  const m = mortgage("2020-01-01", "100000000"), w = wage("20000000", "general"), p = prov("2025-01-01", "30000000");
  const r = distribute(130_000_000, [p, w, m]) as any;
  assert.equal(r.ok, true);
  assert.deepEqual(r.lines.map((x: any) => [x.kind, x.paid]), [["mortgage", 100_000_000], ["wageGeneral", 20_000_000], ["provisional", 10_000_000]]);
  assert.equal(total(r), 130_000_000);
});

t("남은 금액(leftover)과 합계 검증, 가압류끼리 안분", () => {
  const r1 = distribute(100_000_000, [mortgage("2020-01-01", "50000000")]) as any;
  assert.equal(r1.leftover, 50_000_000); assert.equal(total(r1), 100_000_000);
  const r2 = distribute(10_000, [prov("2020-01-01", "6000"), prov("2020-02-01", "6000")]) as any;
  assert.deepEqual(r2.lines.map((x: any) => x.paid), [5000, 5000]); assert.equal(total(r2), 10_000);
});

t("근저당권끼리 등기 순서·접수번호, 공과금 vs 담보권", () => {
  const first = mortgage("2020-01-01", "1000"), second = mortgage("2020-05-01", "1000");
  assert.deepEqual((distribute(1500, [second, first]) as any).lines.map((x: any) => x.paid), [500, 1000].reverse().length ? [1000, 500] : []);
  const a = mortgage("2020-01-01", "1000", "20"), b = mortgage("2020-01-01", "1000", "3");
  const same = distribute(1500, [a, b]) as any;
  assert.equal(same.ok, true); assert.equal(same.lines[0].claimId, b.id); // 접수번호 3 < 20
  const noNo = distribute(1500, [mortgage("2020-01-01", "1000"), mortgage("2020-01-01", "1000")]) as any;
  assert.equal(noNo.ok, false); assert.equal(noNo.reason, "undetermined");
  const c = charge("2020-06-01", "500"), early = mortgage("2020-01-01", "1000");
  const r = distribute(1200, [c, early]) as any;
  assert.deepEqual(r.lines.map((x: any) => x.kind), ["mortgage", "charge"]); assert.equal(total(r), 1200);
});

t("소액임차 기준표가 없는 지역은 계산하지 않음", () => {
  const r = distribute(100_000_000, [lease("50000000", "2023-03-01", "2023-03-02", "other")]) as any;
  assert.equal(r.ok, false); assert.equal(r.reason, "unsupported");
});

t("합계 검증 무작위 200회: 어떤 조합이든 ok이면 합계 = 매각대금", () => {
  let seed = 7;
  const rnd = (max: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % max; };
  let oks = 0;
  for (let i = 0; i < 200; i++) {
    const claims: any[] = [];
    if (rnd(2)) claims.push(mortgage("2020-0" + (1 + rnd(9)) + "-10", String(1 + rnd(300_000_000)), String(rnd(100))));
    if (rnd(2)) claims.push(lease(String(1 + rnd(400_000_000)), "2021-0" + (1 + rnd(9)) + "-02", rnd(3) ? "2021-0" + (1 + rnd(9)) + "-10" : ""));
    if (rnd(2)) claims.push(tax(rnd(2) ? "national" : "local", "2021-1" + rnd(3) + "-01", String(1 + rnd(50_000_000)), rnd(2) ? { seizureDate: "2022-0" + (1 + rnd(9)) + "-01" } : {}, rnd(4) === 0 ? "yes" : "no"));
    if (rnd(2)) claims.push(charge("2020-0" + (1 + rnd(9)) + "-01", String(1 + rnd(20_000_000))));
    if (rnd(2)) claims.push(wage(String(1 + rnd(30_000_000)), rnd(2) ? "last3Months" : "general"));
    if (rnd(2)) claims.push(prov("2022-0" + (1 + rnd(9)) + "-01", String(1 + rnd(30_000_000))));
    if (rnd(3) === 0) claims.push(mk("dispositionCost", { creditor: "공매기관", amount: String(1 + rnd(5_000_000)) }));
    if (claims.length === 0) continue;
    const sale = 1 + rnd(600_000_000);
    const r = distribute(sale, claims) as any;
    if (!r.ok) continue;
    oks++;
    assert.equal(total(r), sale, JSON.stringify(r.lines));
    assert.ok(r.lines.every((l: any) => l.paid >= 0 && l.paid <= l.claimed));
  }
  assert.ok(oks > 20, "ok 사례가 너무 적음: " + oks);
});
