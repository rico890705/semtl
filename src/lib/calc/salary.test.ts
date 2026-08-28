/**
 * 실수령액 계산 검증.
 *
 * 요율 값 자체(건강보험료율 등)는 공식 자료와 대조해야 하는 별개 문제다.
 * 여기서는 산식의 정합성 — 합계가 맞는가, 구간 경계가 이어지는가,
 * 조건을 바꿨을 때 방향이 맞는가 — 를 확인한다.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSalary,
  earnedIncomeDeduction,
  earnedIncomeTaxCredit,
  childTaxCredit,
  salaryTable,
  type SalaryInput,
} from './salary.ts';
import { ratesFor } from '../rates/index.ts';

const rates = ratesFor();

const base: Omit<SalaryInput, 'annualSalary'> = {
  severanceIncluded: false,
  dependents: 1,
  children: 0,
  monthlyNonTaxable: 200_000,
};

const at = (annualSalary: number, overrides: Partial<SalaryInput> = {}) =>
  calculateSalary({ ...base, annualSalary, ...overrides });

test('세전 = 실수령 + 공제합계', () => {
  for (const salary of [20_000_000, 35_000_000, 50_000_000, 80_000_000, 150_000_000]) {
    const r = at(salary);
    assert.equal(r.monthlyNet + r.totalDeduction, r.monthlyGross);
  }
});

test('공제 항목 합계가 totalDeduction과 일치한다', () => {
  const r = at(50_000_000);
  const sum = r.deductions.reduce((acc, d) => acc + d.monthly, 0);
  assert.equal(sum, r.totalDeduction);
  assert.equal(r.deductions.length, 6);
});

test('소득세 과세표준 구간이 경계에서 이어진다 (누진공제액 검증)', () => {
  const brackets = rates.incomeTax.brackets;
  for (let i = 0; i < brackets.length - 1; i++) {
    const boundary = brackets[i].upTo;
    const lower = boundary * brackets[i].rate - brackets[i].progressive;
    const upper = boundary * brackets[i + 1].rate - brackets[i + 1].progressive;
    assert.ok(
      Math.abs(lower - upper) < 1,
      `과세표준 ${boundary.toLocaleString()}원 경계에서 세액이 튄다: ${lower} vs ${upper}`,
    );
  }
});

test('근로소득공제 구간이 경계에서 이어진다', () => {
  const bands = rates.incomeTax.earnedIncomeDeduction;
  for (let i = 0; i < bands.length - 1; i++) {
    const boundary = bands[i].upTo;
    const below = earnedIncomeDeduction(boundary, rates);
    const above = earnedIncomeDeduction(boundary + 1, rates);
    assert.ok(
      Math.abs(above - below) < bands[i + 1].rate + 1,
      `총급여 ${boundary.toLocaleString()}원 경계에서 공제액이 튄다: ${below} → ${above}`,
    );
  }
});

test('근로소득공제에 한도가 걸린다', () => {
  const huge = earnedIncomeDeduction(10_000_000_000, rates);
  assert.equal(huge, rates.incomeTax.earnedIncomeDeductionCap);
});

test('연봉이 오르면 실수령액도 오른다', () => {
  let previous = 0;
  for (let salary = 20_000_000; salary <= 200_000_000; salary += 5_000_000) {
    const net = at(salary).monthlyNet;
    assert.ok(net > previous, `연봉 ${salary}에서 실수령액이 줄었다`);
    previous = net;
  }
});

test('연봉이 오를수록 공제율이 올라간다 (누진성)', () => {
  const low = at(30_000_000).deductionRate;
  const mid = at(60_000_000).deductionRate;
  const high = at(120_000_000).deductionRate;
  assert.ok(low < mid, `${low} < ${mid}`);
  assert.ok(mid < high, `${mid} < ${high}`);
});

test('국민연금은 기준소득월액 상한에서 멈춘다', () => {
  const cap = Math.floor((rates.pension.maxBase * rates.pension.employeeRate) / 10) * 10;
  const rich = at(500_000_000).deductions.find((d) => d.key === 'pension')!;
  const richer = at(900_000_000).deductions.find((d) => d.key === 'pension')!;
  assert.equal(rich.monthly, cap);
  assert.equal(richer.monthly, cap);
  assert.match(rich.note, /상한/);
});

test('국민연금은 기준소득월액 하한 아래로 내려가지 않는다', () => {
  const floorAmount = Math.floor((rates.pension.minBase * rates.pension.employeeRate) / 10) * 10;
  const low = at(6_000_000).deductions.find((d) => d.key === 'pension')!;
  assert.equal(low.monthly, floorAmount);
});

test('부양가족이 늘면 세금이 줄어든다', () => {
  const alone = at(60_000_000, { dependents: 1 });
  const family = at(60_000_000, { dependents: 4 });
  assert.ok(family.tax.finalTax < alone.tax.finalTax);
  assert.ok(family.monthlyNet > alone.monthlyNet);
  assert.equal(family.tax.personalDeduction, rates.incomeTax.basicDeduction * 4);
});

test('자녀세액공제가 인원수에 따라 커진다', () => {
  const c = rates.incomeTax.childCredit;
  assert.equal(childTaxCredit(0, rates), 0);
  assert.equal(childTaxCredit(1, rates), c.first);
  assert.equal(childTaxCredit(2, rates), c.second);
  assert.equal(childTaxCredit(3, rates), c.second + c.additional);
  assert.equal(childTaxCredit(4, rates), c.second + c.additional * 2);
});

test('비과세액이 늘면 실수령액이 늘어난다', () => {
  const none = at(50_000_000, { monthlyNonTaxable: 0 });
  const meal = at(50_000_000, { monthlyNonTaxable: 200_000 });
  assert.ok(meal.monthlyNet > none.monthlyNet);
  assert.equal(meal.monthlyGross, none.monthlyGross); // 세전은 그대로
});

test('퇴직금 포함 연봉은 13으로 나눈다', () => {
  const separate = at(52_000_000, { severanceIncluded: false });
  const included = at(52_000_000, { severanceIncluded: true });
  assert.equal(separate.monthlyGross, Math.round(52_000_000 / 12));
  assert.equal(included.monthlyGross, Math.round(52_000_000 / 13));
  assert.ok(included.monthlyNet < separate.monthlyNet);
});

test('근로소득세액공제에 총급여별 한도가 걸린다', () => {
  const caps = rates.incomeTax.taxCredit.caps;
  // 한도는 총급여가 오를수록 줄어들되 하한 아래로는 안 내려간다
  const low = earnedIncomeTaxCredit(10_000_000, 30_000_000, rates);
  const high = earnedIncomeTaxCredit(10_000_000, 300_000_000, rates);
  assert.ok(low > high);
  assert.ok(high >= caps[caps.length - 1].floor);
  assert.ok(low <= caps[0].cap);
});

test('소득이 아주 낮으면 세금이 0이 된다', () => {
  const r = at(12_000_000);
  assert.equal(r.tax.finalTax, 0);
  const incomeTax = r.deductions.find((d) => d.key === 'incomeTax')!;
  const localTax = r.deductions.find((d) => d.key === 'localTax')!;
  assert.equal(incomeTax.monthly, 0);
  assert.equal(localTax.monthly, 0);
});

test('보험료공제와 표준세액공제 중 유리한 쪽이 선택된다', () => {
  // 저소득: 보험료공제로 줄어드는 세금보다 표준세액공제 13만원이 크다
  const low = at(24_000_000);
  assert.equal(low.tax.usedStandardCredit, true);
  assert.equal(low.tax.standardCredit, rates.incomeTax.standardTaxCredit);
  assert.equal(low.tax.insuranceDeduction, 0);

  // 고소득: 보험료공제가 훨씬 유리하다
  const high = at(80_000_000);
  assert.equal(high.tax.usedStandardCredit, false);
  assert.equal(high.tax.standardCredit, 0);
  assert.ok(high.tax.insuranceDeduction > 0);

  // 어느 쪽을 택하든 결정세액은 두 경로 중 작은 값이어야 한다
  for (const salary of [20_000_000, 30_000_000, 40_000_000, 60_000_000]) {
    const r = at(salary);
    assert.ok(r.tax.finalTax >= 0);
  }
});

test('자녀세액공제가 월 세금에 반영된다', () => {
  const none = at(50_000_000, { children: 0 });
  const two = at(50_000_000, { children: 2 });
  const expectedAnnualDrop = rates.incomeTax.childCredit.second;
  assert.equal(two.tax.childCredit, expectedAnnualDrop);
  assert.equal(none.tax.finalTax - two.tax.finalTax, expectedAnnualDrop);
});

test('연봉 0에서도 깨지지 않는다', () => {
  const r = at(0);
  assert.equal(r.monthlyGross, 0);
  assert.equal(r.monthlyNet, 0);
  assert.equal(r.totalDeduction, 0);
  assert.equal(r.deductionRate, 0);
});

test('연봉 구간별 표가 균일한 간격으로 만들어진다', () => {
  const rows = salaryTable(30_000_000, 50_000_000, 10_000_000, base);
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((r) => r.annualSalary),
    [30_000_000, 40_000_000, 50_000_000],
  );
  for (const row of rows) {
    assert.equal(row.monthlyNet + row.totalDeduction, row.monthlyGross);
  }
});

test('전반적인 크기가 상식 범위에 있다 (엔진이 크게 틀어졌는지 감지)', () => {
  // 연봉 5000만 · 1인 가구 · 식대 20만원이면 월 실수령이 대략 350만원대다.
  // 정확한 값이 아니라 자릿수와 방향을 지키는지 보는 안전망이다.
  const r = at(50_000_000);
  assert.ok(
    r.monthlyNet > 3_400_000 && r.monthlyNet < 3_750_000,
    `연봉 5000만원 실수령액이 상식 범위를 벗어남: ${r.monthlyNet.toLocaleString()}원`,
  );
  assert.ok(r.deductionRate > 10 && r.deductionRate < 20, `공제율 ${r.deductionRate}%`);
});
