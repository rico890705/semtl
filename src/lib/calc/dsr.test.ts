/**
 * DSR 계산 검증.
 *
 * 대출 종류마다 연간 원리금을 잡는 방식이 다르고, 한도는 역산이라
 * 두 방향(정방향 DSR, 역방향 한도)이 서로 맞물리는지를 함께 본다.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateDsr, loanBurden, type ExistingLoan, type DsrInput } from './dsr.ts';
import { buildSchedule } from './loan.ts';
import { DSR } from '../rates/dsr.ts';

const loan = (over: Partial<ExistingLoan> = {}): ExistingLoan => ({
  id: 'x',
  kind: 'mortgage',
  balance: 100_000_000,
  annualRate: 4,
  termYears: 30,
  ...over,
});

const base: DsrInput = {
  annualIncome: 60_000_000,
  limitRate: 40,
  existingLoans: [],
  newLoan: { annualRate: 4, years: 30, applyStress: true },
};

const at = (over: Partial<DsrInput> = {}) => calculateDsr({ ...base, ...over });

const close = (actual: number, expected: number, tolerancePct = 0.5) =>
  assert.ok(
    Math.abs(actual - expected) <= Math.abs(expected) * (tolerancePct / 100),
    `${Math.round(actual).toLocaleString()} vs ${Math.round(expected).toLocaleString()}`,
  );

test('DSR은 연간 원리금을 연소득으로 나눈 값이다', () => {
  const r = at({ existingLoans: [loan()] });
  const expected = (r.existingAnnualPayment / 60_000_000) * 100;
  close(r.currentDsr, expected, 0.001);
  assert.ok(r.currentDsr > 0 && r.currentDsr < 40);
});

test('주택담보대출은 첫 해 원리금균등 12회분으로 잡는다', () => {
  const b = loanBurden(loan({ balance: 300_000_000, annualRate: 4, termYears: 30 }));
  const schedule = buildSchedule({
    principal: 300_000_000,
    annualRate: 4,
    years: 30,
    method: 'equal-payment',
  }).schedule.slice(0, 12);
  const expected = schedule.reduce((s, row) => s + row.payment, 0);
  assert.equal(b.annualPayment, expected);
  assert.equal(b.excluded, false);
  assert.equal(b.annualPayment, b.annualPrincipal + b.annualInterest);
});

test('신용대출은 원금을 산정만기로 나누고 이자를 더한다', () => {
  const b = loanBurden(loan({ kind: 'credit', balance: 50_000_000, annualRate: 6, termYears: 5 }));
  // 원금 5,000만 ÷ 5년 = 1,000만 + 이자 300만
  assert.equal(b.annualPrincipal, 10_000_000);
  assert.equal(b.annualInterest, 3_000_000);
  assert.equal(b.annualPayment, 13_000_000);
  assert.match(b.note, /5년/);
});

test('산정만기가 길수록 신용대출의 DSR 부담이 줄어든다', () => {
  const short = loanBurden(loan({ kind: 'credit', balance: 50_000_000, annualRate: 6, termYears: 5 }));
  const long = loanBurden(loan({ kind: 'credit', balance: 50_000_000, annualRate: 6, termYears: 10 }));
  assert.ok(long.annualPayment < short.annualPayment);
  assert.equal(long.annualPrincipal, 5_000_000);
});

test('마이너스통장은 쓴 금액이 아니라 한도 전액이 잡힌다', () => {
  const b = loanBurden(loan({ kind: 'negative', balance: 30_000_000, annualRate: 7, termYears: 5 }));
  assert.equal(b.annualPrincipal, 6_000_000); // 3,000만 ÷ 5년
  assert.equal(b.annualInterest, 2_100_000);
  assert.equal(b.excluded, false);
});

test('전세자금대출은 DSR 산정에서 빠진다', () => {
  const b = loanBurden(loan({ kind: 'jeonse', balance: 200_000_000, annualRate: 4 }));
  assert.equal(b.excluded, true);
  assert.equal(b.annualPayment, 0);

  // 합계에도 들어가지 않는다
  const withJeonse = at({ existingLoans: [loan({ kind: 'jeonse', balance: 200_000_000 })] });
  assert.equal(withJeonse.existingAnnualPayment, 0);
  assert.equal(withJeonse.currentDsr, 0);
});

test('잔액이 0이면 부담도 0이다', () => {
  const b = loanBurden(loan({ balance: 0 }));
  assert.equal(b.annualPayment, 0);
});

test('상한까지 쓸 수 있는 연간 원리금이 소득 × 상한율이다', () => {
  const bank = at({ limitRate: 40 });
  const nonbank = at({ limitRate: 50 });
  assert.equal(bank.allowedAnnualPayment, 24_000_000);
  assert.equal(nonbank.allowedAnnualPayment, 30_000_000);
  assert.ok(nonbank.newLoanLimit > bank.newLoanLimit, '상한이 높으면 한도도 커진다');
});

test('기존 대출이 있으면 신규 한도가 줄어든다', () => {
  const clean = at({ existingLoans: [] });
  const burdened = at({ existingLoans: [loan({ kind: 'credit', balance: 50_000_000 })] });
  assert.ok(burdened.availableAnnualPayment < clean.availableAnnualPayment);
  assert.ok(burdened.newLoanLimit < clean.newLoanLimit);
});

test('스트레스 금리가 한도를 깎는다', () => {
  const r = at();
  assert.equal(r.stressRate, DSR.stress.rate);
  assert.equal(r.stressedRate, 4 + DSR.stress.rate);
  assert.ok(r.newLoanLimit < r.limitWithoutStress);
  assert.equal(r.stressReduction, r.limitWithoutStress - r.newLoanLimit);
  // 연소득 6천만 · 금리 4% · 30년이면 대략 6~7천만원가량 줄어든다
  assert.ok(
    r.stressReduction > 50_000_000 && r.stressReduction < 90_000_000,
    `감소액 ${r.stressReduction.toLocaleString()}원`,
  );
});

test('스트레스 금리를 끄면 두 한도가 같아진다', () => {
  const r = at({ newLoan: { annualRate: 4, years: 30, applyStress: false } });
  assert.equal(r.stressRate, 0);
  assert.equal(r.newLoanLimit, r.limitWithoutStress);
  assert.equal(r.stressReduction, 0);
});

test('한도는 스트레스 금리로 정하지만 상환액은 실제 금리로 계산된다', () => {
  const r = at();
  // 한도만큼 빌렸을 때의 실제 월 상환액
  const expected = buildSchedule({
    principal: r.newLoanLimit,
    annualRate: 4,
    years: 30,
    method: 'equal-payment',
  }).schedule[0].payment;
  assert.equal(r.actualMonthlyPayment, expected);

  // 실제 상환액 기준 DSR은 상한보다 낮게 나온다 — 스트레스 금리의 구조적 효과
  assert.ok(r.projectedDsr < r.limitRate, `${r.projectedDsr}% < ${r.limitRate}%`);
  assert.ok(r.projectedDsr > r.limitRate * 0.7, '그렇다고 지나치게 낮지도 않다');
});

test('한도 역산이 정방향 계산과 맞물린다', () => {
  // 스트레스 금리를 끄면, 한도만큼 빌렸을 때 DSR이 정확히 상한에 닿아야 한다
  const r = at({ newLoan: { annualRate: 4, years: 30, applyStress: false } });
  const monthly = buildSchedule({
    principal: r.newLoanLimit,
    annualRate: 4,
    years: 30,
    method: 'equal-payment',
  }).schedule[0].payment;
  close(monthly * 12, r.availableAnnualPayment, 0.5);
  close(r.projectedDsr, r.limitRate, 0.5);
});

test('기간이 길수록 한도가 커진다', () => {
  const short = at({ newLoan: { annualRate: 4, years: 10, applyStress: true } });
  const long = at({ newLoan: { annualRate: 4, years: 40, applyStress: true } });
  assert.ok(long.newLoanLimit > short.newLoanLimit);
});

test('금리가 높을수록 한도가 줄어든다', () => {
  const cheap = at({ newLoan: { annualRate: 3, years: 30, applyStress: true } });
  const dear = at({ newLoan: { annualRate: 6, years: 30, applyStress: true } });
  assert.ok(dear.newLoanLimit < cheap.newLoanLimit);
});

test('이미 상한을 넘었으면 신규 한도가 0이다', () => {
  const r = at({
    annualIncome: 30_000_000,
    existingLoans: [loan({ kind: 'credit', balance: 100_000_000, annualRate: 7, termYears: 5 })],
  });
  assert.equal(r.overLimit, true);
  assert.ok(r.currentDsr > r.limitRate);
  assert.equal(r.availableAnnualPayment, 0);
  assert.equal(r.newLoanLimit, 0);
  assert.equal(r.actualMonthlyPayment, 0);
});

test('여러 대출의 부담이 합산된다', () => {
  const loans = [
    loan({ id: 'a', kind: 'mortgage', balance: 200_000_000 }),
    loan({ id: 'b', kind: 'credit', balance: 30_000_000, annualRate: 6, termYears: 5 }),
    loan({ id: 'c', kind: 'jeonse', balance: 100_000_000 }),
  ];
  const r = at({ existingLoans: loans });
  assert.equal(r.burdens.length, 3);
  const sum = r.burdens.reduce((s, b) => s + b.annualPayment, 0);
  assert.equal(r.existingAnnualPayment, sum);
  // 전세는 0이므로 두 건만 더해진 값이다
  assert.equal(r.burdens[2].annualPayment, 0);
});

test('소득이 0이면 DSR과 한도가 모두 0이다', () => {
  const r = at({ annualIncome: 0 });
  assert.equal(r.currentDsr, 0);
  assert.equal(r.allowedAnnualPayment, 0);
  assert.equal(r.newLoanLimit, 0);
  assert.equal(r.projectedDsr, 0);
});

test('음수와 잘못된 값을 0으로 처리한다', () => {
  assert.equal(at({ annualIncome: -100 }).newLoanLimit, 0);
  assert.equal(loanBurden(loan({ balance: -500 })).annualPayment, 0);
  assert.equal(at({ annualIncome: Number.NaN }).currentDsr, 0);
});
