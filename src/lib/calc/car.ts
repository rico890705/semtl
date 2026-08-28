/**
 * 자동차 할부 계산.
 *
 * 두 가지를 함께 답한다.
 *
 * 1) 월 얼마를 내는가
 *    할부원금 = 차량가격 − 선수금. 여기에 원리금균등을 적용한다.
 *
 * 2) 차를 사는 데 실제로 얼마가 드는가
 *    차값만 보고 계약했다가 취득세에서 놀라는 경우가 많다.
 *    3,000만원짜리 승용차면 취득세만 210만원이다.
 *
 * 유예할부(잔가보장형)
 *   만기에 차값의 일부(잔존가치)를 남겨두고 그동안은 나머지만 갚는 방식이다.
 *   월 납입금이 눈에 띄게 줄어들지만 두 가지 대가가 있다.
 *     - 남겨둔 원금에도 계속 이자가 붙어 총 이자가 늘어난다
 *     - 만기에 목돈을 한 번에 마련해야 한다
 *   광고에는 낮아진 월 납입금만 크게 나오므로 이 둘을 함께 보여준다.
 *
 *   월 납입금 = [P(1+i)^n − R] × i ÷ [(1+i)^n − 1]
 *   (P 할부원금, R 잔존가치, i 월이율, n 개월)
 */
import { buildSchedule } from './loan.ts';
import { floorToWon } from './rounding.ts';
import { CAR, vehicleById, type VehicleKind } from '../rates/car.ts';

export interface CarInput {
  /** 차량가격 — 세금 포함 출고가 */
  price: number;
  /** 선수금 (계약금) */
  downPayment: number;
  /** 할부 기간 (개월) */
  months: number;
  /** 연 할부금리 (%) */
  annualRate: number;
  vehicleKind: VehicleKind;
  /** 공채 매입 실부담액 — 즉시 매도 기준 */
  bondCost: number;
  /** 유예할부 잔존가치 비율 (%). 0이면 일반 할부. */
  residualRate: number;
}

export interface CarResult {
  price: number;
  downPayment: number;
  /** 할부원금 */
  principal: number;

  /** 잔존가치 (만기 일시상환액) */
  residual: number;
  isDeferred: boolean;

  monthlyPayment: number;
  months: number;
  /** 월 납입금 합계 */
  totalPayments: number;
  /** 총 이자 */
  totalInterest: number;

  /** 취득세 */
  acquisitionTax: number;
  acquisitionRate: number;
  /** 경차 등 감면액 */
  taxRelief: number;
  bondCost: number;
  /** 등록에 드는 부대비용 합계 */
  registrationCost: number;

  /** 차를 손에 넣기까지 실제로 나가는 총액 */
  totalCost: number;
  /** 차량가격 대비 총 비용 비율 (%) */
  costRatio: number;

  /** 같은 조건을 일반 할부로 했을 때 (유예할부 비교용) */
  comparison: {
    monthlyPayment: number;
    totalInterest: number;
    monthlyDiff: number;
    interestDiff: number;
  } | null;
}

const positive = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

/** 잔존가치를 남기는 할부의 월 납입금 */
export function deferredMonthlyPayment(
  principal: number,
  residual: number,
  annualRate: number,
  months: number,
): number {
  const n = Math.max(1, Math.round(months));
  const i = positive(annualRate) / 100 / 12;
  const P = positive(principal);
  const R = Math.min(positive(residual), P);

  if (i === 0) return (P - R) / n;

  const growth = Math.pow(1 + i, n);
  return ((P * growth - R) * i) / (growth - 1);
}

/** 일반 원리금균등 할부의 월 납입금 */
export function levelMonthlyPayment(
  principal: number,
  annualRate: number,
  months: number,
): number {
  const P = positive(principal);
  if (P === 0) return 0;
  const result = buildSchedule({
    principal: P,
    annualRate: positive(annualRate),
    years: 1,
    months: Math.max(1, Math.round(months)),
    method: 'equal-payment',
  });
  return result.schedule[0]?.payment ?? 0;
}

export function calculateCar(input: CarInput): CarResult {
  const price = positive(input.price);
  const downPayment = Math.min(positive(input.downPayment), price);
  const principal = price - downPayment;
  const months = Math.max(1, Math.round(positive(input.months) || 1));
  const annualRate = positive(input.annualRate);

  const residualRate = Math.min(90, positive(input.residualRate));
  const residual = floorToWon((price * residualRate) / 100);
  const isDeferred = residual > 0 && residual < principal;

  // --- 월 납입금 ---
  let monthlyPayment: number;
  let totalPayments: number;
  let totalInterest: number;

  if (isDeferred) {
    monthlyPayment = floorToWon(deferredMonthlyPayment(principal, residual, annualRate, months));
    totalPayments = monthlyPayment * months;
    // 만기 잔존가치까지 갚아야 원금이 다 나간다
    totalInterest = Math.max(0, totalPayments + residual - principal);
  } else if (principal === 0) {
    monthlyPayment = 0;
    totalPayments = 0;
    totalInterest = 0;
  } else {
    /*
     * 일반 할부는 상환표를 만들어 합계를 가져온다.
     * 월 납입금 × 개월수로 계산하면 반올림 잔돈이 쌓여
     * 무이자 할부인데 "총 이자 20원" 같은 값이 나온다.
     * 상환표는 마지막 회차가 잔액을 흡수하므로 합계가 정확하다.
     */
    const schedule = buildSchedule({
      principal,
      annualRate,
      years: 1,
      months,
      method: 'equal-payment',
    });
    monthlyPayment = schedule.schedule[0]?.payment ?? 0;
    totalInterest = schedule.totalInterest;
    totalPayments = schedule.totalPayment;
  }

  const totalRepaid = totalPayments + (isDeferred ? residual : 0);

  // --- 등록 비용 ---
  const spec = vehicleById(input.vehicleKind);
  const rawTax = floorToWon((price * spec.acquisitionRate) / 100);
  const taxRelief = Math.min(spec.reliefLimit, rawTax);
  const acquisitionTax = rawTax - taxRelief;
  const bondCost = positive(input.bondCost);
  const registrationCost = acquisitionTax + bondCost;

  // --- 총 비용 ---
  const totalCost = downPayment + totalRepaid + registrationCost;

  // --- 유예할부라면 일반 할부와 비교 ---
  let comparison: CarResult['comparison'] = null;
  if (isDeferred) {
    const levelMonthly = floorToWon(levelMonthlyPayment(principal, annualRate, months));
    const levelInterest = Math.max(0, levelMonthly * months - principal);
    comparison = {
      monthlyPayment: levelMonthly,
      totalInterest: levelInterest,
      monthlyDiff: levelMonthly - monthlyPayment,
      interestDiff: totalInterest - levelInterest,
    };
  }

  return {
    price,
    downPayment,
    principal,
    residual: isDeferred ? residual : 0,
    isDeferred,
    monthlyPayment,
    months,
    totalPayments,
    totalInterest,
    acquisitionTax,
    acquisitionRate: spec.acquisitionRate,
    taxRelief,
    bondCost,
    registrationCost,
    totalCost,
    costRatio: price > 0 ? (totalCost / price) * 100 : 0,
    comparison,
  };
}

export interface TermRow {
  months: number;
  monthlyPayment: number;
  totalInterest: number;
  current: boolean;
}

/**
 * 기간별 비교표.
 * "36개월로 할까 60개월로 할까"는 월 납입금과 총 이자의 맞교환이라
 * 나란히 놓고 봐야 판단이 선다.
 */
export function termComparison(input: CarInput): TermRow[] {
  return CAR.commonTerms.map((months) => {
    const r = calculateCar({ ...input, months });
    return {
      months,
      monthlyPayment: r.monthlyPayment,
      totalInterest: r.totalInterest,
      current: months === Math.round(input.months),
    };
  });
}
