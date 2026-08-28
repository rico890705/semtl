/**
 * 예적금 이자 계산 검증.
 *
 * 월 단위 시뮬레이션이 닫힌 공식과 일치하는지 네 조합 모두 대조한다.
 * 시뮬레이션은 회차별 표를 그대로 뽑아 쓸 수 있어 택했지만,
 * 공식과 어긋나면 조용히 틀린 숫자를 내놓게 되므로 반드시 묶어둔다.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSavings, compareInterestKinds, type SavingsInput } from './savings.ts';
import { taxOptionById, SAVINGS } from '../rates/savings.ts';

const base: Omit<SavingsInput, 'product' | 'interestKind' | 'amount'> = {
  months: 12,
  annualRate: 3,
  taxRate: 0,
};

const deposit = (overrides: Partial<SavingsInput> = {}) =>
  calculateSavings({
    ...base,
    product: 'deposit',
    interestKind: 'simple',
    amount: 10_000_000,
    ...overrides,
  });

const installment = (overrides: Partial<SavingsInput> = {}) =>
  calculateSavings({
    ...base,
    product: 'installment',
    interestKind: 'simple',
    amount: 1_000_000,
    ...overrides,
  });

const close = (actual: number, expected: number, tolerance = 2) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual.toLocaleString()} vs ${expected.toLocaleString()}`,
  );

test('예금 단리가 닫힌 공식과 일치한다', () => {
  // 이자 = 원금 × 연이율 × 기간/12
  const r = deposit();
  assert.equal(r.principal, 10_000_000);
  close(r.grossInterest, 10_000_000 * 0.03 * (12 / 12));
  assert.equal(r.grossInterest, 300_000);

  const half = deposit({ months: 6 });
  close(half.grossInterest, 10_000_000 * 0.03 * (6 / 12));
});

test('예금 월복리가 닫힌 공식과 일치한다', () => {
  const i = 0.03 / 12;
  const expected = 10_000_000 * Math.pow(1 + i, 12) - 10_000_000;
  const r = deposit({ interestKind: 'compound' });
  close(r.grossInterest, expected);
  assert.ok(r.grossInterest > 300_000, '복리가 단리보다 커야 한다');
});

test('적금 단리가 닫힌 공식과 일치한다', () => {
  // 이자 = 월납입액 × (연이율/12) × n(n+1)/2
  const n = 12;
  const expected = 1_000_000 * (0.03 / 12) * ((n * (n + 1)) / 2);
  const r = installment();
  assert.equal(r.principal, 12_000_000);
  close(r.grossInterest, expected);
  assert.equal(r.grossInterest, 195_000);
});

test('적금 월복리가 닫힌 공식과 일치한다', () => {
  // 기초 납입 연금의 미래가치: P × (1+i) × ((1+i)^n − 1) / i
  const i = 0.03 / 12;
  const n = 12;
  const fv = 1_000_000 * (1 + i) * ((Math.pow(1 + i, n) - 1) / i);
  const r = installment({ interestKind: 'compound' });
  close(r.grossInterest, fv - 12_000_000);
  assert.ok(r.grossInterest > 195_000, '복리가 단리보다 커야 한다');
});

test('회차별 표가 총액과 맞아떨어진다', () => {
  for (const product of ['deposit', 'installment'] as const) {
    for (const interestKind of ['simple', 'compound'] as const) {
      const r = calculateSavings({
        ...base,
        product,
        interestKind,
        amount: product === 'deposit' ? 10_000_000 : 1_000_000,
      });

      assert.equal(r.schedule.length, 12);
      const last = r.schedule[r.schedule.length - 1];
      assert.equal(last.cumulativePrincipal, r.principal);
      close(last.cumulativeInterest, r.grossInterest, 1);

      const paymentSum = r.schedule.reduce((s, row) => s + row.payment, 0);
      assert.equal(paymentSum, r.principal, `${product}/${interestKind} 납입 합계 불일치`);

      const interestSum = r.schedule.reduce((s, row) => s + row.monthInterest, 0);
      close(interestSum, last.cumulativeInterest, 1);
    }
  }
});

test('예금은 첫 달에만 납입하고 적금은 매달 납입한다', () => {
  const d = deposit().schedule;
  assert.equal(d[0].payment, 10_000_000);
  assert.ok(d.slice(1).every((row) => row.payment === 0));

  const i = installment().schedule;
  assert.ok(i.every((row) => row.payment === 1_000_000));
});

test('적금 실질 수익률은 표면금리의 (n+1)/(2n) 수준이다', () => {
  // 적금의 핵심 오해를 숫자로 못박는다
  const n = 12;
  const r = installment();
  const expectedRatio = (n + 1) / (2 * n); // 13/24 ≈ 0.5417
  close(r.annualizedGrossYield, r.nominalRate * expectedRatio, 0.01);
  close(r.annualizedGrossYield, 1.625, 0.01);
  assert.equal(r.averageHeldMonths, 6.5);
});

test('예금은 실질 수익률이 표면금리와 같다', () => {
  const r = deposit();
  close(r.annualizedGrossYield, r.nominalRate, 0.01);
  assert.equal(r.averageHeldMonths, 12);
});

test('적금 실질 수익률은 기간이 길어질수록 표면금리의 절반에 수렴한다', () => {
  /**
   * (n+1)/(2n) 은 n이 커질수록 1/2 로 내려간다.
   * 즉 적금은 오래 넣을수록 표면금리에 가까워지는 것이 아니라 오히려 멀어진다.
   * 직관과 반대라서 테스트로 못박아둔다.
   */
  const ratios = [1, 6, 12, 60, 120].map(
    (months) => installment({ months }).annualizedGrossYield / 3,
  );

  // 1개월이면 표면금리 그대로다 (납입금이 전 기간 예치되므로)
  close(ratios[0], 1, 0.001);

  // 기간이 길어질수록 단조 감소한다
  for (let i = 1; i < ratios.length; i++) {
    assert.ok(ratios[i] < ratios[i - 1], `${i}번째 구간에서 비율이 줄지 않았다`);
  }

  // 절반 아래로는 내려가지 않는다
  assert.ok(ratios[ratios.length - 1] > 0.5);
  close(ratios[ratios.length - 1], 121 / 240, 0.001);
});

test('이자소득세가 세전 이자에만 붙는다', () => {
  const taxed = installment({ taxRate: 0.154 });
  const free = installment({ taxRate: 0 });

  assert.equal(free.tax, 0);
  assert.equal(free.netInterest, free.grossInterest);

  assert.equal(taxed.grossInterest, free.grossInterest); // 세전 이자는 같다
  assert.equal(taxed.tax, Math.floor((195_000 * 0.154) / 10) * 10);
  assert.equal(taxed.netInterest, taxed.grossInterest - taxed.tax);
  assert.equal(taxed.maturity, taxed.principal + taxed.netInterest);
  // 원금에는 세금이 붙지 않는다
  assert.ok(taxed.maturity > taxed.principal);
});

test('과세 유형별 세율이 레지스트리와 맞는다', () => {
  assert.equal(taxOptionById('normal').rate, 0.154);
  assert.equal(taxOptionById('coop').rate, 0.014);
  assert.equal(taxOptionById('coop2026').rate, 0.05);
  assert.equal(taxOptionById('exempt').rate, 0);
  // 없는 id는 일반과세로 떨어진다
  assert.equal(taxOptionById('nope').id, 'normal');
  assert.equal(SAVINGS.taxOptions.length, 4);
});

test('비과세가 일반과세보다 많이 받는다', () => {
  const normal = installment({ taxRate: 0.154 });
  const exempt = installment({ taxRate: 0 });
  const coop = installment({ taxRate: 0.014 });
  assert.ok(exempt.maturity > coop.maturity);
  assert.ok(coop.maturity > normal.maturity);
});

test('복리가 단리보다 유리하되 기간이 짧으면 차이가 작다', () => {
  const short = compareInterestKinds({
    product: 'installment',
    amount: 1_000_000,
    months: 12,
    annualRate: 3,
    taxRate: 0.154,
  });
  assert.ok(short.difference > 0);
  // 12개월이면 차이가 원금의 0.05%도 안 된다
  assert.ok(short.difference < short.simple.principal * 0.0005);

  const long = compareInterestKinds({
    product: 'deposit',
    amount: 10_000_000,
    months: 120,
    annualRate: 5,
    taxRate: 0.154,
  });
  assert.ok(long.difference > short.difference, '기간이 길수록 복리 효과가 커진다');
});

test('이자율 0에서는 이자도 세금도 없다', () => {
  const r = installment({ annualRate: 0 });
  assert.equal(r.grossInterest, 0);
  assert.equal(r.tax, 0);
  assert.equal(r.maturity, r.principal);
  assert.equal(r.annualizedGrossYield, 0);
});

test('기간 0과 금액 0에서도 깨지지 않는다', () => {
  const noMonths = installment({ months: 0 });
  assert.equal(noMonths.principal, 0);
  assert.equal(noMonths.grossInterest, 0);
  assert.equal(noMonths.maturity, 0);
  assert.equal(noMonths.schedule.length, 0);
  assert.equal(noMonths.averageHeldMonths, 0);

  const noAmount = installment({ amount: 0 });
  assert.equal(noAmount.principal, 0);
  assert.equal(noAmount.maturity, 0);
});

test('음수와 잘못된 값을 0으로 처리한다', () => {
  assert.equal(installment({ amount: -100 }).principal, 0);
  assert.equal(installment({ annualRate: -5 }).grossInterest, 0);
  assert.equal(installment({ amount: Number.NaN }).principal, 0);
});
