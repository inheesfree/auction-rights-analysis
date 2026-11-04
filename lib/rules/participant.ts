// 순위 비교와 배분에 참가하는 "채권 한 덩어리".
// 조세는 세목마다 법정기일이 달라서 세목 하나가 한 덩어리다. 나머지는 채권 하나가 한 덩어리다.

import type {
  LeaseClaim,
  MortgageClaim,
  ProvisionalSeizureClaim,
  PublicChargeClaim,
  TaxClaim,
  TaxItem,
  Won,
  WageClaim,
} from "../types";

interface ParticipantBase {
  /** 덩어리를 구분하는 번호. 조세는 "채권번호#세목순번". */
  key: string;
  claimId: string;
  /** 알아볼 이름. */
  label: string;
  /** 소액임차 최우선변제 등을 뺀 뒤 이 순위 단계에서 받으려는 금액. */
  amount: Won;
  /** 입력 순서. 같은 단계 안에서 표시 순서를 정할 때 쓴다. */
  order: number;
}

export type Participant =
  | (ParticipantBase & { kind: "mortgage"; claim: MortgageClaim })
  | (ParticipantBase & { kind: "lease"; claim: LeaseClaim })
  | (ParticipantBase & { kind: "tax"; claim: TaxClaim; item: TaxItem })
  | (ParticipantBase & { kind: "charge"; claim: PublicChargeClaim })
  | (ParticipantBase & { kind: "wageGeneral"; claim: WageClaim })
  | (ParticipantBase & { kind: "provisional"; claim: ProvisionalSeizureClaim });

export type ParticipantKind = Participant["kind"];

/** 쌍을 비교할 때 앞쪽에 오는 종류의 순서. */
export const KIND_ORDER: Record<ParticipantKind, number> = {
  mortgage: 0,
  lease: 1,
  tax: 2,
  charge: 3,
  wageGeneral: 4,
  provisional: 5,
};
