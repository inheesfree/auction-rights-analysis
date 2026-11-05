/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { test } from "vitest";
import { buildClaim } from "../lib/claimForm";
import { absorbCycle } from "../lib/circular";
import { distribute } from "../lib/distribute";


const t = test;
let seq = 0;
const mk = (kind: any, v: any, items: any[] = []) => buildClaim("c" + ++seq, kind, v, items, false).claim as any;
const mortgage = (d: string, amt = "100000000") => mk("mortgage", { creditor: "A은행", amount: amt, registrationDate: d });
const lease = (deposit: string, moveIn = "2021-03-02", fixed = "2021-03-10") =>
  mk("lease", { creditor: "B임차인" + seq, amount: deposit, moveInDate: moveIn, fixedDate: fixed, isHousing: "yes", region: "seoul" });
const charge = (amt: string, due = "2020-06-01") => mk("publicCharge", { creditor: "건보공단", amount: amt, dueDate: due });
const taxOf = (items: [string, string, string][], over: any = {}) =>
  mk("tax", { creditor: "세무서" + seq, amount: String(items.reduce((a, i) => a + Number(i[2]), 0)), taxType: "national", hasTaxCollateral: "no", ...over },
    items.map(([name, legal, amount]) => ({ name, legalDueDate: legal, amount, isDangHaeSe: "no" })));
const tax = (amt: string, legal = "2022-01-01") => taxOf([["세목", legal, amt]]);
const prov = (amt: string) => mk("provisionalSeizure", { creditor: "가압류", amount: amt, registrationDate: "2025-01-01" });
const sum = (r: any) => r.superPriority.reduce((a: number, l: any) => a + l.paid, 0) + r.lines.reduce((a: number, l: any) => a + l.paid, 0) + r.leftover;
const byKind = (r: any, kind: string) => r.lines.find((l: any) => l.kind === kind);

t("담당자 제공 예시(순환 유형 1): 임차 10 · 공과금 20 · 조세 30, 배분재원 30 → 5 · 5 · 20", () => {
  // 순위: 조세 > 공과금, 공과금 > 임차, 임차 > 조세. 멤버 순서 [임차, 공과금, 조세]
  const M = 1_000_000;
  const { finals, detail } = absorbCycle(30 * M, [
    { key: "A", label: "임차인", amount: 10 * M, beatsIndex: 2 },
    { key: "B", label: "공과금", amount: 20 * M, beatsIndex: 0 },
    { key: "C", label: "조세", amount: 30 * M, beatsIndex: 1 },
  ]);
  assert.deepEqual(finals, [5 * M, 5 * M, 20 * M]);
  assert.deepEqual(detail.members.map((m) => [m.first, m.absorbed, m.lost]), [[5 * M, 5 * M, 5 * M], [10 * M, 5 * M, 10 * M], [15 * M, 10 * M, 5 * M]]);
  assert.equal(detail.shortage, true);
});
t("재원이 충분하면 순환 영향 없이 전액", () => {
  const { finals, detail } = absorbCycle(100, [
    { key: "A", label: "a", amount: 10, beatsIndex: 1 }, { key: "B", label: "b", amount: 20, beatsIndex: 2 }, { key: "C", label: "c", amount: 30, beatsIndex: 0 },
  ]);
  assert.deepEqual(finals, [10, 20, 30]); assert.equal(detail.shortage, false);
});
t("순환 계산: 어느 채권부터 계산해도 같은 결과 (입력 순서를 바꿔도 동일)", () => {
  const mkAll = () => [lease("120000000"), charge("240000000"), tax("360000000")];
  const [l1, c1, x1] = mkAll();
  const r1 = distribute(360_000_000, [l1, c1, x1]) as any;
  const [l2, c2, x2] = mkAll();
  const r2 = distribute(360_000_000, [x2, c2, l2]) as any;
  const finals = (r: any) => [byKind(r, "lease").paid, byKind(r, "charge").paid, byKind(r, "tax").paid];
  assert.deepEqual(finals(r1), [60_000_000, 60_000_000, 240_000_000]);
  assert.deepEqual(finals(r2), finals(r1));
});
t("distribute: 담당자 예시를 1.2배수로 환산 (임차 1.2억 · 공과금 2.4억 · 조세 3.6억, 재원 3.6억)", () => {
  const r = distribute(360_000_000, [lease("120000000"), charge("240000000"), tax("360000000")]) as any;
  assert.equal(r.ok, true);
  assert.deepEqual(r.lines.map((l: any) => l.rank), [1, 1, 1]);
  assert.equal(r.circular.length, 1); assert.equal(r.circular[0].pool, 360_000_000);
  assert.ok(r.lines.every((l: any) => l.notes.some((s: string) => s.includes("순환 배분"))));
  assert.equal(r.leftover, 0); assert.equal(sum(r), 360_000_000);
  assert.ok(r.judgments.some((j: any) => j.ruleNo === 11) && r.judgments.some((j: any) => j.ruleNo === 12) && r.judgments.some((j: any) => j.ruleNo === 4));
});
t("재원이 충분하면 순환이어도 전액 배분하고 남은 금액이 생김", () => {
  const r = distribute(1_000_000_000, [lease("120000000"), charge("240000000"), tax("360000000")]) as any;
  assert.deepEqual([byKind(r, "lease").paid, byKind(r, "charge").paid, byKind(r, "tax").paid], [120_000_000, 240_000_000, 360_000_000]);
  assert.equal(r.leftover, 280_000_000); assert.equal(r.circular[0].shortage, false); assert.equal(sum(r), 1_000_000_000);
});
t("순환 앞 단계(근저당)와 뒤 단계(가압류)가 있으면 앞에서 먼저 배분하고 남은 재원으로 순환 계산", () => {
  const m = mortgage("2020-01-10", "100000000"), p = prov("50000000");
  const r = distribute(500_000_000, [m, lease("120000000"), charge("240000000"), tax("360000000"), p]) as any;
  assert.equal(r.ok, true);
  assert.equal(byKind(r, "mortgage").paid, 100_000_000); assert.equal(byKind(r, "mortgage").rank, 1);
  assert.equal(r.circular[0].pool, 400_000_000); // 근저당 1억 뒤 남은 4억을 순환 3건이 나눔
  assert.equal(byKind(r, "provisional").paid, 0); assert.equal(sum(r), 500_000_000);
});
t("순환 뒤에 가압류가 있고 재원이 남으면 가압류가 받음", () => {
  const r = distribute(800_000_000, [lease("120000000"), charge("240000000"), tax("360000000"), prov("50000000")]) as any;
  assert.equal(byKind(r, "provisional").paid, 50_000_000); assert.equal(byKind(r, "provisional").rank, 2);
  assert.equal(r.leftover, 30_000_000); assert.equal(sum(r), 800_000_000);
});
t("그 밖의 순환은 계산하지 않음: 세 종류가 아닌 조합", () => {
  const m = mortgage("2020-01-01", "1000");
  const n1 = taxOf([["양도세", "2019-01-01", "1000"]], { seizureDate: "2022-01-01" });
  const l1 = taxOf([["재산세", "2021-01-01", "1000"]], { taxType: "local", seizureDate: "2021-06-01" });
  const r = distribute(5000, [m, n1, l1]) as any;
  assert.equal(r.ok, false); assert.equal(r.reason, "cycle"); assert.match(r.messages[0], /다루지 않는 경우/);
});
t("그 밖의 순환은 계산하지 않음: 세 종류에 세목이 더 얽힌 경우(4건)", () => {
  const x = taxOf([["세목1", "2022-01-01", "100000000"], ["세목2", "2023-01-01", "100000000"]]);
  const r = distribute(100_000_000, [lease("120000000"), charge("240000000"), x]) as any;
  assert.equal(r.ok, false); assert.equal(r.reason, "cycle");
});
t("순환 조합이어도 공과금 두 건 등 규칙 없는 쌍이 있으면 기존대로 멈춤", () => {
  const r = distribute(1000, [charge("100"), charge("100")]) as any;
  assert.equal(r.ok, false); assert.equal(r.reason, "unsupported");
});
t("무작위 300회: 순환이 끼어도 합계 = 매각대금, 0 ≤ 배분 ≤ 청구", () => {
  let seed = 4242;
  const rnd = (max: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % max; };
  let cycles = 0;
  for (let i = 0; i < 300; i++) {
    const claims: any[] = [
      lease(String(111_000_000 + rnd(300_000_000)), "2021-03-02", "2021-03-10"),
      charge(String(1 + rnd(300_000_000)), "2020-0" + (1 + rnd(9)) + "-01"),
      tax(String(1 + rnd(300_000_000)), "2022-0" + (1 + rnd(9)) + "-01"),
    ];
    if (rnd(2)) claims.push(mortgage("2020-0" + (1 + rnd(9)) + "-10", String(1 + rnd(200_000_000))));
    if (rnd(2)) claims.push(prov(String(1 + rnd(100_000_000))));
    const sale = 1 + rnd(700_000_000);
    const r = distribute(sale, claims) as any;
    if (!r.ok) continue;
    assert.equal(sum(r), sale);
    assert.ok(r.lines.every((l: any) => Number.isInteger(l.paid) && l.paid >= 0 && l.paid <= l.claimed));
    if (r.circular.length > 0) cycles++;
  }
  assert.ok(cycles > 50, "순환 사례가 적음: " + cycles);
});
