/**
 * 4대보험 계산 검증.
 *
 * 가장 중요한 것은 마지막 테스트다 — 실수령액 계산기와 4대보험 계산기가
 * 같은 급여에 대해 다른 숫자를 내놓으면 사이트 전체의 신뢰가 무너진다.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateInsurance, employeeInsurance, ratePct } from './insurance.ts';
import { calculateSalary } from './salary.ts';
import { ratesFor } from '../rates/index.ts';

const rates = ratesFor();

const options = {
  companySize: 'under150',
  industrialRate: rates.industrial.averageRate,
  monthlyNonTaxable: 0,
};
const at = (monthlyGross: number, overrides = {}) =>
  calculateInsurance({ monthlyGross, ...options, ...overrides });

test('근로자 부담 + 사업주 부담 = 총 보험료', () => {
  for (const pay of [1_000_000, 3_000_000, 5_000_000, 10_000_000]) {
    const r = at(pay);
    assert.equal(r.employeeTotal + r.employerTotal, r.grandTotal);
    const lineSum = r.lines.reduce((s, l) => s + l.total, 0);
    assert.equal(lineSum, r.grandTotal);
  }
});

test('각 항목에서 total = employee + employer', () => {
  const r = at(4_000_000);
  for (const line of r.lines) {
    assert.equal(line.total, line.employee + line.employer, `${line.label} 합계 불일치`);
  }
  assert.equal(r.lines.length, 6);
});

test('노사가 절반씩 부담하는 항목은 금액이 같다', () => {
  const r = at(4_000_000);
  for (const key of ['pension', 'health', 'longTermCare', 'employment']) {
    const line = r.lines.find((l) => l.key === key)!;
    assert.equal(line.employee, line.employer, `${line.label}이 노사 동일하지 않다`);
    assert.ok(line.employee > 0);
  }
});

test('산재보험과 고용안정사업은 근로자가 내지 않는다', () => {
  const r = at(4_000_000);
  const industrial = r.lines.find((l) => l.key === 'industrial')!;
  const stability = r.lines.find((l) => l.key === 'employmentStability')!;
  assert.equal(industrial.employee, 0);
  assert.equal(stability.employee, 0);
  assert.ok(industrial.employer > 0);
  assert.ok(stability.employer > 0);
});

test('사업주 부담이 근로자 부담보다 크다', () => {
  // 산재와 고용안정사업이 사업주에게만 붙기 때문이다
  const r = at(4_000_000);
  assert.ok(r.employerTotal > r.employeeTotal);
});

test('실질 인건비 = 세전 월급 + 사업주 부담', () => {
  const pay = 4_000_000;
  const r = at(pay);
  assert.equal(r.employerCost, pay + r.employerTotal);
  // 대략 월급의 110~115% 수준이어야 한다
  const ratio = r.employerCost / pay;
  assert.ok(ratio > 1.08 && ratio < 1.2, `실질 인건비 배수가 이상하다: ${ratio}`);
});

test('비과세액은 보험료에서 빠지지만 실질 인건비에는 그대로 들어간다', () => {
  // 회사는 식대도 실제로 지급한다. 보험료 산정 기준(과세대상)과 혼동하면 안 된다.
  const gross = 3_500_000;
  const meal = 200_000;
  const withMeal = at(gross, { monthlyNonTaxable: meal });
  const without = at(gross, { monthlyNonTaxable: 0 });

  assert.equal(withMeal.monthlyGross, gross);
  assert.equal(withMeal.monthlyTaxable, gross - meal);
  assert.ok(withMeal.employeeTotal < without.employeeTotal, '비과세로 보험료가 줄어야 한다');
  assert.ok(withMeal.employerTotal < without.employerTotal);

  // 실질 인건비는 과세대상이 아니라 세전 급여 기준이어야 한다
  assert.equal(withMeal.employerCost, gross + withMeal.employerTotal);
  assert.equal(
    withMeal.employerCost - withMeal.employerTotal - withMeal.monthlyTaxable,
    meal,
    '실질 인건비에서 비과세액이 누락됐다',
  );
});

test('비과세액이 급여보다 커도 과세대상이 음수가 되지 않는다', () => {
  const r = at(1_000_000, { monthlyNonTaxable: 5_000_000 });
  assert.equal(r.monthlyTaxable, 0);
  assert.equal(r.employeeTotal, 0);
  assert.equal(r.employerCost, 1_000_000);
});

test('국민연금은 기준소득월액 상한에서 노사 모두 멈춘다', () => {
  const capped = Math.floor((rates.pension.maxBase * rates.pension.employeeRate) / 10) * 10;
  const high = at(20_000_000);
  const higher = at(50_000_000);
  const line = high.lines.find((l) => l.key === 'pension')!;
  assert.equal(line.employee, capped);
  assert.equal(line.employer, capped);
  assert.equal(higher.lines.find((l) => l.key === 'pension')!.employee, capped);
  assert.equal(high.pensionCapped, true);
  assert.match(line.note, /상한/);
});

test('국민연금은 기준소득월액 하한 아래로 내려가지 않는다', () => {
  const floored = Math.floor((rates.pension.minBase * rates.pension.employeeRate) / 10) * 10;
  const low = at(200_000);
  assert.equal(low.lines.find((l) => l.key === 'pension')!.employee, floored);
  assert.equal(low.pensionFloored, true);
});

test('기업 규모가 커지면 고용안정사업 부담이 늘어난다', () => {
  const tiers = rates.employment.stabilityTiers;
  let previous = -1;
  for (const tier of tiers) {
    const r = at(4_000_000, { companySize: tier.id });
    const stability = r.lines.find((l) => l.key === 'employmentStability')!.employer;
    assert.ok(stability > previous, `${tier.label}에서 부담이 늘지 않았다`);
    previous = stability;
  }
});

test('모르는 기업 규모는 가장 낮은 구간으로 처리한다', () => {
  const unknown = at(4_000_000, { companySize: 'nonexistent' });
  const first = at(4_000_000, { companySize: rates.employment.stabilityTiers[0].id });
  assert.equal(
    unknown.lines.find((l) => l.key === 'employmentStability')!.employer,
    first.lines.find((l) => l.key === 'employmentStability')!.employer,
  );
});

test('산재 요율을 올리면 사업주 부담만 늘어난다', () => {
  const low = at(4_000_000, { industrialRate: 0.007 });
  const high = at(4_000_000, { industrialRate: 0.05 });
  assert.ok(high.employerTotal > low.employerTotal);
  assert.equal(high.employeeTotal, low.employeeTotal);
});

test('산재보험에 출퇴근재해 요율이 더해진다', () => {
  const r = at(4_000_000, { industrialRate: 0 });
  const industrial = r.lines.find((l) => l.key === 'industrial')!;
  const expected = Math.floor((4_000_000 * rates.industrial.commutingRate) / 10) * 10;
  assert.equal(industrial.employer, expected);
});

test('급여 0에서도 깨지지 않는다', () => {
  const r = at(0);
  assert.equal(r.employeeTotal, 0);
  assert.equal(r.employerTotal, 0);
  assert.equal(r.employerCost, 0);
});

test('요율 표기가 사람이 읽을 수 있게 나온다', () => {
  assert.equal(ratePct(0.045), '4.5%');
  assert.equal(ratePct(0.03545), '3.545%');
  assert.equal(ratePct(0.0025), '0.25%');
  assert.equal(ratePct(0.1295), '12.95%');
});

test('실수령액 계산기와 4대보험 근로자 부담분이 정확히 일치한다', () => {
  // 두 계산기가 같은 급여에 다른 숫자를 내놓으면 신뢰가 무너진다
  for (const annual of [24_000_000, 36_000_000, 50_000_000, 80_000_000, 200_000_000]) {
    const salary = calculateSalary({
      annualSalary: annual,
      severanceIncluded: false,
      dependents: 1,
      children: 0,
      monthlyNonTaxable: 200_000,
    });

    const insurance = calculateInsurance({
      ...options,
      monthlyGross: salary.monthlyGross,
      monthlyNonTaxable: salary.monthlyNonTaxable,
    });

    assert.equal(insurance.monthlyTaxable, salary.monthlyTaxable, '과세대상 급여가 어긋난다');

    const fromSalary = salary.deductions
      .filter((d) => ['pension', 'health', 'longTermCare', 'employment'].includes(d.key))
      .reduce((sum, d) => sum + d.monthly, 0);

    assert.equal(
      fromSalary,
      insurance.employeeTotal,
      `연봉 ${annual.toLocaleString()}원에서 두 계산기가 어긋난다`,
    );

    // 항목별로도 대조한다
    for (const key of ['pension', 'health', 'longTermCare', 'employment'] as const) {
      assert.equal(
        salary.deductions.find((d) => d.key === key)!.monthly,
        insurance.lines.find((l) => l.key === key)!.employee,
        `${key} 항목이 어긋난다`,
      );
    }
  }
});

test('employeeInsurance 합계가 항목 합과 맞는다', () => {
  const r = employeeInsurance(4_000_000, rates);
  assert.equal(r.total, r.pension + r.health + r.longTermCare + r.employment);
});
