// 주택임차인의 기준일. 임차인과 조세·공과금을 비교하는 규칙(규칙 4 등)이 같이 쓴다.

import { laterDate } from "../dates";
import type { DateString, LeaseClaim } from "../types";
import { requireDate } from "./judgment";

/**
 * 임차인의 기준일 = 전입일과 확정일자 중 늦은 날 (담당자 확인).
 * 조세·공과금과 비교할 때는 전입일을 다음 날로 바꾸지 않고 이 날짜를 그대로 쓴다.
 * 확정일자가 없는 임차인은 배분을 받지 못하므로 순위를 비교하지 않는다 (호출하기 전에 걸러야 한다).
 */
export function leaseBaseDate(lease: LeaseClaim): DateString {
  if (lease.fixedDate === null) {
    throw new RangeError("확정일자가 없는 임차인은 배분을 받지 못하므로 순위를 비교하지 않습니다.");
  }
  const moveIn = requireDate(lease.moveInDate, "전입일");
  return laterDate(moveIn, lease.fixedDate);
}
