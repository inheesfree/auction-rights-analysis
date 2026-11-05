/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { test } from "vitest";
import { buildClaim } from "../lib/claimForm";
import { distribute } from "../lib/distribute";
import { validateClaims } from "../lib/validate";


const t = test;
let seq = 0;
const mk = (kind: any, v: any, items: any[] = []) => buildClaim("c" + ++seq, kind, v, items, false).claim as any;
const mortgage = (d: string, amt = "200000000") => mk("mortgage", { creditor: "은행" + seq, amount: amt, registrationDate: d });
const lease = (deposit: string, moveIn: string, fixed: string) =>
  mk("lease", { creditor: "임차인" + seq, amount: deposit, moveInDate: moveIn, fixedDate: fixed, isHousing: "yes", region: "seoul" });
const taxItems = (type: "national" | "local", items: [string, string, string, ("yes" | "no")?][], over: any = {}) => {
  const total = items.reduce((a, i) => a + Number(i[2]), 0);
  return mk("tax", { creditor: type === "national" ? "세무서" + seq : "시청" + seq, amount: String(total), taxType: type, hasTaxCollateral: "no", ...over },
    items.map(([name, legal, amount, dang]) => ({ name, legalDueDate: legal, amount, isDangHaeSe: dang ?? "no" })));
};
const sum = (r: any) => r.superPriority.reduce((a: number, l: any) => a + l.paid, 0) + r.lines.reduce((a: number, l: any) => a + l.paid, 0) + r.leftover;
const itemLines = (r: any, name: string) => r.lines.find((l: any) => l.label.includes(name));

const prd = () => ({
  tax: taxItems("national", [["양도소득세", "2010-01-01", "10000000"], ["부가가치세", "2012-01-01", "20000000"]]),
  lease: lease("500000000", "2011-06-01", "2011-06-02"),
});

t("PRD 예시: 임차인(2011) 앞 세목(2010)만 선순위, 뒤 세목(2012)은 후순위", () => {
  const { tax, lease } = prd();
  const r = distribute(100_000_000, [tax, lease]) as any;
  assert.equal(itemLines(r, "양도소득세").rank, 1); assert.equal(itemLines(r, "부가가치세").rank, 3);
  assert.equal(r.lines.find((l: any) => l.kind === "lease").rank, 2);
  // 판단 근거: 세목 단위로 비교한 법정기일이 남아 있다
  const j = r.judgments.filter((x: any) => x.ruleNo === 4);
  assert.equal(j.length, 2);
  const winnerLabel = (x: any) => (x.winner === "a" ? x.a.label : x.b.label);
  const about = (x: any, name: string) => x.a.label.includes(name) || x.b.label.includes(name);
  assert.ok(winnerLabel(j.find((x: any) => about(x, "양도소득세"))).includes("양도소득세")); // 2010 < 임차인 2011 → 세목 우선
  assert.ok(winnerLabel(j.find((x: any) => about(x, "부가가치세"))).includes("임차")); // 2012 > 임차인 2011 → 임차인 우선
  assert.ok(j.every((x: any) => x.comparedDates.length === 2 && x.law));
  // 같은 청구서의 세목끼리는 서로 비교하지 않는다 (판단 2건뿐)
  assert.equal(r.judgments.length, 2);
});
t("임차인이 두 세목보다 모두 앞서거나 모두 뒤서면 세목이 같은 단계", () => {
  const items = () => taxItems("national", [["양도소득세", "2014-01-01", "10000000"], ["부가가치세", "2016-01-01", "20000000"]]);
  const early = distribute(100_000_000, [items(), lease("500000000", "2012-01-01", "2012-01-02")]) as any;
  assert.deepEqual([early.lines[0].kind, early.lines[1].rank, early.lines[2].rank], ["lease", 2, 2]);
  const late = items();
  const r2 = distribute(100_000_000, [late, lease("500000000", "2018-01-01", "2018-01-02")]) as any;
  assert.deepEqual(r2.lines.map((l: any) => l.rank), [1, 1, 2]);
  assert.equal(r2.lines[0].paid, 10_000_000); assert.equal(r2.lines[1].paid, 20_000_000); assert.equal(sum(r2), 100_000_000);
});
t("한 청구서 안의 당해세·일반 세목이 근저당권 앞뒤로 갈림", () => {
  const x = taxItems("national", [["종합부동산세", "2022-11-20", "30000000", "yes"], ["소득세", "2023-01-01", "20000000", "no"]]);
  const m = mortgage("2020-01-10", "200000000");
  const r = distribute(250_000_000, [m, x]) as any;
  assert.deepEqual(r.lines.map((l: any) => [l.label.includes("종합부동산세") ? "dang" : l.kind === "mortgage" ? "M" : "일반", l.rank, l.paid]),
    [["dang", 1, 30_000_000], ["M", 2, 200_000_000], ["일반", 3, 20_000_000]]);
  assert.equal(sum(r), 250_000_000);
});
t("같은 청구서의 세목들이 같은 단계에서 모자라면 세목 금액에 비례해 안분", () => {
  const x = taxItems("local", [["재산세", "2022-01-01", "6000"], ["자동차세", "2022-06-01", "3000"]]);
  const m = mortgage("2020-01-01", "1000");
  const r = distribute(7000, [m, x]) as any; // M 1000 → 남은 6000을 9000 청구에 안분
  const a = itemLines(r, "재산세"), b = itemLines(r, "자동차세");
  assert.equal(a.rank, 2); assert.equal(b.rank, 2);
  assert.deepEqual([a.paid, b.paid], [4000, 2000]); assert.equal(sum(r), 7000);
});
t("국세·지방세 압류선착이 세목 순서와 어긋나면 순환으로 멈춤", () => {
  const n = taxItems("national", [["양도세", "2019-01-01", "1000"]], { seizureDate: "2022-01-01" });
  const l = taxItems("local", [["재산세", "2021-01-01", "1000"]], { seizureDate: "2021-06-01" });
  const m = mortgage("2020-01-01", "1000"); // n(법정기일 2019) > M > l(법정기일 2021) 인데 압류선착은 l > n
  const r = distribute(5000, [m, n, l]) as any;
  assert.equal(r.ok, false); assert.equal(r.reason, "cycle");
});
t("세목이 같은 청구서에서 압류선착 순서와 세목 순서가 일치하면 계산", () => {
  const n = taxItems("national", [["양도세", "2019-01-01", "1000"]], { seizureDate: "2021-01-01" });
  const l = taxItems("local", [["재산세", "2021-01-01", "1000"]], { seizureDate: "2021-06-01" });
  const m = mortgage("2020-01-01", "1000");
  const r = distribute(3000, [m, l, n]) as any;
  assert.equal(r.ok, true);
  assert.deepEqual(r.lines.map((x: any) => x.kind), ["tax", "mortgage", "tax"]);
  assert.ok(r.lines[0].label.includes("양도세") && r.lines[2].label.includes("재산세"));
});
t("입력 검사: 채권액이 세목 합과 다르면 계산 전에 막음", () => {
  const bad = taxItems("national", [["양도세", "2010-01-01", "1000"], ["부가세", "2012-01-01", "2000"]], { amount: "9999" });
  const v = validateClaims([bad]);
  assert.equal(v.canCalculate, false); assert.ok(v.issues.some((i) => i.kind === "invalid"));
});
t("세목 이름이 비어 있어도 표시는 '세목'", () => {
  const x = taxItems("national", [["", "2010-01-01", "1000"]]);
  const r = distribute(1000, [x]) as any;
  assert.match(r.lines[0].label, /세목$/);
});
