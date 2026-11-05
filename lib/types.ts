// Design Ref: §3.1, §3.2 — 채권(Claim)과 읽은 값(ReadValue)의 데이터 모양
// Plan SC: 작업 1 — 권리 종류별 입력 항목을 한 곳에 정의한다 (이 파일은 모양만 정하고 계산은 하지 않는다)

/** 금액. 원 단위 정수로만 다룬다 (소수점 금지). */
export type Won = number;

/** 날짜. `YYYY-MM-DD` 문자열로만 다룬다 (시간대 영향을 피하기 위해). */
export type DateString = string;

/**
 * 비어 있을 수 있는 값.
 * 못 읽었거나 아직 입력하지 않은 값은 추측해서 채우지 않고 `null`로 둔다.
 */
export type Blank<T> = T | null;

// ---------------------------------------------------------------------------
// 읽은 값 (PDF·이미지에서 읽은 값을 확인 표에 보여주기 위한 모양)
// ---------------------------------------------------------------------------

/** 읽은 값 하나. 사용자가 확인하기 전(`confirmed: false`)에는 계산에 쓰지 않는다. */
export interface ReadValue<T> {
  /** 읽은 값. 못 읽었으면 `null`(빈칸). */
  value: Blank<T>;
  /** 원본 문서에서 가져온 위치 (예: "3쪽 표 2행"). 직접 입력이면 `null`. */
  source: Blank<string>;
  /** 확실하지 않거나 못 읽은 값이면 `true` (화면에서 눈에 띄게 표시한다). */
  uncertain: boolean;
  /** 사용자가 확인·수정을 마쳤는지. */
  confirmed: boolean;
}

// ---------------------------------------------------------------------------
// 권리 종류
// ---------------------------------------------------------------------------

/** 앱이 계산하는 권리 종류. */
export const SUPPORTED_RIGHT_KINDS = [
  "mortgage", // 근저당권
  "jeonse", // 전세권 (주택일 때만 계산)
  "lease", // 주택임차보증금
  "tax", // 조세 (국세·지방세)
  "publicCharge", // 공과금 (건강보험료 등)
  "wage", // 임금채권
  "provisionalSeizure", // 가압류
  "dispositionCost", // 체납처분비
] as const;

/** 이번 앱이 다루지 않는 권리 종류. 입력되면 계산하지 않고 "이 앱이 다루지 않는 경우"로 안내한다. */
export const UNSUPPORTED_RIGHT_KINDS = [
  "securityProvisionalRegistration", // 담보가등기
  "necessaryExpense", // 임차인의 필요비·유익비
] as const;

export type SupportedRightKind = (typeof SUPPORTED_RIGHT_KINDS)[number];
export type UnsupportedRightKind = (typeof UNSUPPORTED_RIGHT_KINDS)[number];
export type RightKind = SupportedRightKind | UnsupportedRightKind;

/** 화면에 보여줄 권리 종류 이름. */
export const RIGHT_KIND_LABELS: Record<RightKind, string> = {
  mortgage: "근저당권",
  jeonse: "전세권",
  lease: "주택임차보증금",
  tax: "조세",
  publicCharge: "공과금",
  wage: "임금채권",
  provisionalSeizure: "가압류",
  dispositionCost: "체납처분비",
  securityProvisionalRegistration: "담보가등기",
  necessaryExpense: "필요비·유익비",
};

// ---------------------------------------------------------------------------
// 채권 (Claim)
// ---------------------------------------------------------------------------

/** 모든 권리가 공통으로 받는 항목. */
interface ClaimBase {
  /** 화면과 계산 기록에서 채권을 구분하는 번호. */
  id: string;
  /** 채권자 이름. 필요하지 않으면 마스킹된 상태(예: 홍○○)로 둔다. */
  creditor: string;
  /** 채권액 (원 단위 정수). */
  amount: Blank<Won>;
  /** 배분요구를 했는지. */
  requestedDistribution: Blank<boolean>;
  /** 수임 채권(우리가 맡은 체납세금) 여부. 담당자용에서만 표시한다. */
  isEntrusted?: boolean;
  /** 서류에서 읽은 값이면 원본 위치(예: "Page 2 3행"). 직접 입력이면 없다. */
  source?: string;
}

/** 근저당권. */
export interface MortgageClaim extends ClaimBase {
  kind: "mortgage";
  /** 등기 접수일 (기준일). */
  registrationDate: Blank<DateString>;
  /** 등기 접수번호 (같은 날짜일 때 선후 판단). */
  registrationNumber: Blank<string>;
}

/** 전세권. 주택이 아니면 이 앱이 다루지 않는 경우다. */
export interface JeonseClaim extends ClaimBase {
  kind: "jeonse";
  registrationDate: Blank<DateString>;
  registrationNumber: Blank<string>;
  /** 주택인지 여부. */
  isHousing: Blank<boolean>;
}

/** 소액임차인 기준표의 지역 구분 (주택임대차보호법 시행령 제10조). */
export const LEASE_REGIONS = ["seoul", "overcrowded", "metro", "other"] as const;
export type LeaseRegion = (typeof LEASE_REGIONS)[number];

/** 화면에 보여줄 지역 구분 이름. 정확한 지역 범위는 시행령 제10조 제1항을 따른다. */
export const LEASE_REGION_LABELS: Record<LeaseRegion, string> = {
  seoul: "서울특별시",
  overcrowded: "과밀억제권역(서울 제외)·세종·용인·화성·김포",
  metro: "광역시·안산·광주·파주·이천·평택 (과밀억제권역·군지역 제외)",
  other: "그 밖의 지역",
};

/** 주택임차보증금. */
export interface LeaseClaim extends ClaimBase {
  kind: "lease";
  /** 전입일. */
  moveInDate: Blank<DateString>;
  /** 확정일자. (전입일과 확정일자 중 늦은 날이 기준일이고, 둘 다 있어야 대항력 있는 임차인) */
  fixedDate: Blank<DateString>;
  /** 주택인지 여부. */
  isHousing: Blank<boolean>;
  /** 소재지 구분. 소액임차인의 보증금 기준과 최우선변제금이 지역마다 달라서 필요하다. */
  region: Blank<LeaseRegion>;
  /** 월세. 주택이 아닌 임차(상가)일 때만 입력받는다. */
  monthlyRent: Blank<Won>;
  /**
   * 매수인이 인수하지 않는 임차보증금이면 `true`.
   * 공매재산명세서에서 위임기관이 주택도시보증공사인 임차보증금이 그렇다 (담당자 확인, 2026-11-05).
   * 순위 판단과 배분에는 영향이 없고, 매수인 인수 금액(lib/acquire.ts)만 계산하지 않는다.
   */
  noAcquisition?: boolean;
}

/** 국세/지방세 구분. */
export type TaxType = "national" | "local";

/** 조세의 세목 하나. 세목마다 법정기일이 달라서 따로 둔다. */
export interface TaxItem {
  /** 세목 이름 (예: 종합부동산세). */
  name: string;
  /** 세목별 법정기일. */
  legalDueDate: Blank<DateString>;
  /** 세목별 금액. */
  amount: Blank<Won>;
  /** 당해세(해당 재산에 부과된 조세)인지. */
  isDangHaeSe: Blank<boolean>;
}

/** 조세 (국세·지방세). 한 건의 교부청구 안에 세목이 여러 개일 수 있다. */
export interface TaxClaim extends ClaimBase {
  kind: "tax";
  taxType: Blank<TaxType>;
  /** 세목 목록. */
  items: TaxItem[];
  /** 압류일. 교부청구만 했으면 `null`. */
  seizureDate: Blank<DateString>;
  /** 참가압류 여부. */
  hasParticipatingSeizure: Blank<boolean>;
  /** 납세담보 여부. 담보가 있는 조세는 다른 조세보다 우선한다 (판단규칙 규칙 7). */
  hasTaxCollateral: Blank<boolean>;
}

/** 공과금 (건강보험료 등). */
export interface PublicChargeClaim extends ClaimBase {
  kind: "publicCharge";
  /** 납부기한. 법정기일처럼 비교한다. */
  dueDate: Blank<DateString>;
}

/** 임금채권이 최종 3개월분(최우선변제)인지, 일반 임금인지. */
export type WageType = "last3Months" | "general";

/** 임금채권. */
export interface WageClaim extends ClaimBase {
  kind: "wage";
  wageType: Blank<WageType>;
}

/** 가압류. */
export interface ProvisionalSeizureClaim extends ClaimBase {
  kind: "provisionalSeizure";
  /** 가압류 등기일. */
  registrationDate: Blank<DateString>;
  registrationNumber: Blank<string>;
}

/** 체납처분비 (공매 절차에 필요한 비용). 공통 항목만 받는다. */
export interface DispositionCostClaim extends ClaimBase {
  kind: "dispositionCost";
}

/** 이 앱이 다루지 않는 권리. 이름과 종류만 받아 두고 계산에는 넣지 않는다. */
export interface UnsupportedClaim extends ClaimBase {
  kind: UnsupportedRightKind;
}

/** 앱이 계산하는 채권. `kind` 값으로 종류를 구분한다. */
export type SupportedClaim =
  | MortgageClaim
  | JeonseClaim
  | LeaseClaim
  | TaxClaim
  | PublicChargeClaim
  | WageClaim
  | ProvisionalSeizureClaim
  | DispositionCostClaim;

/** 채권. 계산하는 권리와 다루지 않는 권리를 모두 담는다. */
export type Claim = SupportedClaim | UnsupportedClaim;
