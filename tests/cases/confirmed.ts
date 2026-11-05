// 담당자가 확인한 정답 사례 (2026-11-05). PRD 성공 기준 "예시 사례 모두 일치"를 확인하는 시험 자료다.
// 이름과 금액은 담당자가 가상으로 바꾼 값이다. 실제 업무 자료를 넣지 않는다.
//
// 표의 칸은 입력 화면의 칸으로 옮겼다. 표에 없는 값은 `assumptions`에 가정을 적었다.

import { buildClaim } from "../../lib/claimForm";
import type { Claim, RightKind } from "../../lib/types";

/** 사례 안의 채권 한 건과 담당자가 확인한 배분액. */
export interface CaseItem {
  /** 표에 적힌 채권자(이름이 없으면 채권 종류). */
  who: string;
  claim: Claim;
  /** 담당자가 확인한 배분액 (조세는 청구서 한 건의 합계). */
  paid: number;
}

export interface ConfirmedCase {
  name: string;
  saleProceeds: number;
  items: CaseItem[];
  /** 모든 채권에 배분하고 남은 금액. */
  leftover: number;
  /** 표에 없어서 가정한 값. */
  assumptions: string[];
}

let sequence = 0;

function claim(kind: RightKind, values: Record<string, string>, taxItems: Record<string, string>[] = []): Claim {
  return buildClaim(`case-claim-${++sequence}`, kind, values, taxItems, false).claim;
}

/** 세목 이름이 표에 없는 조세 한 건(세목 하나). */
function tax(
  creditor: string,
  type: "national" | "local",
  amount: string,
  legalDueDate: string,
  options: { seizureDate?: string; dangHaeSe?: boolean } = {},
): Claim {
  return claim(
    "tax",
    {
      creditor,
      amount,
      taxType: type,
      hasTaxCollateral: "no",
      seizureDate: options.seizureDate ?? "",
    },
    [{ name: "(세목 미기재)", legalDueDate, amount, isDangHaeSe: options.dangHaeSe ? "yes" : "no" }],
  );
}

export const CONFIRMED_CASES: ConfirmedCase[] = [
  {
    name: "사례 1: 당해세가 압류한 일반 국세보다 먼저, 가압류와 근저당은 동순위 안분",
    saleProceeds: 30_000_000,
    leftover: 0,
    assumptions: ["양천세무서의 압류일이 표에 없어 1997-03-01로 가정 (당해세가 먼저라 결과에 영향 없음)", "세목 이름이 표에 없음"],
    items: [
      { who: "한국자산관리공사", claim: claim("dispositionCost", { creditor: "한국자산관리공사", amount: "1000000" }), paid: 1_000_000 },
      { who: "양천세무서", claim: tax("양천세무서", "national", "1500000", "1997-02-03", { seizureDate: "1997-03-01" }), paid: 1_500_000 },
      { who: "동작구청", claim: tax("동작구청", "local", "300000", "2000-01-01", { dangHaeSe: true }), paid: 300_000 },
      { who: "홍길동", claim: claim("mortgage", { creditor: "홍길동", amount: "30000000", registrationDate: "2014-02-05" }), paid: 24_727_273 },
      { who: "(가압류권자)", claim: claim("provisionalSeizure", { creditor: "", amount: "3000000", registrationDate: "2011-05-10" }), paid: 2_472_727 },
    ],
  },
  {
    name: "사례 2: 압류권자 국세 두 곳의 압류선착, 교부청구 지방세, 소액임차 최우선변제",
    saleProceeds: 185_000_000,
    leftover: 149_000_000,
    assumptions: ["임차인 소재지는 서울로 가정", "세목 이름이 표에 없음"],
    items: [
      { who: "한국자산관리공사", claim: claim("dispositionCost", { creditor: "한국자산관리공사", amount: "1000000" }), paid: 1_000_000 },
      { who: "양천세무서", claim: tax("양천세무서", "national", "1500000", "1997-02-03", { seizureDate: "2013-05-02" }), paid: 1_500_000 },
      { who: "용산세무서", claim: tax("용산세무서", "national", "500000", "1996-01-01", { seizureDate: "2011-07-12" }), paid: 500_000 },
      { who: "강서구청", claim: tax("강서구청", "local", "30000000", "2015-10-08"), paid: 30_000_000 },
      {
        who: "임꺽정",
        claim: claim("lease", { creditor: "임꺽정", amount: "3000000", moveInDate: "2011-05-10", fixedDate: "2011-06-03", isHousing: "yes", region: "seoul" }),
        paid: 3_000_000,
      },
    ],
  },
  {
    name: "사례 3: 매각대금이 모자라 압류선착으로 먼저 압류한 국세가 전부 가져감",
    saleProceeds: 25_000_000,
    leftover: 0,
    assumptions: ["임차인 소재지는 서울로 가정 (보증금 1.3억은 서울 2011년 소액 기준 7,500만원 초과)", "세목 이름이 표에 없음"],
    items: [
      { who: "한국자산관리공사", claim: claim("dispositionCost", { creditor: "한국자산관리공사", amount: "1000000" }), paid: 1_000_000 },
      { who: "양천세무서", claim: tax("양천세무서", "national", "2000000", "1997-02-03", { seizureDate: "2013-05-02" }), paid: 0 },
      { who: "용산세무서", claim: tax("용산세무서", "national", "65500000", "2010-01-01", { seizureDate: "2011-07-12" }), paid: 24_000_000 },
      { who: "강서구청", claim: tax("강서구청", "local", "30000000", "2015-10-08"), paid: 0 },
      {
        who: "임꺽정",
        claim: claim("lease", { creditor: "임꺽정", amount: "130000000", moveInDate: "2011-05-10", fixedDate: "2011-06-03", isHousing: "yes", region: "seoul" }),
        paid: 0,
      },
    ],
  },
  {
    name: "사례 4(수정판): 소액 기준을 넘는 임차인이 낀 공과금·임차보증금·조세 순환 배분",
    saleProceeds: 25_000_000,
    leftover: 0,
    assumptions: ["임차인 소재지는 서울로 가정 (보증금 1.655억은 서울 2016년 소액 기준 1억원 초과)", "세목 이름이 표에 없음"],
    items: [
      { who: "한국자산관리공사", claim: claim("dispositionCost", { creditor: "한국자산관리공사", amount: "1000000" }), paid: 1_000_000 },
      { who: "건강보험공단", claim: claim("publicCharge", { creditor: "건강보험공단", amount: "2000000", dueDate: "2010-05-05" }), paid: 1_756_962 },
      {
        who: "홍길동",
        claim: claim("lease", { creditor: "홍길동", amount: "165500000", moveInDate: "2016-10-05", fixedDate: "2016-10-05", isHousing: "yes", region: "seoul" }),
        paid: 22_000_000,
      },
      { who: "관악세무서", claim: tax("관악세무서", "national", "30000000", "2017-10-06", { seizureDate: "2018-03-01" }), paid: 243_038 },
    ],
  },
];
