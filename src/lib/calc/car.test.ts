/**
 * 자동차 할부 계산 검증.
 *
 * 유예할부(잔가보장) 산식과, 차값 외에 붙는 등록 비용을 중점적으로 본다.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCar,
  levelMonthlyPayment,
  deferredMonthlyPayment,
  termComparison,
  type CarInput,
} from './car.ts';
import { vehicleById } from '../rates/car.ts';

const base: CarInput = {
  price: 30_000_000,
  downPayment: 5_000_000,
  months: 60,
  annualRate: 5,
  vehicleKind: 'passenger',
  bondCost: 300_000,
  residualRate: 0,
};

const at = (over: Partial<CarInput> = {}) => calculateCar({ ...base, ...over });

const close = (a: number, b: number, tol = 2) =>
  assert.ok(Math.abs(a - b) <= tol, `${Math.round(a).toLocaleString()} vs ${Math.round(b).toLocaleString()}`);

test('할부원금은 차값에서 선수금을 뺀 값이다', () => {
  const r = at();
  assert.equal(r.principal, 25_000_000);
  assert.equal(r.downPayment, 5_000_000);
});

test('선수금이 차값보다 크면 차값까지만 인정된다', () => {
  const r = at({ downPayment: 50_000_000 });
  assert.equal(r.downPayment, 30_000_000);
  assert.equal(r.principal, 0);
  assert.equal(r.monthlyPayment, 0);
});

test('일반 할부 월 납입금이 원리금균등 공식과 맞는다', () => {
  const i = 0.05 / 12;
  const n = 60;
  const g = Math.pow(1 + i, n);
  const expected = (25_000_000 * i * g) / (g - 1);
  close(at().monthlyPayment, Math.floor(expected), 2);
});

test('총 이자는 낸 돈에서 원금을 뺀 값이다', () => {
  const r = at();
  // 상환표 기반이라 마지막 회차가 잔액을 흡수한다.
  // 그래서 월납 × 개월수가 아니라 합계가 정확한 값이다.
  assert.equal(r.totalPayments, r.principal + r.totalInterest);
  // 월납 × 개월수는 마지막 회차 조정분만큼만 어긋난다
  assert.ok(Math.abs(r.monthlyPayment * 60 - r.totalPayments) < r.monthlyPayment);
});

test('승용차 취득세는 차값의 7%다', () => {
  const r = at();
  assert.equal(r.acquisitionRate, 7);
  assert.equal(r.acquisitionTax, 2_100_000);
  assert.equal(r.taxRelief, 0);
});

test('경차는 4%에 75만원까지 감면된다', () => {
  // 1,500만원 경차 → 취득세 60만원, 감면 한도 안이라 전액 면제
  const cheap = at({ price: 15_000_000, vehicleKind: 'light' });
  assert.equal(cheap.acquisitionRate, 4);
  assert.equal(cheap.taxRelief, 600_000);
  assert.equal(cheap.acquisitionTax, 0);

  // 2,500만원 경차 → 취득세 100만원, 75만원만 감면
  const pricey = at({ price: 25_000_000, vehicleKind: 'light' });
  assert.equal(pricey.taxRelief, 750_000);
  assert.equal(pricey.acquisitionTax, 250_000);
});

test('차종별 취득세율이 레지스트리와 맞는다', () => {
  assert.equal(vehicleById('passenger').acquisitionRate, 7);
  assert.equal(vehicleById('light').acquisitionRate, 4);
  assert.equal(vehicleById('van').acquisitionRate, 5);
  assert.equal(vehicleById('motorcycle').acquisitionRate, 2);
  assert.equal(at({ vehicleKind: 'van' }).acquisitionTax, 1_500_000);
});

test('차값 외에 드는 돈이 총 비용에 더해진다', () => {
  const r = at();
  assert.equal(r.registrationCost, r.acquisitionTax + r.bondCost);
  assert.equal(r.registrationCost, 2_400_000);
  assert.equal(r.totalCost, r.downPayment + r.totalPayments + r.registrationCost);
  // 3,000만원 차가 실제로는 3,500만원을 넘는다
  assert.ok(r.totalCost > 35_000_000);
  assert.ok(r.costRatio > 115 && r.costRatio < 125, `${r.costRatio}%`);
});

test('유예할부 월 납입금이 잔가 공식과 맞는다', () => {
  const i = 0.05 / 12;
  const n = 36;
  const g = Math.pow(1 + i, n);
  const P = 30_000_000;
  const R = 12_000_000;
  const expected = ((P * g - R) * i) / (g - 1);
  close(deferredMonthlyPayment(P, R, 5, 36), expected, 0.01);
});

test('유예할부는 월 납입금이 낮지만 총 이자가 늘어난다', () => {
  const r = at({ downPayment: 0, months: 36, residualRate: 40 });
  assert.equal(r.isDeferred, true);
  assert.equal(r.residual, 12_000_000);
  assert.ok(r.comparison !== null);

  const c = r.comparison!;
  // 월 납입금은 확실히 낮다
  assert.ok(r.monthlyPayment < c.monthlyPayment);
  assert.ok(c.monthlyDiff > 250_000, `월 차이 ${c.monthlyDiff}`);
  // 대신 총 이자는 늘어난다
  assert.ok(r.totalInterest > c.totalInterest);
  assert.ok(c.interestDiff > 0);
});

test('잔가가 클수록 월 납입금이 낮아지고 총 이자가 늘어난다', () => {
  let prevMonthly = Number.POSITIVE_INFINITY;
  let prevInterest = 0;
  for (const residualRate of [10, 20, 30, 40, 50]) {
    const r = at({ downPayment: 0, months: 36, residualRate });
    assert.ok(r.monthlyPayment < prevMonthly, `잔가 ${residualRate}%에서 월납이 안 줄었다`);
    assert.ok(r.totalInterest > prevInterest, `잔가 ${residualRate}%에서 이자가 안 늘었다`);
    prevMonthly = r.monthlyPayment;
    prevInterest = r.totalInterest;
  }
});

test('유예할부의 총 상환액에 잔존가치가 포함된다', () => {
  const r = at({ downPayment: 0, months: 36, residualRate: 40 });
  // 월 납입금 합계만으로는 원금을 다 못 갚는다
  assert.ok(r.totalPayments < r.principal + r.totalInterest);
  // 잔존가치까지 더해야 맞는다
  close(r.totalPayments + r.residual - r.principal, r.totalInterest, 1);
});

test('잔가 0이면 일반 할부와 같다', () => {
  const level = at({ downPayment: 0, months: 36, residualRate: 0 });
  assert.equal(level.isDeferred, false);
  assert.equal(level.residual, 0);
  assert.equal(level.comparison, null);
  close(level.monthlyPayment, levelMonthlyPayment(30_000_000, 5, 36), 2);
});

test('기간이 길수록 월 납입금은 줄고 총 이자는 늘어난다', () => {
  const short = at({ months: 24 });
  const long = at({ months: 72 });
  assert.ok(long.monthlyPayment < short.monthlyPayment);
  assert.ok(long.totalInterest > short.totalInterest);
});

test('무이자 할부는 총 이자가 정확히 0이다', () => {
  // 월납을 반올림해 개월수로 곱하면 "총 이자 20원" 같은 잔돈이 생긴다.
  // 상환표를 쓰면 마지막 회차가 흡수하므로 정확히 0이 나온다.
  const r = at({ annualRate: 0 });
  assert.equal(r.totalInterest, 0);
  assert.equal(r.totalPayments, r.principal);

  const deferred = at({ annualRate: 0, downPayment: 0, residualRate: 40 });
  assert.equal(deferred.totalInterest, 0);
  assert.equal(deferred.totalPayments + deferred.residual, deferred.principal);
});

test('기간 비교표가 현재 선택을 표시한다', () => {
  const rows = termComparison(base);
  assert.equal(rows.length, 6);
  const current = rows.filter((r) => r.current);
  assert.equal(current.length, 1);
  assert.equal(current[0].months, 60);

  // 기간이 길수록 월납은 내려가고 이자는 올라간다
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].monthlyPayment < rows[i - 1].monthlyPayment);
    assert.ok(rows[i].totalInterest > rows[i - 1].totalInterest);
  }
});

test('0원과 잘못된 값에서도 깨지지 않는다', () => {
  const zero = at({ price: 0, downPayment: 0 });
  assert.equal(zero.principal, 0);
  assert.equal(zero.monthlyPayment, 0);
  assert.equal(zero.totalCost, zero.bondCost);
  assert.equal(zero.costRatio, 0);

  assert.equal(at({ price: -100 }).price, 0);
  assert.equal(at({ price: Number.NaN }).totalCost, base.bondCost);
});
