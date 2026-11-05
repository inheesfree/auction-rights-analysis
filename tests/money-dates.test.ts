import assert from "node:assert/strict";
import { test } from "vitest";
import { isWon, parseWon, formatWon, sumWon } from "../lib/money";
import { autoFormatDateInput, isValidDate, parseDate, formatDate, compareDates, laterDate, addDays } from "../lib/dates";


const t = test;

// 금액
t("isWon: 정수만", () => {
  assert.equal(isWon(0), true); assert.equal(isWon(250000000), true);
  assert.equal(isWon(1.5), false); assert.equal(isWon(-1), false);
  assert.equal(isWon(NaN), false); assert.equal(isWon("100"), false);
  assert.equal(isWon(Number.MAX_SAFE_INTEGER + 1), false);
});
t("parseWon", () => {
  assert.equal(parseWon("1,000,000원"), 1000000);
  assert.equal(parseWon(" 250000000 "), 250000000);
  assert.equal(parseWon("3,000만원"), null);
  assert.equal(parseWon("1.5"), null);
  assert.equal(parseWon("-100"), null);
  assert.equal(parseWon(""), null);
});
t("formatWon", () => assert.equal(formatWon(250000000), "250,000,000원"));
t("sumWon: 규칙 5 예시 합계 = 매각대금", () => {
  assert.equal(sumWon([0, 200000000, 50000000]), 250000000);
  assert.equal(sumWon([]), 0);
});
t("sumWon: 잘못된 값·넘침은 오류", () => {
  assert.throws(() => sumWon([1, 1.5]), RangeError);
  assert.throws(() => sumWon([Number.MAX_SAFE_INTEGER, 1]), RangeError);
});

// 날짜
t("isValidDate", () => {
  assert.equal(isValidDate("2021-03-10"), true);
  assert.equal(isValidDate("2020-02-29"), true);
  assert.equal(isValidDate("2021-02-29"), false);
  assert.equal(isValidDate("2021-02-30"), false);
  assert.equal(isValidDate("2021-13-01"), false);
  assert.equal(isValidDate("2021-3-10"), false);
  assert.equal(isValidDate(20210310), false);
});
t("parseDate: 여러 입력 모양", () => {
  for (const s of ["2021-03-10", "2021.3.10.", "2021. 3. 10", "2021/3/10", " 2021.03.10 "])
    assert.equal(parseDate(s), "2021-03-10", s);
  assert.equal(parseDate("2021.2.30"), null);
  assert.equal(parseDate("21.3.10"), null);
  assert.equal(parseDate("abc"), null);
});
t("parseDate: 숫자 8자리(yyyymmdd)도 읽는다", () => {
  assert.equal(parseDate("20210310"), "2021-03-10");
  assert.equal(parseDate(" 20210310 "), "2021-03-10");
  assert.equal(parseDate("20210230"), null); // 없는 날짜
  assert.equal(parseDate("2021031"), null); // 7자리
  assert.equal(parseDate("202103100"), null); // 9자리
});
t("autoFormatDateInput: 8자리가 되면 yyyy-mm-dd로 바꾸고 그 밖은 그대로 둔다", () => {
  assert.equal(autoFormatDateInput("20210310"), "2021-03-10");
  assert.equal(autoFormatDateInput("2021031"), "2021031"); // 아직 입력 중
  assert.equal(autoFormatDateInput("2021-03-10"), "2021-03-10");
  assert.equal(autoFormatDateInput("2021.3.10"), "2021.3.10");
  assert.equal(autoFormatDateInput(""), "");
});
t("formatDate", () => assert.equal(formatDate("2021-03-10"), "2021년 3월 10일"));
t("compareDates", () => {
  assert.equal(compareDates("2020-01-10", "2021-03-10"), -1);
  assert.equal(compareDates("2022-11-20", "2021-03-10"), 1);
  assert.equal(compareDates("2021-03-10", "2021-03-10"), 0);
  assert.throws(() => compareDates("2021-02-30", "2021-03-10"), RangeError);
});
t("laterDate: 임차인 기준일(전입일·확정일자 중 늦은 날)", () => {
  assert.equal(laterDate("2021-03-02", "2021-03-10"), "2021-03-10");
  assert.equal(laterDate("2021-03-10", "2021-03-02"), "2021-03-10");
  assert.equal(laterDate("2021-03-10", "2021-03-10"), "2021-03-10");
});
t("addDays: 다음 날, 월·연말·윤년 경계", () => {
  assert.equal(addDays("2021-03-10", 1), "2021-03-11");
  assert.equal(addDays("2021-01-31", 1), "2021-02-01");
  assert.equal(addDays("2021-12-31", 1), "2022-01-01");
  assert.equal(addDays("2020-02-28", 1), "2020-02-29");
  assert.equal(addDays("2021-02-28", 1), "2021-03-01");
  assert.equal(addDays("2021-03-01", -1), "2021-02-28");
  assert.throws(() => addDays("2021-03-10", 0.5), RangeError);
});
