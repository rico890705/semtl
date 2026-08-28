/**
 * 중도상환수수료.
 *
 * 2026-08-28 확인.
 *
 * 2025년 금융위원회가 "실비용만 반영" 원칙으로 산정 방식을 개편했다.
 * 그 결과 주택담보대출 수수료율이 종전 1.2~1.4%에서 0.5~0.8%대로 크게 내려갔다.
 * 상호금융권은 2026년 1월 1일부터 같은 방식이 적용된다.
 *
 * ⚠️ 요율은 금융사마다 다르다
 * 개편 이후에는 각 금융사가 실비용을 근거로 자체 산정해 공시한다.
 * 아래 값은 2026년 1월 기준 시중은행의 대표적인 수준이며,
 * 실제 요율은 대출 약정서나 해당 금융사 공시에서 확인해야 한다.
 * 그래서 화면에서도 사용자가 직접 고칠 수 있게 둔다.
 */

export type LoanType = 'mortgage' | 'credit';
export type RateType = 'variable' | 'fixed';

export interface FeeRateSpec {
  loanType: LoanType;
  rateType: RateType;
  /** 수수료율 (%) */
  rate: number;
}

export const PREPAYMENT = {
  verified: true,
  basisYear: 2026,

  /** 2026년 1월 이후 시중은행 대표 요율 */
  rates: [
    { loanType: 'mortgage', rateType: 'variable', rate: 0.55 },
    { loanType: 'mortgage', rateType: 'fixed', rate: 0.75 },
    { loanType: 'credit', rateType: 'variable', rate: 0.11 },
    { loanType: 'credit', rateType: 'fixed', rate: 0.18 },
  ] as FeeRateSpec[],

  /**
   * 수수료 부과 기간.
   * 대출 실행일로부터 이 기간이 지나면 수수료가 없다.
   * 대출 만기가 이보다 길어도 이 시점을 만기로 보고 계산한다.
   */
  feePeriodYears: 3,

  /**
   * 부동산담보대출은 매년 최초 대출금액의 이 비율까지 수수료 없이 갚을 수 있다.
   * 잘 알려지지 않았지만 실제로 수수료를 크게 줄여주는 규정이다.
   */
  annualFreeRepaymentRatio: 0.1,

  loanTypeLabels: { mortgage: '주택담보대출', credit: '신용대출' } as Record<LoanType, string>,
  rateTypeLabels: { variable: '변동금리', fixed: '고정·혼합금리' } as Record<RateType, string>,

  sources: [
    {
      label: '금융위원회 — 2026년 달라지는 금융제도 (중도상환수수료 개편)',
      url: 'https://www.fsc.go.kr/no010101/85970',
    },
    {
      label: 'KB국민은행 — 중도상환수수료 안내',
      url: 'https://kbthink.com/loan-guide/prepayment.html',
    },
  ],
} as const;

export function defaultFeeRate(loanType: LoanType, rateType: RateType): number {
  return (
    PREPAYMENT.rates.find((r) => r.loanType === loanType && r.rateType === rateType)?.rate ?? 0.55
  );
}
