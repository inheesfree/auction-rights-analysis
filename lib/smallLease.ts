// Design Ref: §3.2 — 소액임차인 최우선변제 기준표와 판정
// Plan SC: 작업 7 — 소액임차 기준은 선순위 담보물권 설정 당시의 시행령 기준을 쓴다 (주택임대차보호법 시행령 제10조)
//
// [확인 필요] 기준표는 서울특별시(담당자 제공, 2026-11-04)와 광역시 등의 2023.2.21. 시행분(담당자 승인, 2026-11-05)만 들어 있다.
// 다른 지역은 보증금 기준(이하)을 확인하지 못해 넣지 않았고, 그 지역 임차인이 입력되면
// "이 앱이 다루지 않는 경우"로 알린다. 지역을 추가하려면 `SMALL_LEASE_TABLE`에 줄만 더하면 된다.
// 2010-07-26 이전에 설정된 담보물권도 기준표가 없어 다루지 않는다.

import { laterDate } from "./dates";
import { RIGHT_KIND_LABELS, type Claim, type DateString, type LeaseClaim, type LeaseRegion, type Won } from "./types";

/** 기준표의 한 줄: 이 날짜 이후에 설정된 담보물권에 적용된다. */
export interface SmallLeaseRow {
  /** 시행일. */
  startDate: DateString;
  /** 소액임차인 보증금 기준 (이 금액 이하여야 소액임차인). */
  depositLimit: Won;
  /** 보증금 중 최우선변제를 받는 일정액. */
  priorityAmount: Won;
}

/** 지역별 기준표. 시행일이 늦은 줄이 앞에 온다. */
export const SMALL_LEASE_TABLE: Partial<Record<LeaseRegion, SmallLeaseRow[]>> = {
  // 서울특별시: 담당자 제공 (2026-11-04). 2023-02-21 최우선변제 금액은 법제처 시행령 제10조 현행본과 일치.
  seoul: [
    { startDate: "2023-02-21", depositLimit: 165_000_000, priorityAmount: 55_000_000 },
    { startDate: "2021-05-11", depositLimit: 150_000_000, priorityAmount: 50_000_000 },
    { startDate: "2018-09-18", depositLimit: 110_000_000, priorityAmount: 37_000_000 },
    { startDate: "2016-03-31", depositLimit: 100_000_000, priorityAmount: 34_000_000 },
    { startDate: "2014-01-01", depositLimit: 95_000_000, priorityAmount: 32_000_000 },
    { startDate: "2010-07-26", depositLimit: 75_000_000, priorityAmount: 25_000_000 },
  ],
  // 광역시(과밀억제권역·군지역 제외)·안산·광주·파주·이천·평택: 2023.2.21. 시행분만 넣었다.
  // 최우선변제 2,800만원은 법제처 현행본(시행령 제10조)과 일치한다. 보증금 기준 8,500만원은 법제처에서 직접
  // 확인하지 못했고, 담당자가 승인했다. 이 전 시행분은 기준표가 없어 다루지 않는다.
  metro: [{ startDate: "2023-02-21", depositLimit: 85_000_000, priorityAmount: 28_000_000 }],
};

/** 지역과 기준 시점에 맞는 기준표 줄을 찾는다. 기준표에 없으면 `null`(다루지 않는 경우). */
export function findSmallLeaseRow(region: LeaseRegion, baseDate: DateString): SmallLeaseRow | null {
  const rows = SMALL_LEASE_TABLE[region];
  if (!rows) return null;
  // `YYYY-MM-DD`는 글자 순서가 날짜 순서다. 기준 시점 이하의 시행일 중 가장 늦은 줄을 쓴다.
  return rows.find((row) => row.startDate <= baseDate) ?? null;
}

/**
 * 소액임차인의 기준 시점.
 * 선순위 담보물권(근저당권)이 있으면 가장 빠른 설정일, 없으면 임차인 기준일(전입일·확정일자 중 늦은 날,
 * 확정일자가 없으면 전입일)로 본다. (담당자 답변을 이렇게 이해함 — 확인 필요)
 */
export function smallLeaseBaseDate(lease: LeaseClaim, claims: readonly Claim[]): DateString {
  const mortgageDates = claims.flatMap((claim) =>
    claim.kind === "mortgage" && claim.registrationDate !== null ? [claim.registrationDate] : [],
  );
  if (mortgageDates.length > 0) return mortgageDates.reduce((a, b) => (a <= b ? a : b));

  if (lease.moveInDate === null) throw new RangeError("전입일이 없어 소액임차 기준 시점을 정할 수 없습니다.");
  return lease.fixedDate === null ? lease.moveInDate : laterDate(lease.moveInDate, lease.fixedDate);
}

/** 소액임차인 판정 결과. */
export type SmallLeaseDecision =
  | { status: "unsupported"; reason: string }
  | { status: "notSmall"; baseDate: DateString; row: SmallLeaseRow }
  | { status: "small"; baseDate: DateString; row: SmallLeaseRow; entitlement: Won };

/**
 * 주택임차인이 소액임차인인지 판정하고 최우선변제액을 정한다.
 * - 보증금이 기준 이하이면 소액임차인이고, 최우선변제액 = min(보증금, 일정액)
 * - 확정일자가 없어도 소액임차인이면 최우선변제를 받는다 (담당자 확인)
 * - 이 앱이 기준표를 가지고 있지 않은 지역·시기는 `unsupported`
 */
export function decideSmallLease(lease: LeaseClaim, claims: readonly Claim[]): SmallLeaseDecision {
  const label = `${RIGHT_KIND_LABELS.lease}(${lease.creditor || "채권자 미입력"})`;
  if (lease.region === null || lease.amount === null) {
    throw new RangeError(`${label}의 소재지 구분이나 보증금이 없어 소액임차를 판정할 수 없습니다. 입력값 검사를 먼저 통과해야 합니다.`);
  }
  const baseDate = smallLeaseBaseDate(lease, claims);
  const row = findSmallLeaseRow(lease.region, baseDate);
  if (row === null) {
    return {
      status: "unsupported",
      reason: `${label}: 소액임차 기준표가 없는 지역·시기(기준 시점 ${baseDate})입니다. 현재는 서울특별시의 2010-07-26 이후, 광역시 등의 2023-02-21 이후 기준만 계산합니다.`,
    };
  }
  if (lease.amount > row.depositLimit) return { status: "notSmall", baseDate, row };
  return { status: "small", baseDate, row, entitlement: Math.min(lease.amount, row.priorityAmount) };
}
