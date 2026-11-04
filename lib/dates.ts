// Design Ref: §5.3 — 날짜는 `YYYY-MM-DD` 문자열로 비교한다 (시간대 영향을 받지 않도록)
// Plan SC: 작업 2 — 기준일 비교 규칙(작업 5~)이 쓰는 공통 날짜 도구
//
// 같은 날짜일 때 누가 앞서는지는 비교하는 두 권리마다 다르다.
// 그래서 여기에는 넣지 않고, 규칙별 함수(lib/rules/)가 "같은 날짜일 때 처리" 표를 따른다.
// 이 파일은 "같은 날인지 / 앞인지 / 뒤인지"만 알려준다.

import type { Blank, DateString } from "./types";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 실제로 있는 날짜인지 확인한다. 예: 2021-02-30은 없는 날짜다. */
export function isValidDate(value: unknown): value is DateString {
  if (typeof value !== "string") return false;
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  // UTC 기준으로 만들어 보고 다시 읽어서, 그대로 나오면 실제로 있는 날짜다.
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * 사람이 입력한 날짜 글자를 `YYYY-MM-DD`로 바꾼다.
 * 받아들이는 모양: "2021-03-10", "2021.3.10.", "2021. 3. 10", "2021/3/10"
 * 형식이 다르거나 없는 날짜면 추측하지 않고 `null`(빈칸)을 돌려준다.
 */
export function parseDate(text: string): Blank<DateString> {
  const match = /^\s*(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})\s*\.?\s*$/.exec(text);
  if (!match) return null;
  const normalized = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  return isValidDate(normalized) ? normalized : null;
}

/** 날짜를 화면용 글자로 바꾼다. 예: "2021-03-10" → "2021년 3월 10일" */
export function formatDate(date: DateString): string {
  assertDate(date);
  const [year, month, day] = date.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

/** 두 날짜를 비교한다. 앞이면 -1, 같으면 0, 뒤면 1. (날짜가 아니면 오류) */
export function compareDates(a: DateString, b: DateString): -1 | 0 | 1 {
  assertDate(a);
  assertDate(b);
  // `YYYY-MM-DD`는 글자 순서가 곧 날짜 순서다.
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** 두 날짜 중 늦은 날을 돌려준다. 예: 임차인의 전입일과 확정일자 중 기준일을 고를 때. */
export function laterDate(a: DateString, b: DateString): DateString {
  return compareDates(a, b) >= 0 ? a : b;
}

/**
 * 날짜에 며칠을 더한다(음수면 뺀다).
 * 예: 대항력은 전입신고 "다음 날 0시"부터 생기므로 전입일에 1일을 더해서 본다.
 */
export function addDays(date: DateString, days: number): DateString {
  assertDate(date);
  if (!Number.isInteger(days)) {
    throw new RangeError(`더하는 일수는 정수여야 합니다: ${String(days)}`);
  }
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  const y = String(result.getUTCFullYear()).padStart(4, "0");
  const m = String(result.getUTCMonth() + 1).padStart(2, "0");
  const d = String(result.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 날짜가 아니면 오류를 낸다. 계산 도중 잘못된 값이 조용히 섞이는 것을 막는다. */
export function assertDate(value: unknown): asserts value is DateString {
  if (!isValidDate(value)) {
    throw new RangeError(`날짜는 실제로 있는 YYYY-MM-DD 형식이어야 합니다: ${String(value)}`);
  }
}
