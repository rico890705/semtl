/**
 * 퇴직금 계산 검증.
 *
 * 평균임금 산정기간의 일수가 퇴사 시점에 따라 89~92일로 달라지는 점,
 * 상여금·연차수당의 3/12 안분, 퇴직소득세 구간 경계를 중점적으로 본다.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSeverance,
  serviceYearDeduction,
  convertedDeduction,
  severanceTax,
  type SeveranceInput,
} from './severance.ts';
import { ratesFor } from '../rates/index.ts';

const rates = ratesFor();

const base: Omit<SeveranceInput, 'startDate' | 'lastWorkDate'> = {
  monthlyBasePay: 3_000_000,
  monthlyAllowance: 0,
  annualBonus: 0,
  annualLeavePay: 0,
};

const at = (startDate: string, lastWorkDate: string, overrides: Partial<SeveranceInput> = {}) =>
  calculateSeverance({ ...base, startDate, lastWorkDate, ...overrides });

test('퇴직일은 마지막 근무일의 다음 날이다', () => {
  const r = at('2020-09-01', '2026-08-31');
  assert.equal(r.retireDate, '2026-09-01');
  // 재직일수는 양 끝을 포함한다
  assert.equal(r.serviceDays, 2191);
  assert.equal(r.serviceLabel, '6년');
});

test('평균임금 산정기간은 퇴직일 직전 3개월의 달력 일수다', () => {
  // 6·7·8월 = 30 + 31 + 31 = 92일
  const summer = at('2020-01-01', '2026-08-31');
  assert.equal(summer.averageWage.periodStart, '2026-06-01');
  assert.equal(summer.averageWage.periodEnd, '2026-08-31');
  assert.equal(summer.averageWage.days, 92);

  // 12·1·2월 = 31 + 31 + 28 = 90일
  const winter = at('2020-01-01', '2026-02-28');
  assert.equal(winter.averageWage.days, 90);

  // 같은 급여인데 산정기간이 짧으면 1일 평균임금이 커진다
  assert.ok(winter.averageWage.daily > summer.averageWage.daily);
});

test('상여금과 연차수당은 3/12만 반영된다', () => {
  const plain = at('2020-01-01', '2026-08-31');
  const withExtras = at('2020-01-01', '2026-08-31', {
    annualBonus: 12_000_000,
    annualLeavePay: 4_000_000,
  });

  assert.equal(withExtras.averageWage.bonusPortion, 3_000_000);
  assert.equal(withExtras.averageWage.leavePayPortion, 1_000_000);
  assert.equal(
    withExtras.averageWage.total,
    plain.averageWage.total + 3_000_000 + 1_000_000,
  );
  assert.ok(withExtras.gross > plain.gross);
});

test('퇴직금 = 1일 평균임금 × 30 × 재직일수/365', () => {
  const r = at('2020-09-01', '2026-08-31');
  const expected = Math.floor(r.averageWage.daily * 30 * (r.serviceDays / 365) + 1e-6);
  assert.equal(r.gross, expected);

  // 상여금이 없으면 대략 1년에 한 달치 월급 수준이어야 한다
  const perYear = r.gross / (r.serviceDays / 365);
  assert.ok(
    perYear > 2_800_000 && perYear < 3_100_000,
    `연간 퇴직금 적립액이 상식 범위를 벗어남: ${Math.round(perYear).toLocaleString()}원`,
  );
});

test('계속근로 1년 미만은 지급 대상이 아니다', () => {
  const short = at('2026-01-01', '2026-06-30');
  assert.equal(short.eligible, false);
  assert.equal(short.gross, 0);
  assert.match(short.reason ?? '', /1년 미만/);

  // 정확히 365일이면 대상이다
  const exactly = at('2025-01-01', '2025-12-31');
  assert.equal(exactly.serviceDays, 365);
  assert.equal(exactly.eligible, true);
  assert.ok(exactly.gross > 0);

  const oneDayShort = at('2025-01-02', '2025-12-31');
  assert.equal(oneDayShort.serviceDays, 364);
  assert.equal(oneDayShort.eligible, false);
});

test('잘못된 입력을 안내 문구와 함께 돌려준다', () => {
  assert.equal(at('', '2026-08-31').eligible, false);
  assert.match(at('2026-08-31', '2020-01-01').reason ?? '', /빠릅니다/);
  assert.equal(at('2026-02-30', '2026-08-31').eligible, false);
});

test('통상임금은 참고값으로만 내보내고 자동 적용하지 않는다', () => {
  const r = at('2020-01-01', '2026-08-31');
  // 월 209시간 기준 시급 × 8
  assert.equal(r.ordinaryWage.hourly, 3_000_000 / rates.monthlyWorkHours);
  assert.equal(r.ordinaryWage.daily, (3_000_000 / rates.monthlyWorkHours) * 8);

  // 퇴직금은 어디까지나 평균임금으로 계산된다
  assert.equal(r.appliedDaily, r.averageWage.daily);
  assert.equal(r.ordinaryExceedsAverage, r.ordinaryWage.daily > r.averageWage.daily);
});

test('근속연수공제 구간이 경계에서 이어진다', () => {
  const bands = rates.severanceTax.serviceYearDeduction;
  for (let i = 0; i < bands.length - 1; i++) {
    const boundary = bands[i].upToYears;
    const below = serviceYearDeduction(boundary, rates);
    const above = serviceYearDeduction(boundary + 1, rates);
    assert.equal(
      above - below,
      bands[i + 1].perYear,
      `근속 ${boundary}년 경계에서 공제액이 튄다`,
    );
  }
  // 알려진 값 몇 개
  assert.equal(serviceYearDeduction(5, rates), 5_000_000);
  assert.equal(serviceYearDeduction(10, rates), 15_000_000);
  assert.equal(serviceYearDeduction(20, rates), 40_000_000);
});

test('환산급여공제 구간이 경계에서 이어진다', () => {
  const bands = rates.severanceTax.convertedDeduction;
  for (let i = 0; i < bands.length - 1; i++) {
    const boundary = bands[i].upTo;
    const below = convertedDeduction(boundary, rates);
    const above = convertedDeduction(boundary + 1, rates);
    assert.ok(
      Math.abs(above - below - bands[i + 1].rate) < 1,
      `환산급여 ${boundary.toLocaleString()}원 경계에서 공제액이 튄다: ${below} → ${above}`,
    );
  }
  assert.equal(convertedDeduction(8_000_000, rates), 8_000_000);
  assert.equal(convertedDeduction(70_000_000, rates), 45_200_000);
  assert.equal(convertedDeduction(100_000_000, rates), 61_700_000);
});

test('세법상 근속연수는 1년 미만을 올린다', () => {
  assert.equal(severanceTax(10_000_000, 365, rates).serviceYears, 1);
  assert.equal(severanceTax(10_000_000, 366, rates).serviceYears, 2);
  assert.equal(severanceTax(10_000_000, 2191, rates).serviceYears, 7);
});

test('근속연수가 길수록 실효세율이 낮아진다', () => {
  const amount = 50_000_000;
  const short = severanceTax(amount, 365 * 3, rates);
  const long = severanceTax(amount, 365 * 20, rates);
  assert.ok(
    long.effectiveRate < short.effectiveRate,
    `${long.effectiveRate}% < ${short.effectiveRate}%`,
  );
});

test('퇴직소득세는 근로소득세보다 훨씬 가볍다', () => {
  // 6년 근속에 1,700만원대 퇴직금이면 실효세율이 몇 % 수준이어야 한다
  const r = at('2020-09-01', '2026-08-31');
  assert.ok(r.tax.effectiveRate < 5, `실효세율이 지나치게 높다: ${r.tax.effectiveRate}%`);
  assert.equal(r.net, r.gross - r.tax.total);
  assert.equal(r.tax.total, r.tax.incomeTax + r.tax.localTax);
});

test('지방소득세는 소득세의 10%다', () => {
  const r = at('2010-01-01', '2026-08-31', { monthlyBasePay: 8_000_000 });
  assert.equal(r.tax.localTax, Math.floor(r.tax.incomeTax * 0.1 + 1e-6));
  assert.ok(r.tax.incomeTax > 0);
});

test('퇴직급여가 공제액보다 적으면 세금이 0이다', () => {
  const r = at('2024-01-01', '2025-12-31', { monthlyBasePay: 2_000_000 });
  assert.equal(r.eligible, true);
  assert.equal(r.tax.total, 0);
  assert.equal(r.net, r.gross);
});

test('오래 근속하고 급여가 높으면 세금이 실제로 발생한다', () => {
  const r = at('2000-01-01', '2026-08-31', { monthlyBasePay: 10_000_000 });
  assert.ok(r.gross > 250_000_000, `퇴직금 ${r.gross.toLocaleString()}원`);
  assert.ok(r.tax.total > 0);
  assert.ok(r.tax.effectiveRate > 0 && r.tax.effectiveRate < 30);
  assert.equal(r.net, r.gross - r.tax.total);
});

test('수당이 평균임금과 통상임금 양쪽에 반영된다', () => {
  const withoutAllowance = at('2020-01-01', '2026-08-31');
  const withAllowance = at('2020-01-01', '2026-08-31', { monthlyAllowance: 500_000 });

  assert.equal(withAllowance.averageWage.allowanceTotal, 1_500_000);
  assert.ok(withAllowance.gross > withoutAllowance.gross);
  assert.equal(withAllowance.ordinaryWage.monthly, 3_500_000);
});
