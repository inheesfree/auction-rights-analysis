// Design Ref: §4 lib/privacy.ts — 이름 마스킹, 주민등록번호처럼 보이는 값 가리기
// Plan SC: 작업 15·19 — 분석 결과에서 이름은 마스킹해서 보여준다 (담당자 확인 2026-11-05)
//
// 마스킹 규칙: 사람 이름은 첫 글자만 남기고 나머지를 ○로 바꾼다. 예: 노정식 → 노○○
// 기관 이름(세무서, 구청, 공단, 은행, 조합 등)은 개인정보가 아니라서 그대로 둔다. (AI 판단, 담당자 확인 필요)
// 이미 가려진 이름(홍○○)은 다시 가려도 그대로다.

import type { Claim } from "./types";

/** 기관 이름이라고 보는 낱말. 이름에 이 낱말이 들어 있으면 마스킹하지 않는다. */
const ORGANIZATION_WORDS = [
  "세무서", "구청", "시청", "군청", "도청", "공단", "공사", "은행", "조합", "금고", "보험", "캐피탈", "저축",
  "신협", "농협", "수협", "축협", "주식회사", "(주)", "㈜", "법인", "재단", "센터", "지사", "지점", "본부",
  "관리소", "위원회", "회사", "증권", "카드", "자산관리", "대부", "협회", "연합회", "관리사무소", "학교", "병원",
];

/** 기관 이름처럼 보이는지. */
export function isOrganizationName(name: string): boolean {
  const trimmed = name.trim();
  return ORGANIZATION_WORDS.some((word) => trimmed.includes(word));
}

/** 사람 이름을 가린다. 기관 이름과 빈 이름은 그대로 돌려준다. */
export function maskName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "" || isOrganizationName(trimmed)) return trimmed;
  const characters = [...trimmed];
  if (characters.length === 1) return trimmed;
  return characters[0] + "○".repeat(characters.length - 1);
}

/** 채권자 이름을 가린 채권을 돌려준다. 나머지 값은 그대로다. */
export function maskClaim(claim: Claim): Claim {
  return { ...claim, creditor: maskName(claim.creditor) };
}

/**
 * 주민등록번호처럼 보이는 값(6자리-7자리)을 가린다. 예: 900101-1234567 → ******-*******
 * 분석에 쓰지 않고 가려서 표시하기 위한 것이다.
 */
export function maskResidentNumbers(text: string): string {
  return text.replace(/\b\d{6}[-\s]?[1-4]\d{6}\b/g, "******-*******");
}
