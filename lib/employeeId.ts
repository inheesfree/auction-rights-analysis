// 담당자용 입장 화면의 사번 형식 확인. 형식(숫자 6자리)만 보며, 서버 대조·저장은 하지 않는다.
// 담당자 확인 (2026-11-05): 로그인이 아니라 "형식만 확인하는 입장 화면"이다. 보안 장치가 아니다.

export const EMPLOYEE_ID_LENGTH = 6;

/** 숫자만 남기고 6자리까지만 받는다(붙여넣기·한글 입력 대비). */
export function sanitizeEmployeeId(text: string): string {
  return text.replace(/\D/g, "").slice(0, EMPLOYEE_ID_LENGTH);
}

/** 숫자 6자리인지 확인한다. */
export function isValidEmployeeId(text: string): boolean {
  return /^\d{6}$/.test(text);
}
