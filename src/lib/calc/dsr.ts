/**
 * DSR(총부채원리금상환비율) 계산.
 *
 *   DSR = 연간 원리금상환액 ÷ 연소득 × 100
 *
 * 이 계산기가 실제로 답하는 질문은 이것이다.
 *   "내 소득과 기존 대출로 주택담보대출을 얼마까지 받을 수 있나?"
 *
 * 그래서 계산은 두 방향으로 간다.
 *   정방향  기존 대출 → 현재 DSR
 *   역방향  남은 DSR 여력 → 받을 수 있는 신규 대출 원금
 *
 * 스트레스 금리
 *   한도를 정할 때는 실제 금리에 스트레스 금리를 더한 값으로 계산한다.
 *   금리 4%로 빌려도 한도는 5.5% 기준으로 정해지므로 받을 수 있는 금액이 줄어든다.
 *   반면 실제 상환액은 원래 금리로 계산되므로, 한도만 깎이고 월 상환액은 그대로다.
 *   이 낙차를 보여주는 것이 이 계산기의 핵심이다.
 */
import { buildSchedule, principalFromPayment } from './loan.ts';
import { floorToWon } from './rounding.ts';
import { DSR, loanKindById, type LoanKind } from '../rates/dsr.ts';

export interface ExistingLoan {
  id: string;
  kind: LoanKind;
  /** 잔액 (마이너스통장은 약정 한도) */
  balance: number;
  /** 연 이자율 (%) */
  annualRate: number;
  /** 남은 만기 (년). split 방식에서는 산정만기로 쓰인다. */
  termYears: number;
}

export interface LoanBurden {
  loan: ExistingLoan;
  label: string;
  /** DSR에 반영되는 연간 원리금 */
  annualPayment: number;
  /** 연간 원금 상환분 */
  annualPrincipal: number;
  /** 연간 이자 */
  annualInterest: number;
  /** DSR 산정에서 제외되는 대출인가 */
  excluded: boolean;
  note: string;
}

export interface NewLoanTerms {
  /** 실제 적용받는 연 이자율 (%) */
  annualRate: number;
  years: number;
  /** 스트레스 금리를 적용할지 */
  applyStress: boolean;
}

export interface DsrResult {
  annualIncome: number;
  /** 적용한 DSR 상한 (%) */
  limitRate: number;

  burdens: LoanBurden[];
  /** 기존 대출의 연간 원리금 합계 */
  existingAnnualPayment: number;
  /** 기존 대출만으로 계산한 DSR (%) */
  currentDsr: number;

  /** 상한까지 쓸 수 있는 연간 원리금 총액 */
  allowedAnnualPayment: number;
  /** 신규 대출에 쓸 수 있는 연간 원리금 */
  availableAnnualPayment: number;
  /** 이미 상한을 넘었는가 */
  overLimit: boolean;

  /** 한도 산정에 쓰인 금리 (실제 금리 + 스트레스 금리) */
  stressedRate: number;
  stressRate: number;
  /** 스트레스 금리를 적용한 신규 대출 한도 */
  newLoanLimit: number;
  /** 스트레스 금리가 없었다면 받을 수 있었을 한도 */
  limitWithoutStress: number;
  /** 스트레스 금리 때문에 줄어든 금액 */
  stressReduction: number;

  /** 한도까지 빌렸을 때 실제 월 상환액 (원래 금리 기준) */
  actualMonthlyPayment: number;
  /** 신규 대출까지 포함한 DSR (%) */
  projectedDsr: number;
}

const positive = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

/** 대출 하나가 DSR에 얹는 연간 부담 */
export function loanBurden(loan: ExistingLoan): LoanBurden {
  const spec = loanKindById(loan.kind);
  const balance = positive(loan.balance);
  const rate = positive(loan.annualRate);
  const years = Math.max(1, Math.round(positive(loan.termYears) || 1));

  if (spec.method === 'excluded' || balance === 0) {
    return {
      loan,
      label: spec.label,
      annualPayment: 0,
      annualPrincipal: 0,
      annualInterest: 0,
      excluded: spec.method === 'excluded',
      note: spec.method === 'excluded' ? 'DSR 산정 제외' : '잔액 없음',
    };
  }

  if (spec.method === 'interest') {
    const interest = floorToWon(balance * (rate / 100));
    return {
      loan,
      label: spec.label,
      annualPayment: interest,
      annualPrincipal: 0,
      annualInterest: interest,
      excluded: false,
      note: '이자만 반영',
    };
  }

  if (spec.method === 'split') {
    // 원금을 산정만기로 나누고 이자를 더한다
    const principal = floorToWon(balance / years);
    const interest = floorToWon(balance * (rate / 100));
    return {
      loan,
      label: spec.label,
      annualPayment: principal + interest,
      annualPrincipal: principal,
      annualInterest: interest,
      excluded: false,
      note: `원금을 ${years}년으로 나눠 반영`,
    };
  }

  // 원리금균등 — 첫 해 12회분을 연간 부담으로 본다
  const result = buildSchedule({
    principal: balance,
    annualRate: rate,
    years,
    method: 'equal-payment',
  });
  const firstYear = result.schedule.slice(0, 12);
  const annualPrincipal = firstYear.reduce((s, r) => s + r.principal, 0);
  const annualInterest = firstYear.reduce((s, r) => s + r.interest, 0);

  return {
    loan,
    label: spec.label,
    annualPayment: annualPrincipal + annualInterest,
    annualPrincipal,
    annualInterest,
    excluded: false,
    note: `${years}년 원리금균등 기준`,
  };
}

export interface DsrInput {
  annualIncome: number;
  /** DSR 상한 (%) */
  limitRate: number;
  existingLoans: ExistingLoan[];
  newLoan: NewLoanTerms;
}

export function calculateDsr(input: DsrInput): DsrResult {
  const annualIncome = positive(input.annualIncome);
  const limitRate = positive(input.limitRate);

  const burdens = input.existingLoans.map(loanBurden);
  const existingAnnualPayment = burdens.reduce((sum, b) => sum + b.annualPayment, 0);

  const currentDsr = annualIncome > 0 ? (existingAnnualPayment / annualIncome) * 100 : 0;
  const allowedAnnualPayment = floorToWon((annualIncome * limitRate) / 100);
  const availableAnnualPayment = Math.max(0, allowedAnnualPayment - existingAnnualPayment);
  const overLimit = existingAnnualPayment > allowedAnnualPayment;

  // --- 신규 대출 한도 역산 ---
  const stressRate = input.newLoan.applyStress ? DSR.stress.rate : 0;
  const baseRate = positive(input.newLoan.annualRate);
  const stressedRate = baseRate + stressRate;
  const years = Math.max(1, Math.round(positive(input.newLoan.years) || 1));
  const monthlyBudget = availableAnnualPayment / 12;

  const newLoanLimit = floorToWon(principalFromPayment(monthlyBudget, stressedRate, years));
  const limitWithoutStress = floorToWon(principalFromPayment(monthlyBudget, baseRate, years));

  // 한도만큼 빌렸을 때 실제로 내는 돈은 원래 금리 기준이다
  const actual =
    newLoanLimit > 0
      ? buildSchedule({
          principal: newLoanLimit,
          annualRate: baseRate,
          years,
          method: 'equal-payment',
        })
      : null;
  const actualMonthlyPayment = actual?.schedule[0]?.payment ?? 0;

  const projectedAnnual = existingAnnualPayment + actualMonthlyPayment * 12;
  const projectedDsr = annualIncome > 0 ? (projectedAnnual / annualIncome) * 100 : 0;

  return {
    annualIncome,
    limitRate,
    burdens,
    existingAnnualPayment,
    currentDsr,
    allowedAnnualPayment,
    availableAnnualPayment,
    overLimit,
    stressedRate,
    stressRate,
    newLoanLimit,
    limitWithoutStress,
    stressReduction: Math.max(0, limitWithoutStress - newLoanLimit),
    actualMonthlyPayment,
    projectedDsr,
  };
}
