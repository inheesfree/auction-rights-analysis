import { describe, expect, it } from "vitest";
import { parseOcrText } from "../lib/ocrParse";

describe("parseOcrText — OCR 글자 → 입력 칸", () => {
  it("근저당권: 칸 이름이 앞에 있는 날짜·금액·접수번호만 채운다", () => {
    const r = parseOcrText("근저당권설정\n채권최고액: 금 200,000,000원\n설정일자 2020. 1. 10.\n접수번호 제12345호");
    expect(r.kind).toBe("mortgage");
    expect(r.values).toEqual({ amount: "200000000", registrationDate: "2020-01-10", registrationNumber: "12345" });
    expect(r.notes).toEqual([]);
  });

  it("OCR이 한글 사이에 넣은 공백을 무시한다", () => {
    const r = parseOcrText("근 저 당 권\n채 권 액 150,000,000 원\n설 정 일 자 2019-05-20");
    expect(r.kind).toBe("mortgage");
    expect(r.values.amount).toBe("150000000");
    expect(r.values.registrationDate).toBe("2019-05-20");
  });

  it("임차인: 전입일과 확정일자를 각각 앞의 이름으로 구분한다", () => {
    const r = parseOcrText("임차인 배분요구서\n임차보증금 100,000,000원\n전입일자 2021-03-10\n확정일자 2021-03-12");
    expect(r.kind).toBe("lease");
    expect(r.values).toMatchObject({ amount: "100000000", moveInDate: "2021-03-10", fixedDate: "2021-03-12" });
  });

  it("앞에 칸 이름이 없는 날짜는 추측해서 채우지 않는다", () => {
    const r = parseOcrText("근저당권\n2020-01-10\n채권액 50,000,000");
    expect(r.values.registrationDate).toBeUndefined();
    expect(r.values.amount).toBe("50000000");
  });

  it("같은 칸에 서로 다른 값이 읽히면 빈칸으로 두고 알려 준다", () => {
    const r = parseOcrText("근저당권\n설정일자 2020-01-10\n설정일자 2020-02-10");
    expect(r.values.registrationDate).toBeUndefined();
    expect(r.notes.join(" ")).toContain("설정일자");
  });

  it("없는 날짜(2월 30일)는 쓰지 않는다", () => {
    const r = parseOcrText("근저당권\n설정일자 2021-02-30");
    expect(r.values.registrationDate).toBeUndefined();
  });

  it("권리 종류가 여러 개로 읽히면 정하지 않고 담당자가 고르게 한다 (공통 칸만 채움)", () => {
    const r = parseOcrText("근저당권 및 가압류\n채권액 30,000,000원\n설정일자 2020-01-10");
    expect(r.kind).toBeNull();
    expect(r.values).toEqual({ amount: "30000000" });
    expect(r.notes[0]).toContain("권리 종류");
  });

  it("조세: 세목·법정기일·압류일을 채우고, 세무서면 국세로 정한다", () => {
    const r = parseOcrText("양천세무서 교부청구서\n세목: 종합부동산세\n법정기일 2022-11-20\n압류일 2023-01-05\n청구금액 30,000,000원");
    expect(r.kind).toBe("tax");
    expect(r.values).toMatchObject({ amount: "30000000", seizureDate: "2023-01-05", taxType: "national" });
    expect(r.taxItems).toEqual([{ name: "종합부동산세", legalDueDate: "2022-11-20" }]);
  });

  it("국세와 지방세 단서가 함께 있으면 구분하지 않는다", () => {
    const r = parseOcrText("세무서 구청 교부청구 세목: 재산세");
    expect(r.values.taxType).toBeUndefined();
  });

  it("건강보험 교부청구서는 조세가 아니라 공과금으로 본다", () => {
    const r = parseOcrText("건강보험공단 교부청구서\n납부기한 2010-05-05\n체납액 2,000,000원");
    expect(r.kind).toBe("publicCharge");
    expect(r.values).toMatchObject({ dueDate: "2010-05-05", amount: "2000000" });
  });

  it("채권자 이름은 가져오지 않고, 주민등록번호처럼 보이는 값은 쓰지 않는다", () => {
    const r = parseOcrText("근저당권 채권자 홍길동 900101-1234567\n채권액 1,000원");
    expect(r.values.creditor).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain("1234567");
  });

  it("아무것도 읽지 못하면 빈 결과를 돌려준다", () => {
    const r = parseOcrText("");
    expect(r.kind).toBeNull();
    expect(r.values).toEqual({});
    expect(r.filled).toEqual([]);
  });
});
