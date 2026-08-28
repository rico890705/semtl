/**
 * 예적금 이자 계산.
 *
 * 예금(목돈 예치)과 적금(매달 납입), 단리와 월복리의 네 조합을
 * 하나의 월 단위 시뮬레이션으로 처리한다. 닫힌 공식을 네 개 쓰는 것보다
 * 검증하기 쉽고, 회차별 표를 그대로 화면에 쓸 수 있다.
 *
 * 이 계산기에서 가장 중요한 것
 *
 *   "연 3% 적금인데 왜 이자가 원금의 3%가 아니지?"
 *
 * 적금은 첫 회차 납입금만 전 기간 예치되고 마지막 회차는 한 달만 예치된다.
 * 그래서 평균 예치기간이 절반 남짓이고, 원금 대비 실질 수익률도 표면금리의
 * 절반 정도가 된다. 12개월 적금이라면 (n+1)/(2n) = 13/24 ≈ 54% 수준이다.
 * 이걸 숫자로 보여주는 것이 이 계산기의 존재 이유다.
 */
import { floorToWon, floorTo10 } from './rounding.ts';

/** 예금(목돈 예치) / 적금(매달 납입) */
export type ProductKind = 'deposit' | 'installment';
/** 단리 / 월복리 */
export type InterestKind = 'simple' | 'compound';

export interface SavingsInput {
  product: ProductKind;
  interestKind: InterestKind;
  /** 예금이면 예치금액, 적금이면 월 납입액 */
  amount: number;
  /** 기간 (개월) */
  months: number;
  /** 연 이자율 (%) */
  annualRate: number;
  /** 이자소득 과세율 (소수. 예: 0.154) */
  taxRate: number;
}

export interface SavingsRow {
  month: number;
  /** 이번 달 납입액 */
  payment: number;
  cumulativePrincipal: number;
  /** 이번 달에 발생한 이자 */
  monthInterest: number;
  cumulativeInterest: number;
  /** 원금 + 누적이자 */
  balance: number;
}

export interface SavingsResult {
  product: ProductKind;
  interestKind: InterestKind;
  months: number;
  /** 표면금리 — 상품에 적힌 연 이자율 (%) */
  nominalRate: number;

  /** 총 납입 원금 */
  principal: number;
  /** 세전 이자 */
  grossInterest: number;
  tax: number;
  taxRate: number;
  /** 세후 이자 */
  netInterest: number;
  /** 세후 만기 수령액 */
  maturity: number;

  /** 원금 대비 세후 수익률 (%) */
  netYield: number;
  /** 위를 1년 기준으로 환산한 값 (%) */
  annualizedNetYield: number;
  /**
   * 원금 대비 세전 수익률을 연 환산한 값 (%).
   * 적금에서 표면금리와 비교하면 "왜 이자가 생각보다 적은지"가 드러난다.
   */
  annualizedGrossYield: number;
  /** 평균 예치기간 (개월) */
  averageHeldMonths: number;

  schedule: SavingsRow[];
}

const positive = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

/**
 * 월 단위 시뮬레이션.
 * 납입은 월초에 이뤄지고, 이자는 그 달 말에 붙는 것으로 본다.
 * 단리는 이자가 원금에만 붙고, 복리는 이자에도 붙는다.
 */
function simulate(input: SavingsInput): SavingsRow[] {
  const months = Math.max(0, Math.floor(input.months));
  const monthlyRate = positive(input.annualRate) / 100 / 12;
  const amount = positive(input.amount);
  const rows: SavingsRow[] = [];

  let principal = 0;
  let interest = 0;

  for (let month = 1; month <= months; month++) {
    // 예금은 첫 달에만 넣고, 적금은 매달 넣는다
    const payment = input.product === 'deposit' ? (month === 1 ? amount : 0) : amount;
    principal += payment;

    // 단리는 원금에만, 복리는 원금 + 그동안 쌓인 이자에 붙는다
    const base = input.interestKind === 'compound' ? principal + interest : principal;
    const monthInterest = base * monthlyRate;
    interest += monthInterest;

    rows.push({
      month,
      payment,
      cumulativePrincipal: principal,
      monthInterest,
      cumulativeInterest: interest,
      balance: principal + interest,
    });
  }

  return rows;
}

export function calculateSavings(input: SavingsInput): SavingsResult {
  const months = Math.max(0, Math.floor(input.months));
  const schedule = simulate({ ...input, months });
  const last = schedule[schedule.length - 1];

  const principal = last?.cumulativePrincipal ?? 0;
  // 이자는 원 단위로 절사한 뒤 과세한다
  const grossInterest = floorToWon(last?.cumulativeInterest ?? 0);
  const taxRate = Math.max(0, input.taxRate);
  const tax = floorTo10(grossInterest * taxRate);
  const netInterest = grossInterest - tax;

  const yieldPct = principal > 0 ? (netInterest / principal) * 100 : 0;
  const grossYieldPct = principal > 0 ? (grossInterest / principal) * 100 : 0;
  const annualize = months > 0 ? 12 / months : 0;

  /**
   * 평균 예치기간.
   * 예금은 전 기간, 적금은 각 회차가 (months - k + 1)개월씩 예치되므로 평균 (months+1)/2.
   */
  const averageHeldMonths =
    months === 0 ? 0 : input.product === 'deposit' ? months : (months + 1) / 2;

  return {
    product: input.product,
    interestKind: input.interestKind,
    months,
    nominalRate: positive(input.annualRate),
    principal,
    grossInterest,
    tax,
    taxRate,
    netInterest,
    maturity: principal + netInterest,
    netYield: yieldPct,
    annualizedNetYield: yieldPct * annualize,
    annualizedGrossYield: grossYieldPct * annualize,
    averageHeldMonths,
    schedule,
  };
}

/**
 * 같은 조건에서 단리와 복리를 나란히 비교한다.
 * "월복리가 얼마나 유리한가"는 자주 나오는 질문인데, 기간이 짧으면 차이가 거의 없다.
 */
export function compareInterestKinds(
  input: Omit<SavingsInput, 'interestKind'>,
): { simple: SavingsResult; compound: SavingsResult; difference: number } {
  const simple = calculateSavings({ ...input, interestKind: 'simple' });
  const compound = calculateSavings({ ...input, interestKind: 'compound' });
  return { simple, compound, difference: compound.maturity - simple.maturity };
}
