// Design Ref: §3 ④ 입력값 검사, §2.4 "다루지 않는 경우" 안내
// Plan SC: 작업 4 — 날짜 누락·제외한 권리 종류를 계산 전에 걸러내고 이유를 알려준다
//
// 순위를 비교해 봐야 알 수 있는 "지원하지 않는 순환"은 여기서 거르지 않는다 (작업 11, DESIGN ⑤-2).
// 이 파일은 입력 단계에서 알 수 있는 문제만 다룬다. 같은 입력이면 항상 같은 결과가 나온다.

import { formatWon, sumWon } from "./money";
import { claimLabel } from "./claimLabel";
import type { Blank, Claim } from "./types";

/**
 * 문제의 종류.
 * - missing: 계산에 꼭 필요한 값이 비어 있다 (못 읽은 값 포함)
 * - invalid: 값끼리 맞지 않는다
 * - unsupported: 이 앱이 다루지 않는 권리나 경우다
 * - notice: 계산은 할 수 있지만 알려 둘 것이 있다 (예: 확정일자 없는 임차인은 배분 0원)
 */
export type IssueKind = "missing" | "invalid" | "unsupported" | "notice";

export interface Issue {
  /** 문제가 있는 채권의 번호. 채권 전체에 관한 문제면 `null`. */
  claimId: string | null;
  /** 문제가 있는 채권을 알아볼 이름 (예: "근저당권(A은행)"). */
  claimLabel: string;
  kind: IssueKind;
  message: string;
}

export interface ValidationResult {
  issues: Issue[];
  /** 이 앱이 다루지 않는 경우를 모은 것 (`issues` 중 `unsupported`). */
  unsupported: Issue[];
  /** 계산은 할 수 있지만 알려 둘 것 (`issues` 중 `notice`). */
  notices: Issue[];
  /** 막는 문제(`notice` 제외)가 하나도 없어야 `true`. 다루지 않는 경우가 하나라도 있으면 계산하지 않는다. */
  canCalculate: boolean;
}

/** 입력 검사 결과를 모아 두는 작은 도구. */
function collector(claim: Claim) {
  const issues: Issue[] = [];
  const label = claimLabel(claim);
  const add = (kind: IssueKind, message: string) =>
    issues.push({ claimId: claim.id, claimLabel: label, kind, message });
  /** 값이 비어 있으면 "필요한 값" 문제로 기록한다. */
  const need = (value: Blank<unknown> | undefined, fieldLabel: string) => {
    if (value === null || value === undefined || value === "") {
      add("missing", `${fieldLabel}: 비어 있거나 읽지 못했습니다.`);
    }
  };
  return { issues, add, need };
}

/** 채권 하나를 검사한다. */
function validateClaim(claim: Claim): Issue[] {
  const { issues, add, need } = collector(claim);

  // 이 앱이 다루지 않는 권리 종류: 다른 검사를 하지 않고 안내만 한다.
  if (claim.kind === "securityProvisionalRegistration" || claim.kind === "necessaryExpense") {
    add("unsupported", "이 앱이 다루지 않는 권리 종류입니다.");
    return issues;
  }

  // 채권자 이름은 계산에 필요하지 않다 (서류에 이름이 없는 가압류권자 등이 있다). 비어 있으면 "채권자 미입력"으로 표시한다.
  need(claim.amount, "채권액");

  switch (claim.kind) {
    case "mortgage":
      need(claim.registrationDate, "설정일자");
      break;
    case "jeonse":
      need(claim.isHousing, "주택 여부");
      if (claim.isHousing === false) {
        add("unsupported", "주택이 아닌 전세권은 이 앱이 다루지 않는 경우입니다.");
      }
      need(claim.registrationDate, "등기 접수일");
      break;
    case "lease":
      need(claim.isHousing, "주택 여부");
      if (claim.isHousing === false) {
        add("unsupported", "주택이 아닌 임차보증금(상가 등)은 이 앱이 아직 계산하지 않습니다. (상가 소액임차 기준표가 필요합니다.)");
      } else {
        need(claim.region, "소재지 구분");
      }
      need(claim.moveInDate, "전입일");
      // 확정일자가 없는 임차인은 소액임차인에 해당할 때만 최우선변제를 받고, 나머지 보증금은 배분을 받지 못한다
      // (담당자 확인). 계산을 막지 않고 알려 준다.
      if (claim.fixedDate === null) {
        add("notice", "확정일자가 없는 임차인은 소액임차인에 해당하는 경우에만 최우선변제를 받고, 그 밖의 보증금은 배분을 받지 못합니다. 실제로 확정일자가 있다면 입력해 주세요.");
      }
      break;
    case "tax": {
      need(claim.taxType, "국세/지방세 구분");
      need(claim.hasTaxCollateral, "납세담보 여부");
      if (claim.items.length === 0) {
        add("missing", "세목이 하나도 없습니다. 세목별 법정기일을 넣어야 순위를 판단할 수 있습니다.");
        break;
      }
      claim.items.forEach((item, index) => {
        const n = index + 1;
        need(item.name, `세목 ${n} 이름`);
        need(item.legalDueDate, `세목 ${n} 법정기일`);
        need(item.amount, `세목 ${n} 금액`);
        need(item.isDangHaeSe, `세목 ${n} 당해세 여부`);
      });
      // 채권액은 세목별 금액의 합과 같아야 한다.
      const amounts = claim.items.map((item) => item.amount);
      if (claim.amount !== null && amounts.every((a): a is number => a !== null)) {
        const total = sumWon(amounts);
        if (total !== claim.amount) {
          add("invalid", `채권액(${formatWon(claim.amount)})이 세목별 금액의 합(${formatWon(total)})과 다릅니다.`);
        }
      }
      break;
    }
    case "publicCharge":
      need(claim.dueDate, "납부기한");
      break;
    case "wage":
      need(claim.wageType, "임금 구분(최종 3개월분/일반)");
      break;
    case "provisionalSeizure":
      need(claim.registrationDate, "가압류 등기일");
      break;
    case "dispositionCost":
      break;
  }

  return issues;
}

/**
 * 입력한 채권 전체를 검사한다.
 * 문제가 하나라도 있으면 `canCalculate`가 `false`이고, 계산하지 않는다.
 */
export function validateClaims(claims: readonly Claim[]): ValidationResult {
  const issues: Issue[] = [];

  if (claims.length === 0) {
    issues.push({
      claimId: null,
      claimLabel: "전체",
      kind: "missing",
      message: "채권을 1건 이상 입력해 주세요.",
    });
  }

  for (const claim of claims) issues.push(...validateClaim(claim));

  return {
    issues,
    unsupported: issues.filter((issue) => issue.kind === "unsupported"),
    notices: issues.filter((issue) => issue.kind === "notice"),
    canCalculate: issues.every((issue) => issue.kind === "notice"),
  };
}
