import { describe, expect, it } from "vitest";
import { isValidEmployeeId, sanitizeEmployeeId } from "../lib/employeeId";

describe("사번 형식 확인", () => {
  it("숫자 6자리만 올바른 사번으로 본다", () => {
    expect(isValidEmployeeId("123456")).toBe(true);
    expect(isValidEmployeeId("12345")).toBe(false);
    expect(isValidEmployeeId("1234567")).toBe(false);
    expect(isValidEmployeeId("12345a")).toBe(false);
    expect(isValidEmployeeId("")).toBe(false);
  });

  it("숫자가 아닌 글자는 걸러내고 6자리까지만 받는다", () => {
    expect(sanitizeEmployeeId("12 34-56a78")).toBe("123456");
    expect(sanitizeEmployeeId("abc")).toBe("");
  });
});
