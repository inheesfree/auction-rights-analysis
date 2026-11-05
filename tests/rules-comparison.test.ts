/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { test } from "vitest";
import { buildClaim } from "../lib/claimForm";
import { validateClaims } from "../lib/validate";
import {
  judgeMortgageVsTax, judgeLeaseVsTax, judgeMortgageVsLease, judgeTaxVsTax,
  judgeChargeVsSecured, judgeChargeVsLease, leaseBaseDate,
} from "../lib/rules";


const t = test;
const mk = (kind: any, v: any, items: any[] = []) => buildClaim("id-" + Math.random().toString(36).slice(2, 6), kind, v, items, false).claim as any;

const mortgage = (date: string) => mk("mortgage", { creditor: "A은행", amount: "200000000", registrationDate: date });
const lease = (moveIn: string, fixed: string) => mk("lease", { creditor: "B", amount: "100000000", moveInDate: moveIn, fixedDate: fixed, isHousing: "yes", region: "seoul" });
const tax = (type: "national" | "local", legal: string, over: any = {}) =>
  mk("tax", { creditor: type === "national" ? "○○세무서" : "○○시청", amount: "1000", taxType: type, hasTaxCollateral: "no", ...over },
    [{ name: "세목", legalDueDate: legal, amount: "1000", isDangHaeSe: "no" }]);
const part = (c: any) => ({ claim: c, item: c.items[0] });

// 규칙 1, 2
t("규칙 1: 국세 법정기일이 빠르면 국세, 늦으면 근저당, 같은 날은 국세(근거 미확인)", () => {
  const m = mortgage("2020-01-10");
  let j = judgeMortgageVsTax(m, part(tax("national", "2019-12-31")));
  assert.equal(j.winner, "b"); assert.equal(j.ruleNo, 1); assert.equal(j.legalBasisUnverified, false);
  j = judgeMortgageVsTax(m, part(tax("national", "2020-06-01")));
  assert.equal(j.winner, "a");
  j = judgeMortgageVsTax(m, part(tax("national", "2020-01-10")));
  assert.equal(j.winner, "b"); assert.equal(j.legalBasisUnverified, true);
  assert.equal(j.comparedDates.length, 2); assert.match(j.law!, /국세기본법 제35조/);
});
t("규칙 2: 지방세", () => {
  const j = judgeMortgageVsTax(mortgage("2020-01-10"), part(tax("local", "2020-06-01")));
  assert.equal(j.ruleNo, 2); assert.equal(j.winner, "a"); assert.match(j.law!, /지방세기본법 제71조/);
});
t("규칙 1: 당해세는 이 규칙으로 판단하지 않음", () => {
  const c = tax("national", "2022-11-20");
  assert.throws(() => judgeMortgageVsTax(mortgage("2020-01-10"), { claim: c, item: { ...c.items[0], isDangHaeSe: true } }), RangeError);
});

// 규칙 4
t("규칙 4: 임차인 기준일(늦은 날) vs 조세 법정기일", () => {
  const l = lease("2021-03-02", "2021-03-10");
  assert.equal(leaseBaseDate(l), "2021-03-10");
  assert.equal(judgeLeaseVsTax(l, part(tax("national", "2021-04-01"))).winner, "a");
  assert.equal(judgeLeaseVsTax(l, part(tax("national", "2021-03-01"))).winner, "b");
  const same = judgeLeaseVsTax(l, part(tax("local", "2021-03-10")));
  assert.equal(same.winner, "b"); assert.equal(same.legalBasisUnverified, true);
});
t("규칙 4: 확정일자 없는 임차인은 순위 비교 대상이 아님(오류)", () => {
  assert.throws(() => judgeLeaseVsTax(lease("2021-03-02", ""), part(tax("national", "2021-04-01"))), RangeError);
});

// 규칙 6
t("규칙 6: 담당자 제공 3사례 + 일반화 표", () => {
  const m = mortgage("2021-03-10");
  const w = (n: string, f: string) => judgeMortgageVsLease(m, lease(n, f));
  assert.equal(w("2021-03-09", "2021-03-09").winner, "b"); // ①
  assert.equal(w("2021-03-09", "2021-03-10").winner, "equal"); // ②
  assert.equal(w("2021-03-10", "2021-03-10").winner, "a"); // ③
  assert.equal(w("2021-03-10", "2021-03-09").winner, "a");
  assert.equal(w("2021-03-09", "2021-03-11").winner, "a");
  assert.equal(w("2021-03-11", "2021-03-11").winner, "a");
  const normal = w("2021-03-01", "2021-03-05");
  assert.equal(normal.winner, "b"); assert.equal(normal.legalBasisUnverified, false);
  assert.equal(w("2021-03-09", "2021-03-10").legalBasisUnverified, true);
  assert.equal(w("2021-03-10", "2021-03-10").legalBasisUnverified, true);
  assert.equal(w("2021-03-09", "2021-03-10").comparedDates.length, 3);
});
t("규칙 6: 확정일자 없는 임차인은 오류", () => {
  assert.throws(() => judgeMortgageVsLease(mortgage("2021-03-10"), lease("2021-03-01", "")), RangeError);
});

// 규칙 7
t("규칙 7: 압류선착주의", () => {
  const n = tax("national", "2020-01-01", { seizureDate: "2021-01-01" });
  const l = tax("local", "2020-01-01", { seizureDate: "2021-02-01" });
  assert.equal(judgeTaxVsTax(n, l).winner, "a");
  assert.equal(judgeTaxVsTax(l, n).winner, "b");
  const onlyN = tax("national", "2020-01-01", { seizureDate: "2021-01-01" });
  const noSeize = tax("local", "2019-01-01"); // 법정기일이 더 빨라도 압류가 우선
  assert.equal(judgeTaxVsTax(onlyN, noSeize).winner, "a");
  assert.equal(judgeTaxVsTax(noSeize, onlyN).winner, "b");
});
t("규칙 7: 압류 없으면 안분(근거 미확인), 법정기일로 정하지 않음", () => {
  const j = judgeTaxVsTax(tax("national", "2018-01-01"), tax("local", "2022-01-01"));
  assert.equal(j.winner, "equal"); assert.equal(j.legalBasisUnverified, true);
});
t("규칙 7: 납세담보는 압류선착보다 우선", () => {
  const n = tax("national", "2020-01-01", { seizureDate: "2021-01-01" });
  const l = tax("local", "2020-01-01", { seizureDate: "2022-01-01", hasTaxCollateral: "yes" });
  const j = judgeTaxVsTax(n, l);
  assert.equal(j.winner, "b"); assert.match(j.law!, /제37조/);
});
t("규칙 7: 담당자 기준이 없는 경우는 undetermined", () => {
  const same = judgeTaxVsTax(tax("national", "2020-01-01", { seizureDate: "2021-01-01" }), tax("local", "2020-01-01", { seizureDate: "2021-01-01" }));
  assert.equal(same.winner, "undetermined");
  const both = judgeTaxVsTax(tax("national", "2020-01-01", { hasTaxCollateral: "yes" }), tax("local", "2020-01-01", { hasTaxCollateral: "yes" }));
  assert.equal(both.winner, "undetermined");
  const part1 = judgeTaxVsTax(tax("national", "2020-01-01", { hasParticipatingSeizure: "yes" }), tax("local", "2020-01-01"));
  assert.equal(part1.winner, "undetermined");
  // 같은 종류끼리도 같은 방식(압류선착주의·안분)을 적용하되 AI 가정으로 표시 (사례 2)
  const sameType = judgeTaxVsTax(tax("national", "2020-01-01"), tax("national", "2021-01-01"));
  assert.equal(sameType.winner, "equal"); assert.equal(sameType.legalBasisUnverified, true); assert.match(sameType.reason, /AI 가정/);
  const early = judgeTaxVsTax(tax("national", "2020-01-01", { seizureDate: "2011-07-12" }), tax("national", "2021-01-01", { seizureDate: "2013-05-02" }));
  assert.equal(early.winner, "a");
});
t("규칙 7: 납세담보 여부가 비면 오류", () => {
  assert.throws(() => judgeTaxVsTax(tax("national", "2020-01-01", { hasTaxCollateral: "" }), tax("local", "2020-01-01")), RangeError);
});

// 규칙 10, 11
t("규칙 10: 공과금 납부기한 전 담보권은 담보권, 이후는 공과금, 같은 날은 공과금", () => {
  const charge = mk("publicCharge", { creditor: "건보공단", amount: "5000", dueDate: "2020-06-01" });
  let j = judgeChargeVsSecured(charge, mortgage("2020-01-01"));
  assert.equal(j.winner, "b"); assert.equal(j.legalBasisUnverified, false); assert.match(j.law!, /제85조/);
  j = judgeChargeVsSecured(charge, mortgage("2020-07-01"));
  assert.equal(j.winner, "a"); assert.equal(j.legalBasisUnverified, true);
  j = judgeChargeVsSecured(charge, mortgage("2020-06-01"));
  assert.equal(j.winner, "a");
});
t("규칙 11: 공과금 납부기한이 임차인 기준일보다 빠를 때만 공과금 우선 (같은 날·늦으면 임차보증금)", () => {
  const charge = (due: string) => mk("publicCharge", { creditor: "건보공단", amount: "5000", dueDate: due });
  const l = lease("2021-03-02", "2021-03-10"); // 임차인 기준일 2021-03-10
  const early = judgeChargeVsLease(charge("2020-06-01"), l);
  assert.equal(early.winner, "a"); assert.equal(early.legalBasisUnverified, true); assert.equal(early.comparedDates.length, 2);
  assert.equal(judgeChargeVsLease(charge("2021-03-10"), l).winner, "b"); // 같은 날
  assert.equal(judgeChargeVsLease(charge("2030-01-01"), l).winner, "b"); // 납부기한이 늦음
  assert.throws(() => judgeChargeVsLease(charge("2020-06-01"), lease("2010-01-01", "")), RangeError);
});

// 입력 보완 (확정일자 없는 임차인 안내, 납세담보 필수)
t("확정일자 없는 임차인: 계산을 막지 않고 안내만", () => {
  const r = validateClaims([mortgage("2020-01-10"), lease("2021-03-02", "")]);
  assert.equal(r.canCalculate, true); assert.equal(r.notices.length, 1);
  assert.match(r.notices[0].message, /소액임차인에 해당하는 경우/);
});
t("전입일이 비면 여전히 막음 / 납세담보 여부 없으면 막음", () => {
  assert.equal(validateClaims([lease("", "2021-03-10")]).canCalculate, false);
  const r = validateClaims([tax("national", "2020-01-01", { hasTaxCollateral: "" })]);
  assert.ok(r.issues.some((i) => i.message.includes("납세담보 여부")));
  assert.equal(validateClaims([tax("national", "2020-01-01")]).canCalculate, true);
});
