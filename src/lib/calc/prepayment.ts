/**
 * 중도상환수수료 계산.
 *
 *   수수료 = 수수료 대상금액 × 수수료율 × (잔존일수 ÷ 적용기간)
 *
 * 두 가지가 계산을 좌우한다.
 *
 * 1) 3년이라는 벽
 *    대출 만기가 30년이어도 수수료는 실행일로부터 3년까지만 붙는다.
 *    그래서 30년 대출도 "3년째 되는 날"을 만기로 놓고 잔존일수를 센다.
 *    3년이 지나면 수수료가 0이 된다.
 *
 * 2) 매년 10% 면제 (부동산담보대출)
 *    최초 대출금액의 10%까지는 해마다 수수료 없이 갚을 수 있다.
 *    잘 알려지지 않았는데 실제로 수수료를 크게 줄여준다.
 *    1억 대출이면 매년 1천만원까지는 공짜로 갚을 수 있다는 뜻이다.
 *
 * 수수료를 낼지 말지 판단하려면 수수료만 봐서는 안 된다.
 * 갚아서 앞으로 안 내게 되는 이자와 견줘야 한다.
 * 그래서 "수수료를 몇 개월치 이자로 회수하는가"를 함께 낸다.
 */
import { floorToWon } from './rounding.ts';
import { parseDate, toISO, addMonths, daysBetween } from '../date.ts';
import { PREPAYMENT, type LoanType } from '../rates/prepayment.ts';

export interface PrepaymentInput {
  loanType: LoanType;
  /** 최초 대출금액 — 10% 면제 한도의 기준 */
  originalPrincipal: number;
  /** 이번에 갚을 금액 */
  repayAmount: number;
  /** 수수료율 (%) */
  feeRate: number;
  /** 대출 실행일 (YYYY-MM-DD) */
  startDate: string;
  /** 상환 예정일 (YYYY-MM-DD) */
  repayDate: string;
  /** 대출 기간 (년) */
  loanYears: number;
  /** 연 대출금리 (%) — 회수 기간 판단용 */
  annualRate: number;
  /** 매년 10% 면제를 적용할지 */
  useFreeAllowance: boolean;
}

export interface PrepaymentResult {
  valid: boolean;
  reason?: string;

  /** 수수료 계산의 기준이 되는 만기 — 실제 만기와 3년 중 이른 쪽 */
  feeEndDate: string;
  /** 실행일부터 적용 만기까지의 일수 (분모) */
  feePeriodDays: number;
  /** 실행일부터 상환일까지 지난 일수 */
  elapsedDays: number;
  /** 상환일부터 적용 만기까지 남은 일수 (분자) */
  remainingDays: number;
  /** 잔존일수 ÷ 적용기간 (%) */
  remainingRatio: number;
  /** 수수료 기간이 이미 지났는가 */
  feeExempt: boolean;

  /** 매년 10% 면제로 빠지는 금액 */
  freeAllowance: number;
  /** 실제로 수수료가 붙는 금액 */
  chargeableAmount: number;

  feeRate: number;
  /** 중도상환수수료 */
  fee: number;
  /** 상환금액 대비 수수료 비율 (%) */
  effectiveRate: number;

  /** 갚아서 아끼는 연간 이자 */
  annualInterestSaved: number;
  /** 수수료를 이자 절약으로 회수하는 데 걸리는 개월 수 */
  breakEvenMonths: number;
}

const positive = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

const EMPTY: Omit<PrepaymentResult, 'valid' | 'reason'> = {
  feeEndDate: '',
  feePeriodDays: 0,
  elapsedDays: 0,
  remainingDays: 0,
  remainingRatio: 0,
  feeExempt: false,
  freeAllowance: 0,
  chargeableAmount: 0,
  feeRate: 0,
  fee: 0,
  effectiveRate: 0,
  annualInterestSaved: 0,
  breakEvenMonths: 0,
};

export function calculatePrepaymentFee(input: PrepaymentInput): PrepaymentResult {
  const start = parseDate(input.startDate);
  const repay = parseDate(input.repayDate);

  if (!start || !repay) {
    return { valid: false, reason: '대출 실행일과 상환 예정일을 입력해주세요.', ...EMPTY };
  }
  if (daysBetween(start, repay) < 0) {
    return { valid: false, reason: '상환일이 대출 실행일보다 빠릅니다.', ...EMPTY };
  }

  const loanYears = Math.max(1, Math.round(positive(input.loanYears) || 1));
  const originalPrincipal = positive(input.originalPrincipal);
  const repayAmount = Math.min(positive(input.repayAmount), originalPrincipal || Infinity);
  const feeRate = positive(input.feeRate);

  // 실제 만기와 3년 중 이른 쪽이 수수료 계산의 만기가 된다
  const actualEnd = addMonths(start, loanYears * 12);
  const feeLimitEnd = addMonths(start, PREPAYMENT.feePeriodYears * 12);
  const feeEnd = daysBetween(start, actualEnd) < daysBetween(start, feeLimitEnd) ? actualEnd : feeLimitEnd;

  const feePeriodDays = daysBetween(start, feeEnd);
  const elapsedDays = daysBetween(start, repay);
  const remainingDays = Math.max(0, daysBetween(repay, feeEnd));
  const remainingRatio = feePeriodDays > 0 ? (remainingDays / feePeriodDays) * 100 : 0;
  const feeExempt = remainingDays === 0;

  // 부동산담보대출은 해마다 최초 대출금액의 10%까지 수수료가 없다
  const freeAllowance =
    input.useFreeAllowance && input.loanType === 'mortgage'
      ? Math.min(repayAmount, floorToWon(originalPrincipal * PREPAYMENT.annualFreeRepaymentRatio))
      : 0;
  const chargeableAmount = Math.max(0, repayAmount - freeAllowance);

  const fee = feeExempt
    ? 0
    : floorToWon(chargeableAmount * (feeRate / 100) * (remainingDays / feePeriodDays));

  // 갚으면 앞으로 안 내게 되는 이자 — 수수료를 낼 값어치가 있는지 가늠하는 기준
  const annualInterestSaved = floorToWon(repayAmount * (positive(input.annualRate) / 100));
  const monthlySaved = annualInterestSaved / 12;
  const breakEvenMonths = monthlySaved > 0 ? fee / monthlySaved : 0;

  return {
    valid: true,
    feeEndDate: toISO(feeEnd),
    feePeriodDays,
    elapsedDays,
    remainingDays,
    remainingRatio,
    feeExempt,
    freeAllowance,
    chargeableAmount,
    feeRate,
    fee,
    effectiveRate: repayAmount > 0 ? (fee / repayAmount) * 100 : 0,
    annualInterestSaved,
    breakEvenMonths,
  };
}

export interface TimelineRow {
  /** 실행일로부터 지난 개월 수 */
  months: number;
  date: string;
  fee: number;
  remainingRatio: number;
  /** 지금 시점(입력한 상환일)에 가장 가까운 행인가 */
  current: boolean;
}

/**
 * "언제 갚으면 수수료가 얼마인가" 시간표.
 * 조금만 더 기다릴지 지금 갚을지 판단하는 데 쓴다.
 */
export function feeTimeline(input: PrepaymentInput, stepMonths = 6): TimelineRow[] {
  const start = parseDate(input.startDate);
  const repay = parseDate(input.repayDate);
  if (!start) return [];

  const totalMonths = PREPAYMENT.feePeriodYears * 12;
  const elapsed = repay ? daysBetween(start, repay) : 0;
  const rows: TimelineRow[] = [];

  let closest = Number.POSITIVE_INFINITY;
  let closestIndex = -1;

  for (let months = 0; months <= totalMonths; months += stepMonths) {
    const date = addMonths(start, months);
    const result = calculatePrepaymentFee({ ...input, repayDate: toISO(date) });
    const gap = Math.abs(daysBetween(start, date) - elapsed);
    if (gap < closest) {
      closest = gap;
      closestIndex = rows.length;
    }
    rows.push({
      months,
      date: toISO(date),
      fee: result.fee,
      remainingRatio: result.remainingRatio,
      current: false,
    });
  }

  if (closestIndex >= 0) rows[closestIndex].current = true;
  return rows;
}
