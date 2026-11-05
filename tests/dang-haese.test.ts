/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { test } from "vitest";
import { buildClaim } from "../lib/claimForm";
import { distribute } from "../lib/distribute";
import { validateClaims } from "../lib/validate";


const t = test;
let seq = 0;
const mk = (kind: any, v: any, items: any[] = []) => buildClaim("c" + ++seq, kind, v, items, false).claim as any;
const taxOne = (type: "national" | "local", legal: string, amt: string, dang: "yes" | "no", over: any = {}) =>
  mk("tax", { creditor: type === "national" ? "세무서" + seq : "구청" + seq, amount: amt, taxType: type, hasTaxCollateral: "no", ...over },
    [{ name: "세목", legalDueDate: legal, amount: amt, isDangHaeSe: dang }]);
const sum = (r: any) => r.superPriority.reduce((a: number, l: any) => a + l.paid, 0) + r.lines.reduce((a: number, l: any) => a + l.paid, 0) + r.leftover;

t("사례1: 당해세(동작구청 교부청구)가 압류한 일반 국세(양천세무서)보다 먼저", () => {
  const claims = [
    mk("dispositionCost", { creditor: "한국자산관리공사", amount: "1000000" }),
    taxOne("national", "1997-02-03", "1500000", "no", { seizureDate: "1997-03-01" }),
    taxOne("local", "2000-01-01", "300000", "yes"),
    mk("mortgage", { creditor: "홍길동", amount: "30000000", registrationDate: "2014-02-05" }),
    mk("provisionalSeizure", { creditor: "", amount: "3000000", registrationDate: "2011-05-10" }),
  ];
  assert.equal(validateClaims(claims).canCalculate, true);
  const r = distribute(30_000_000, claims) as any;
  assert.equal(r.ok, true);
  assert.deepEqual(r.lines.map((l: any) => [l.label.includes("구청") ? "동작구청" : l.label.includes("세무서") ? "양천세무서" : l.kind, l.rank, l.paid]),
    [["동작구청", 1, 300_000], ["양천세무서", 2, 1_500_000], ["mortgage", 3, 24_727_273], ["provisional", 3, 2_472_727]]);
  assert.equal(sum(r), 30_000_000);
  const j = r.judgments.find((x: any) => x.ruleName.startsWith("당해세 우선"));
  assert.ok(j && j.winner !== "equal" && j.legalBasisUnverified === true);
  assert.ok(!r.judgments.some((x: any) => x.ruleName === "국세 vs 지방세")); // 압류선착(규칙 7 본문)은 쓰지 않음
});
t("당해세끼리(서로 다른 청구서)는 압류 여부와 상관없이 안분", () => {
  const a = taxOne("national", "2020-01-01", "600000", "yes", { seizureDate: "2020-02-01" });
  const b = taxOne("local", "2021-01-01", "600000", "yes");
  const r = distribute(1_000_000, [a, b]) as any;
  assert.deepEqual(r.lines.map((l: any) => [l.rank, l.paid]), [[1, 500_000], [1, 500_000]]);
  assert.ok(r.lines.every((l: any) => l.notes.some((s: string) => s.includes("동순위"))));
  const c = taxOne("national", "2020-01-01", "600000", "yes"), d = taxOne("national", "2021-01-01", "600000", "yes");
  assert.equal((distribute(1_000_000, [c, d]) as any).lines[0].paid, 500_000); // 같은 종류(국세) 당해세끼리도 안분
});
t("당해세는 납세담보·압류가 있는 일반 조세보다도 먼저", () => {
  const dang = taxOne("local", "2022-01-01", "400000", "yes");
  const general = taxOne("national", "2010-01-01", "400000", "no", { seizureDate: "2010-02-01", hasTaxCollateral: "yes" });
  const r = distribute(500_000, [general, dang]) as any;
  assert.equal(r.lines[0].label.includes("구청"), true); assert.equal(r.lines[0].paid, 400_000); assert.equal(r.lines[1].paid, 100_000);
});
t("둘 다 일반 조세면 기존대로 규칙 7(압류선착주의)", () => {
  const a = taxOne("national", "2020-01-01", "1000", "no", { seizureDate: "2021-01-01" }), b = taxOne("local", "2019-01-01", "1000", "no");
  const r = distribute(1500, [b, a]) as any;
  assert.equal(r.lines[0].label.includes("세무서"), true); assert.equal(r.lines[0].paid, 1000);
  assert.ok(r.judgments.some((x: any) => x.ruleName === "국세 vs 지방세"));
});
