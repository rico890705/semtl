/**
 * DSR(총부채원리금상환비율) 규제.
 *
 * 2026-08-28 금융위원회 자료 확인.
 *
 * DSR = 연간 원리금상환액 ÷ 연소득 × 100
 *
 * 두 가지가 한도를 만든다
 *   1. DSR 상한 — 은행권 40%, 제2금융권 50%
 *   2. 스트레스 금리 — 한도를 계산할 때 실제 금리에 가산하는 금리
 *
 * 스트레스 금리가 이 계산기의 핵심이다.
 * 금리 4%로 빌려도 한도는 5.5%로 계산해서 정한다. 앞으로 금리가 오를 여지를
 * 미리 반영하는 장치인데, 그만큼 받을 수 있는 금액이 줄어든다.
 * 실제로 내는 이자는 원래 금리 기준이므로 "한도는 깎이고 상환액은 그대로"인 구조다.
 */

export type LoanKind = 'mortgage' | 'credit' | 'negative' | 'other' | 'jeonse';

export interface LoanKindSpec {
  id: LoanKind;
  label: string;
  /**
   * 연간 원리금을 어떻게 잡는가
   *   amortized  원리금균등 — 실제 만기로 상환한다고 본다
   *   split      원금을 산정만기로 나누고 이자를 더한다
   *   interest   이자만 반영한다
   *   excluded   DSR 산정에서 빼기
   */
  method: 'amortized' | 'split' | 'interest' | 'excluded';
  /** split 방식에서 쓰는 기본 산정만기 (년). 금융사·상품마다 다를 수 있다. */
  defaultTermYears?: number;
  hint: string;
}

export const LOAN_KINDS: LoanKindSpec[] = [
  {
    id: 'mortgage',
    label: '주택담보대출',
    method: 'amortized',
    hint: '실제 만기 기준 원리금균등으로 산정합니다.',
  },
  {
    id: 'credit',
    label: '신용대출',
    method: 'split',
    defaultTermYears: 5,
    hint: '원금을 산정만기로 나눠 반영합니다. 통상 5년을 적용합니다.',
  },
  {
    id: 'negative',
    label: '마이너스통장',
    method: 'split',
    defaultTermYears: 5,
    hint: '쓴 금액이 아니라 약정 한도 전액이 반영됩니다.',
  },
  {
    id: 'other',
    label: '기타대출',
    method: 'amortized',
    hint: '카드론·할부금융 등. 실제 만기로 산정합니다.',
  },
  {
    id: 'jeonse',
    label: '전세자금대출',
    method: 'excluded',
    hint: 'DSR 산정에서 빠집니다. 다만 금융사에 따라 이자만 반영하기도 합니다.',
  },
];

export const DSR = {
  verified: true,
  basisYear: 2026,

  /** 업권별 DSR 상한 */
  limits: [
    { id: 'bank', label: '은행권', rate: 40, hint: '시중은행·인터넷은행' },
    { id: 'nonbank', label: '제2금융권', rate: 50, hint: '저축은행·캐피탈·상호금융' },
  ],

  /**
   * 스트레스 DSR.
   * 2025년 7월 3단계 시행으로 사실상 모든 가계대출에 100% 적용된다.
   * 지방 주담대에 0.75%를 적용하던 유예는 2025년 12월말로 끝났다.
   */
  stress: {
    rate: 1.5,
    phase: '3단계',
    since: '2025년 7월',
    /** 신용대출은 잔액이 이 금액을 넘을 때만 스트레스 금리가 붙는다 */
    creditThreshold: 100_000_000,
  },

  sources: [
    {
      label: '금융위원회 — 3단계 스트레스 DSR 시행방안',
      url: 'https://www.fsc.go.kr/no010101/84617',
    },
    {
      label: '금융위원회 — 가계부채 관리방안',
      url: 'https://www.fsc.go.kr',
    },
  ],
} as const;

export const loanKindById = (id: LoanKind): LoanKindSpec =>
  LOAN_KINDS.find((k) => k.id === id) ?? LOAN_KINDS[0];
