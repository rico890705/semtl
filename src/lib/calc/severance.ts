/**
 * 퇴직금 계산.
 *
 * 산식
 *   퇴직금 = 1일 평균임금 × 30일 × (재직일수 ÷ 365)
 *
 * 까다로운 지점 세 가지
 *
 * 1) 평균임금은 "퇴직 전 3개월"이지 "3개월치 월급"이 아니다.
 *    3개월의 실제 달력 일수(89~92일)로 나누므로 언제 퇴사하느냐에 따라 값이 달라진다.
 *
 * 2) 상여금과 연차수당은 3개월치만 반영한다.
 *    연간 금액 × 3/12 로 안분해 임금총액에 더한다.
 *
 * 3) 통상임금 비교 규정 — 자동 적용하지 않는다.
 *    근로기준법 제2조 제2항은 평균임금이 통상임금보다 적으면 통상임금을 쓰도록 한다.
 *    다만 두 값은 분모가 다르다. 평균임금은 달력 일수(약 91일)로 나누고,
 *    1일 통상임금은 소정근로시간 기준(월 209시간 ÷ 8시간 = 26.1일)으로 나눈다.
 *    이를 그대로 비교하면 상여금 없는 월급제 근로자는 거의 항상 통상임금이 높게 나와
 *    퇴직금이 15%가량 부풀어버린다. 이 조항의 취지는 결근·휴업으로 평균임금이
 *    비정상적으로 낮아진 경우를 구제하는 것이므로 그 결과는 취지와 맞지 않는다.
 *
 *    그래서 평균임금으로 계산하되(국내 계산기들의 공통 방식) 통상임금을 참고값으로
 *    함께 내보내고, 통상임금이 더 높으면 확인하도록 안내한다.
 *
 * 퇴직소득세는 근속연수로 나눠 12를 곱한 "환산급여"에 세율을 매긴 뒤 되돌린다.
 * 그래서 같은 금액이라도 오래 일했을수록 세금이 크게 줄어든다.
 */
import { ratesFor, type YearRates, type TaxBracket } from '../rates/index.ts';
import { floorToWon } from './rounding.ts';
import { parseDate, toISO, addDays, addMonths, daysBetween, splitDuration } from '../date.ts';

export interface SeveranceInput {
  /** 입사일 (YYYY-MM-DD) */
  startDate: string;
  /** 마지막 근무일 (YYYY-MM-DD) */
  lastWorkDate: string;
  /** 월 기본급 */
  monthlyBasePay: number;
  /** 월 고정수당 — 정기적·일률적으로 지급되는 것 */
  monthlyAllowance: number;
  /** 연간 상여금 총액 */
  annualBonus: number;
  /** 연차수당 (전년도 미사용분) */
  annualLeavePay: number;
  year?: number;
}

export interface AverageWageDetail {
  periodStart: string;
  periodEnd: string;
  /** 산정기간의 실제 달력 일수 */
  days: number;
  basePayTotal: number;
  allowanceTotal: number;
  /** 연간 상여금 × 3/12 */
  bonusPortion: number;
  /** 연차수당 × 3/12 */
  leavePayPortion: number;
  total: number;
  daily: number;
}

export interface OrdinaryWageDetail {
  monthly: number;
  hourly: number;
  daily: number;
}

export interface SeveranceTaxDetail {
  /** 퇴직소득금액 */
  income: number;
  /** 세법상 근속연수 (1년 미만 올림) */
  serviceYears: number;
  serviceYearDeduction: number;
  /** 환산급여 */
  converted: number;
  convertedDeduction: number;
  taxBase: number;
  bracket: TaxBracket;
  /** 환산산출세액 */
  convertedTax: number;
  incomeTax: number;
  localTax: number;
  total: number;
  /** 퇴직급여 대비 실효세율 (%) */
  effectiveRate: number;
}

export interface SeveranceResult {
  /** 지급 대상인가 */
  eligible: boolean;
  /** 대상이 아니면 그 이유 */
  reason?: string;

  year: number;
  ratesVerified: boolean;

  startDate: string;
  lastWorkDate: string;
  /** 퇴직일 = 마지막 근무일의 다음 날 */
  retireDate: string;
  serviceDays: number;
  serviceLabel: string;

  averageWage: AverageWageDetail;
  ordinaryWage: OrdinaryWageDetail;
  /** 퇴직금 계산에 쓰인 1일 임금 (평균임금) */
  appliedDaily: number;
  /**
   * 1일 통상임금이 1일 평균임금보다 큰가.
   * 참이면 통상임금 기준 적용 여부를 확인해보라고 안내한다 (자동 적용하지 않는 이유는 파일 상단 참고).
   */
  ordinaryExceedsAverage: boolean;

  /** 세전 퇴직금 */
  gross: number;
  tax: SeveranceTaxDetail;
  /** 세후 실수령 퇴직금 */
  net: number;
}

const DAYS_PER_YEAR = 365;
/** 퇴직금은 재직 1년 이상부터 발생한다 */
const MIN_SERVICE_DAYS = 365;

const positive = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

/** 근속연수공제 — 근속연수 구간별 누진 */
export function serviceYearDeduction(years: number, rates: YearRates): number {
  const bands = rates.severanceTax.serviceYearDeduction;
  let previousUpTo = 0;
  for (const band of bands) {
    if (years <= band.upToYears) {
      return band.base + (years - previousUpTo) * band.perYear;
    }
    previousUpTo = band.upToYears;
  }
  return bands[bands.length - 1].base;
}

/** 환산급여공제 — 환산급여 구간별 누진 */
export function convertedDeduction(converted: number, rates: YearRates): number {
  const bands = rates.severanceTax.convertedDeduction;
  let previousUpTo = 0;
  for (const band of bands) {
    if (converted <= band.upTo) {
      return band.base + (converted - previousUpTo) * band.rate;
    }
    previousUpTo = band.upTo;
  }
  return bands[bands.length - 1].base;
}

/**
 * 퇴직소득세.
 * 환산급여로 세율을 매기는 구조 덕분에 근속연수가 길수록 세부담이 크게 낮아진다.
 */
export function severanceTax(
  gross: number,
  serviceDays: number,
  rates: YearRates,
): SeveranceTaxDetail {
  const income = Math.max(0, gross);
  // 1년 미만 단수는 1년으로 본다
  const years = Math.max(1, Math.ceil(serviceDays / DAYS_PER_YEAR));

  const yearDeduction = serviceYearDeduction(years, rates);
  const afterYearDeduction = Math.max(0, income - yearDeduction);
  const converted = (afterYearDeduction / years) * 12;

  const convDeduction = Math.min(converted, convertedDeduction(converted, rates));
  const taxBase = Math.max(0, converted - convDeduction);

  const bracket = rates.incomeTax.brackets.find((b) => taxBase <= b.upTo)!;
  const convertedTax = Math.max(0, taxBase * bracket.rate - bracket.progressive);

  const incomeTax = floorToWon((convertedTax / 12) * years);
  const localTax = floorToWon(incomeTax * rates.incomeTax.localRate);

  return {
    income,
    serviceYears: years,
    serviceYearDeduction: yearDeduction,
    converted,
    convertedDeduction: convDeduction,
    taxBase,
    bracket,
    convertedTax,
    incomeTax,
    localTax,
    total: incomeTax + localTax,
    effectiveRate: income > 0 ? ((incomeTax + localTax) / income) * 100 : 0,
  };
}

const EMPTY_AVERAGE: AverageWageDetail = {
  periodStart: '',
  periodEnd: '',
  days: 0,
  basePayTotal: 0,
  allowanceTotal: 0,
  bonusPortion: 0,
  leavePayPortion: 0,
  total: 0,
  daily: 0,
};

export function calculateSeverance(input: SeveranceInput): SeveranceResult {
  const rates = ratesFor(input.year);
  const start = parseDate(input.startDate);
  const lastWork = parseDate(input.lastWorkDate);

  const basePay = positive(input.monthlyBasePay);
  const allowance = positive(input.monthlyAllowance);
  const bonus = positive(input.annualBonus);
  const leavePay = positive(input.annualLeavePay);

  // 통상임금은 날짜와 무관하게 구할 수 있으므로 먼저 계산해둔다
  const ordinaryMonthly = basePay + allowance;
  const ordinaryHourly = ordinaryMonthly / rates.monthlyWorkHours;
  const ordinaryWage: OrdinaryWageDetail = {
    monthly: ordinaryMonthly,
    hourly: ordinaryHourly,
    daily: ordinaryHourly * 8,
  };

  const invalid = (reason: string): SeveranceResult => ({
    eligible: false,
    reason,
    year: rates.year,
    ratesVerified: rates.verified,
    startDate: input.startDate,
    lastWorkDate: input.lastWorkDate,
    retireDate: '',
    serviceDays: 0,
    serviceLabel: '',
    averageWage: EMPTY_AVERAGE,
    ordinaryWage,
    appliedDaily: 0,
    ordinaryExceedsAverage: false,
    gross: 0,
    tax: severanceTax(0, 0, rates),
    net: 0,
  });

  if (!start || !lastWork) return invalid('입사일과 마지막 근무일을 입력해주세요.');
  if (daysBetween(start, lastWork) < 0) {
    return invalid('마지막 근무일이 입사일보다 빠릅니다.');
  }

  // 퇴직일은 마지막 근무일의 다음 날이다. 모든 기간 계산의 기준점이 된다.
  const retire = addDays(lastWork, 1);
  const serviceDays = daysBetween(start, retire);
  const serviceLabel = (() => {
    const d = splitDuration(start, retire);
    const parts: string[] = [];
    if (d.years) parts.push(`${d.years}년`);
    if (d.months) parts.push(`${d.months}개월`);
    if (d.days) parts.push(`${d.days}일`);
    return parts.join(' ') || '0일';
  })();

  // --- 평균임금 ---
  // 퇴직일 기준 직전 3개월. 달력 일수로 나누므로 89~92일 사이에서 값이 달라진다.
  const periodStart = addMonths(retire, -3);
  const periodDays = daysBetween(periodStart, retire);

  const basePayTotal = basePay * 3;
  const allowanceTotal = allowance * 3;
  const bonusPortion = (bonus * 3) / 12;
  const leavePayPortion = (leavePay * 3) / 12;
  const wageTotal = basePayTotal + allowanceTotal + bonusPortion + leavePayPortion;

  const averageWage: AverageWageDetail = {
    periodStart: toISO(periodStart),
    periodEnd: toISO(lastWork),
    days: periodDays,
    basePayTotal,
    allowanceTotal,
    bonusPortion,
    leavePayPortion,
    total: wageTotal,
    daily: periodDays > 0 ? wageTotal / periodDays : 0,
  };

  if (serviceDays < MIN_SERVICE_DAYS) {
    const result = invalid('계속근로기간이 1년 미만이면 퇴직금 지급 대상이 아닙니다.');
    return {
      ...result,
      retireDate: toISO(retire),
      serviceDays,
      serviceLabel,
      averageWage,
    };
  }

  // 퇴직금은 평균임금으로 계산한다 (통상임금 비교를 자동 적용하지 않는 이유는 파일 상단 참고)
  const appliedDaily = averageWage.daily;
  const gross = floorToWon(appliedDaily * 30 * (serviceDays / DAYS_PER_YEAR));
  const tax = severanceTax(gross, serviceDays, rates);

  return {
    eligible: true,
    year: rates.year,
    ratesVerified: rates.verified,
    startDate: toISO(start),
    lastWorkDate: toISO(lastWork),
    retireDate: toISO(retire),
    serviceDays,
    serviceLabel,
    averageWage,
    ordinaryWage,
    appliedDaily,
    ordinaryExceedsAverage: ordinaryWage.daily > averageWage.daily,
    gross,
    tax,
    net: gross - tax.total,
  };
}
