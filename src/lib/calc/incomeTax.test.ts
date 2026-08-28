/**
 * 종합소득세 계산 검증.
 *
 * 프리랜서 정산(환급이냐 추가 납부냐)이 이 계산기의 핵심 출력이라
 * 기납부세액과의 차액이 맞는지, 근로소득이 섞였을 때 세액공제 안분이
 * 제대로 되는지를 집중적으로 본다.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateIncomeTax, businessWithholding, type IncomeTaxInput } from './incomeTax.ts';
import { ratesFor } from '../rates/index.ts';

const rates = ratesFor();

const base: IncomeTaxInput = {
  businessRevenue: 30_000_000,
  businessExpense: 18_000_000,
  earnedIncome: 0,
  otherIncome: 0,
  dependents: 1,
  children: 0,
  otherDeduction: 0,
  prepaidTax: 900_000,
};

const at = (overrides: Partial<IncomeTaxInput> = {}) =>
  calculateIncomeTax({ ...base, ...overrides });

test('사업소득만 있을 때 소득금액은 수입에서 경비를 뺀 값이다', () => {
  const r = at();
  assert.equal(r.businessIncome, 12_000_000);
  assert.equal(r.totalIncome, 12_000_000);
  assert.equal(r.earnedIncomeAmount, 0);
  assert.equal(r.hasEarnedIncome, false);
});

test('프리랜서 정산 — 기납부세액이 결정세액보다 크면 환급이다', () => {
  const r = at();
  // 과세표준 = 1,200만 − 인적공제 150만 = 1,050만 → 6% 구간
  assert.equal(r.taxBase, 10_500_000);
  assert.equal(r.bracket.rate, 0.06);
  assert.equal(r.computedTax, 630_000);
  // 근로소득이 없으므로 표준세액공제 7만원
  assert.equal(r.standardCredit, 70_000);
  assert.equal(r.finalTax, 560_000);
  assert.equal(r.prepaidTax, 900_000);
  assert.equal(r.balance, -340_000, '34만원 환급이어야 한다');
  assert.ok(r.totalBalance < 0);
});

test('소득이 크면 추가 납부가 된다', () => {
  const r = at({
    businessRevenue: 80_000_000,
    businessExpense: 32_000_000,
    prepaidTax: 2_400_000,
  });
  assert.equal(r.businessIncome, 48_000_000);
  assert.equal(r.taxBase, 46_500_000);
  assert.equal(r.bracket.rate, 0.15);
  assert.equal(r.computedTax, 5_715_000);
  assert.equal(r.finalTax, 5_645_000);
  assert.equal(r.balance, 3_245_000);
  assert.ok(r.totalBalance > r.balance, '지방소득세까지 더하면 더 커진다');
});

test('지방소득세는 결정세액의 10%이고 따로 정산된다', () => {
  const r = at();
  assert.equal(r.localTax, Math.floor((r.finalTax * 0.1) / 10) * 10);
  assert.equal(r.prepaidLocalTax, Math.floor((r.prepaidTax * 0.1) / 10) * 10);
  assert.equal(r.localBalance, r.localTax - r.prepaidLocalTax);
  assert.equal(r.totalBalance, r.balance + r.localBalance);
});

test('원천징수 3%가 기납부세액의 기본값과 맞는다', () => {
  assert.equal(businessWithholding(30_000_000, rates), 900_000);
  assert.equal(businessWithholding(50_000_000, rates), 1_500_000);
  assert.equal(businessWithholding(0, rates), 0);
  assert.equal(businessWithholding(-100, rates), 0);
});

test('근로소득이 있으면 표준세액공제가 13만원으로 올라간다', () => {
  const onlyBusiness = at();
  const withJob = at({ earnedIncome: 40_000_000 });

  assert.equal(onlyBusiness.standardCredit, rates.incomeTax.standardTaxCreditNoEarned);
  assert.equal(withJob.standardCredit, rates.incomeTax.standardTaxCredit);
  assert.equal(withJob.hasEarnedIncome, true);
});

test('근로소득은 근로소득공제를 뺀 금액으로 합산된다', () => {
  const r = at({ earnedIncome: 50_000_000 });
  // 5,000만 → 근로소득공제 1,225만
  assert.equal(r.earnedIncomeDeductionAmount, 12_250_000);
  assert.equal(r.earnedIncomeAmount, 37_750_000);
  assert.equal(r.totalIncome, 12_000_000 + 37_750_000);
});

test('근로소득세액공제는 종합소득 중 근로소득 몫에만 적용된다', () => {
  // 근로소득만 있는 경우와, 같은 급여에 사업소득이 얹힌 경우를 비교한다
  const onlyJob = at({ businessRevenue: 0, businessExpense: 0, earnedIncome: 50_000_000, prepaidTax: 0 });
  const mixed = at({ earnedIncome: 50_000_000, prepaidTax: 0 });

  assert.ok(onlyJob.earnedCredit > 0);
  assert.ok(mixed.earnedCredit > 0);
  // 사업소득이 섞이면 근로소득 비중이 줄어 공제 대상 산출세액도 줄어든다.
  // 다만 한도에 걸리면 같아질 수 있으므로 넘지 않는 것만 확인한다.
  assert.ok(mixed.earnedCredit <= onlyJob.earnedCredit + 1);
});

test('근로소득이 없으면 근로소득세액공제도 없다', () => {
  const r = at();
  assert.equal(r.earnedCredit, 0);
});

test('자녀세액공제가 반영된다', () => {
  const none = at({ children: 0 });
  const two = at({ children: 2 });
  assert.equal(two.childCredit, rates.incomeTax.childCredit.second);
  assert.equal(none.childCredit, 0);
  assert.ok(two.finalTax < none.finalTax);
  assert.ok(two.balance < none.balance, '세금이 줄면 환급이 늘어난다');
});

test('부양가족이 늘면 과세표준이 줄어든다', () => {
  const alone = at({ dependents: 1 });
  const family = at({ dependents: 4 });
  assert.equal(family.personalDeduction, rates.incomeTax.basicDeduction * 4);
  assert.ok(family.taxBase < alone.taxBase);
  assert.ok(family.finalTax <= alone.finalTax);
});

test('필요경비가 수입을 넘으면 수입까지만 인정된다', () => {
  const r = at({ businessRevenue: 10_000_000, businessExpense: 50_000_000 });
  assert.equal(r.businessIncome, 0);
  assert.ok(r.businessIncome >= 0);
});

test('그 밖의 종합소득이 합산된다', () => {
  const without = at({ otherIncome: 0 });
  const with_ = at({ otherIncome: 5_000_000 });
  assert.equal(with_.totalIncome - without.totalIncome, 5_000_000);
  assert.ok(with_.finalTax > without.finalTax);
});

test('소득공제를 넣으면 과세표준이 그만큼 줄어든다', () => {
  const none = at({ otherDeduction: 0 });
  const some = at({ otherDeduction: 3_000_000 });
  assert.equal(none.taxBase - some.taxBase, 3_000_000);
});

test('세액공제가 산출세액보다 크면 결정세액이 0이다', () => {
  // 소득이 아주 적으면 표준세액공제만으로도 세금이 사라진다
  const r = at({ businessRevenue: 5_000_000, businessExpense: 3_000_000, prepaidTax: 150_000 });
  assert.equal(r.finalTax, 0);
  assert.equal(r.localTax, 0);
  // 낸 세금은 전부 돌려받는다
  assert.equal(r.balance, -150_000);
});

test('과세표준 구간이 소득에 따라 올라간다', () => {
  // 경비 0 기준이므로 과세표준 = 수입 − 인적공제 150만원이다
  const brackets = [
    { revenue: 15_000_000, taxBase: 13_500_000, expected: 0.06 },
    { revenue: 40_000_000, taxBase: 38_500_000, expected: 0.15 },
    { revenue: 80_000_000, taxBase: 78_500_000, expected: 0.24 },
    { revenue: 130_000_000, taxBase: 128_500_000, expected: 0.35 },
    { revenue: 200_000_000, taxBase: 198_500_000, expected: 0.38 },
  ];
  for (const { revenue, taxBase, expected } of brackets) {
    const r = at({ businessRevenue: revenue, businessExpense: 0, prepaidTax: 0 });
    assert.equal(r.taxBase, taxBase, `수입 ${revenue.toLocaleString()}원의 과세표준`);
    assert.equal(r.bracket.rate, expected, `수입 ${revenue.toLocaleString()}원의 세율`);
  }
});

test('소득이 늘수록 실효세율이 올라간다', () => {
  let previous = -1;
  for (const revenue of [20_000_000, 50_000_000, 100_000_000, 300_000_000]) {
    const r = at({ businessRevenue: revenue, businessExpense: 0, prepaidTax: 0 });
    assert.ok(r.effectiveRate > previous, `수입 ${revenue}에서 실효세율이 떨어졌다`);
    previous = r.effectiveRate;
  }
});

test('결정세액은 산출세액에서 세액공제를 뺀 값이다', () => {
  const r = at({ businessRevenue: 80_000_000, businessExpense: 20_000_000, children: 1 });
  assert.equal(r.totalCredit, r.earnedCredit + r.childCredit + r.standardCredit);
  assert.equal(r.finalTax, Math.floor(r.computedTax - r.totalCredit));
});

test('수입이 0이면 모든 값이 0이다', () => {
  const r = at({ businessRevenue: 0, businessExpense: 0, prepaidTax: 0 });
  assert.equal(r.totalIncome, 0);
  assert.equal(r.taxBase, 0);
  assert.equal(r.finalTax, 0);
  assert.equal(r.totalBalance, 0);
  assert.equal(r.effectiveRate, 0);
});

test('음수와 잘못된 값을 0으로 처리한다', () => {
  assert.equal(at({ businessRevenue: -100 }).businessIncome, 0);
  assert.equal(at({ businessRevenue: Number.NaN }).totalIncome, 0);
  assert.equal(at({ otherIncome: -500 }).otherIncome, 0);
});
