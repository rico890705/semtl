/**
 * 종합소득세 계산.
 *
 * 주 사용자는 프리랜서와 개인사업자다.
 * "3.3% 떼고 받았는데 5월에 더 내야 하나, 환급받나"가 이 계산기의 질문이다.
 *
 * 계산 순서
 *   1. 소득별로 소득금액을 구한다 (사업: 수입 − 필요경비, 근로: 총급여 − 근로소득공제)
 *   2. 합쳐서 종합소득금액
 *   3. − 소득공제(인적공제·연금보험료공제) → 과세표준
 *   4. × 누진세율 → 산출세액
 *   5. − 세액공제(근로소득·자녀·표준) → 결정세액
 *   6. − 기납부세액(원천징수 3%) → 납부하거나 환급받을 금액
 *
 * 근로소득세액공제의 안분
 *   근로소득과 사업소득이 함께 있으면 산출세액 전부에 근로소득세액공제를 주지 않는다.
 *   종합소득금액에서 근로소득금액이 차지하는 비율만큼만 대상이 된다.
 *
 * 표준세액공제
 *   근로소득이 있으면 13만원, 없으면 7만원이다.
 *   근로소득자는 보험료공제 등 특별소득공제를 받는 편이 유리한 경우가 많은데,
 *   그 비교는 연말정산 영역이라 여기서는 표준세액공제만 반영한다.
 *   근로소득만 있는 사람은 실수령액 계산기 쪽이 정확하다.
 */
import { ratesFor, type YearRates, type TaxBracket } from '../rates/index.ts';
import { floorToWon, floorTo10 } from './rounding.ts';
import { earnedIncomeDeduction, earnedIncomeTaxCredit, childTaxCredit } from './salary.ts';

export interface IncomeTaxInput {
  /** 사업(프리랜서) 수입금액 — 원천징수 전 총액 */
  businessRevenue: number;
  /** 필요경비 */
  businessExpense: number;
  /** 근로소득 총급여 (없으면 0) */
  earnedIncome: number;
  /** 그 밖의 종합소득금액 — 이자·배당·연금·기타 */
  otherIncome: number;
  /** 기본공제 대상 가족 수 (본인 포함) */
  dependents: number;
  /** 8세 이상 자녀 수 */
  children: number;
  /** 연금보험료공제 등 그 밖의 소득공제 */
  otherDeduction: number;
  /** 기납부세액 — 원천징수된 소득세 (지방소득세 제외) */
  prepaidTax: number;
  year?: number;
}

export interface IncomeTaxResult {
  year: number;

  businessIncome: number;
  earnedIncomeAmount: number;
  earnedIncomeDeductionAmount: number;
  otherIncome: number;
  /** 종합소득금액 */
  totalIncome: number;

  personalDeduction: number;
  otherDeduction: number;
  /** 과세표준 */
  taxBase: number;
  bracket: TaxBracket;
  /** 산출세액 */
  computedTax: number;

  earnedCredit: number;
  childCredit: number;
  standardCredit: number;
  /** 세액공제 합계 */
  totalCredit: number;
  /** 결정세액 */
  finalTax: number;

  prepaidTax: number;
  /** 양수면 추가 납부, 음수면 환급 */
  balance: number;
  /** 결정세액의 10% */
  localTax: number;
  prepaidLocalTax: number;
  localBalance: number;
  /** 소득세 + 지방소득세를 합친 최종 정산액 (양수 납부 / 음수 환급) */
  totalBalance: number;

  /** 종합소득금액 대비 실효세율 (%) */
  effectiveRate: number;
  hasEarnedIncome: boolean;
}

const positive = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

/** 사업소득 원천징수액 — 프리랜서 3.3% 중 소득세분 */
export function businessWithholding(revenue: number, rates: YearRates): number {
  return floorToWon(positive(revenue) * rates.incomeTax.businessWithholdingRate);
}

export function calculateIncomeTax(input: IncomeTaxInput): IncomeTaxResult {
  const rates = ratesFor(input.year);
  const tax = rates.incomeTax;

  // --- 1. 소득별 소득금액 ---
  const revenue = positive(input.businessRevenue);
  const expense = Math.min(positive(input.businessExpense), revenue);
  const businessIncome = revenue - expense;

  const grossPay = positive(input.earnedIncome);
  const eid = grossPay > 0 ? earnedIncomeDeduction(grossPay, rates) : 0;
  const earnedIncomeAmount = Math.max(0, grossPay - eid);

  const otherIncome = positive(input.otherIncome);
  const totalIncome = businessIncome + earnedIncomeAmount + otherIncome;

  // --- 2. 소득공제 → 과세표준 ---
  const personalDeduction = tax.basicDeduction * Math.max(1, Math.floor(input.dependents));
  const otherDeduction = positive(input.otherDeduction);
  const taxBase = Math.max(0, totalIncome - personalDeduction - otherDeduction);

  // --- 3. 산출세액 ---
  const bracket = tax.brackets.find((b) => taxBase <= b.upTo)!;
  const computedTax = Math.max(0, taxBase * bracket.rate - bracket.progressive);

  // --- 4. 세액공제 ---
  const hasEarnedIncome = grossPay > 0;

  // 근로소득세액공제는 산출세액 중 근로소득이 차지하는 몫에만 적용된다
  const earnedPortion = totalIncome > 0 ? earnedIncomeAmount / totalIncome : 0;
  const earnedCredit = hasEarnedIncome
    ? earnedIncomeTaxCredit(computedTax * earnedPortion, grossPay, rates)
    : 0;

  const childCreditAmount = childTaxCredit(input.children, rates);
  const standardCredit = hasEarnedIncome
    ? tax.standardTaxCredit
    : tax.standardTaxCreditNoEarned;

  const totalCredit = earnedCredit + childCreditAmount + standardCredit;
  const finalTax = floorToWon(Math.max(0, computedTax - totalCredit));

  // --- 5. 기납부세액과 정산 ---
  const prepaidTax = floorToWon(input.prepaidTax);
  const balance = finalTax - prepaidTax;

  const localTax = floorTo10(finalTax * tax.localRate);
  const prepaidLocalTax = floorTo10(prepaidTax * tax.localRate);
  const localBalance = localTax - prepaidLocalTax;

  return {
    year: rates.year,
    businessIncome,
    earnedIncomeAmount,
    earnedIncomeDeductionAmount: eid,
    otherIncome,
    totalIncome,
    personalDeduction,
    otherDeduction,
    taxBase,
    bracket,
    computedTax,
    earnedCredit,
    childCredit: childCreditAmount,
    standardCredit,
    totalCredit,
    finalTax,
    prepaidTax,
    balance,
    localTax,
    prepaidLocalTax,
    localBalance,
    totalBalance: balance + localBalance,
    effectiveRate: totalIncome > 0 ? (finalTax / totalIncome) * 100 : 0,
    hasEarnedIncome,
  };
}
