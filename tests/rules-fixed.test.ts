/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { test } from "vitest";
import { buildClaim } from "../lib/claimForm";
import {
  judgeMortgageVsDangHaeSe, judgeMortgageVsProvisional,
  judgeWageVsTax, judgeChargeVsTax, judgeTaxVsProvisional, judgeMortgageVsTax,
} from "../lib/rules";


const t = test;
const mk = (kind: any, v: any, items: any[] = []) => buildClaim("id-" + Math.random().toString(36).slice(2, 6), kind, v, items, false).claim as any;
const mortgage = (d: string) => mk("mortgage", { creditor: "A은행", amount: "200000000", registrationDate: d });
const seizure = (d: string) => mk("provisionalSeizure", { creditor: "D", amount: "1000", registrationDate: d });
const tax = (type: "national" | "local", legal: string, dang: "yes" | "no" = "no", name = "세목") =>
  mk("tax", { creditor: "○○세무서", amount: "1000", taxType: type, hasTaxCollateral: "no" },
    [{ name, legalDueDate: legal, amount: "1000", isDangHaeSe: dang }]);
const part = (c: any) => ({ claim: c, item: c.items[0] });

t("규칙 3: 당해세는 날짜와 상관없이 근저당권보다 우선 (규칙 5 예시: 종부세 2022 vs 근저당 2020)", () => {
  const j = judgeMortgageVsDangHaeSe(mortgage("2020-01-10"), part(tax("national", "2022-11-20", "yes", "종합부동산세")));
  assert.equal(j.winner, "b"); assert.equal(j.ruleNo, 3); assert.match(j.law!, /제35조 제3항/);
  assert.equal(j.legalBasisUnverified, false); assert.equal(j.comparedDates.length, 2);
  // 날짜가 반대여도 결과는 같다
  assert.equal(judgeMortgageVsDangHaeSe(mortgage("2023-01-01"), part(tax("local", "2010-01-01", "yes", "재산세"))).winner, "b");
});
t("규칙 3: 일반 조세는 이 규칙 대상이 아니고, 규칙 1·2는 당해세를 받지 않음", () => {
  assert.throws(() => judgeMortgageVsDangHaeSe(mortgage("2020-01-10"), part(tax("national", "2019-01-01"))), RangeError);
  assert.throws(() => judgeMortgageVsTax(mortgage("2020-01-10"), part(tax("national", "2022-11-20", "yes"))), RangeError);
});

t("규칙 8: 근저당이 먼저면 근저당, 가압류가 먼저면 안분, 같은 날은 판단하지 않음", () => {
  assert.equal(judgeMortgageVsProvisional(mortgage("2019-01-01"), seizure("2020-01-01")).winner, "a");
  const prior = judgeMortgageVsProvisional(mortgage("2021-01-01"), seizure("2020-01-01"));
  assert.equal(prior.winner, "equal"); assert.equal(prior.legalBasisUnverified, true);
  const same = judgeMortgageVsProvisional(mortgage("2020-01-01"), seizure("2020-01-01"));
  assert.equal(same.winner, "undetermined"); assert.match(same.reason, /같은 날/);
});

t("규칙 9: 최종 3개월분 임금채권은 조세보다 무조건 우선, 일반 임금은 대상 아님", () => {
  const w = mk("wage", { creditor: "W", amount: "5000", wageType: "last3Months" });
  const j = judgeWageVsTax(w, tax("national", "2000-01-01"));
  assert.equal(j.winner, "a"); assert.equal(j.legalBasisUnverified, true); assert.equal(j.comparedDates.length, 0);
  assert.throws(() => judgeWageVsTax(mk("wage", { creditor: "W", amount: "1", wageType: "general" }), tax("national", "2000-01-01")), RangeError);
});

t("규칙 12: 공과금 vs 조세는 날짜와 상관없이 조세", () => {
  const charge = mk("publicCharge", { creditor: "건보", amount: "1", dueDate: "1999-01-01" });
  const j = judgeChargeVsTax(charge, tax("local", "2030-01-01"));
  assert.equal(j.winner, "b"); assert.match(j.law!, /제85조/); assert.equal(j.legalBasisUnverified, false);
});

t("규칙 13: 조세 vs 가압류는 날짜와 상관없이 조세", () => {
  const j1 = judgeTaxVsProvisional(tax("national", "2030-01-01"), seizure("2000-01-01"));
  assert.equal(j1.winner, "a"); assert.match(j1.law!, /국세기본법 제35조 제1항/);
  const j2 = judgeTaxVsProvisional(tax("local", "2000-01-01"), seizure("2030-01-01"));
  assert.equal(j2.winner, "a"); assert.match(j2.law!, /지방세기본법 제71조/);
});
