/**
 * 중도상환수수료 계산 검증.
 *
 * 3년이라는 벽(만기가 길어도 3년까지만 부과)과 매년 10% 면제가
 * 금액을 크게 바꾸므로 그 두 규칙을 집중적으로 본다.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePrepaymentFee,
  feeTimeline,
  type PrepaymentInput,
} from './prepayment.ts';
import { PREPAYMENT, defaultFeeRate } from '../rates/prepayment.ts';

const base: PrepaymentInput = {
  loanType: 'mortgage',
  originalPrincipal: 300_000_000,
  repayAmount: 50_000_000,
  feeRate: 0.55,
  startDate: '2025-01-01',
  repayDate: '2026-01-01',
  loanYears: 30,
  annualRate: 4,
  useFreeAllowance: false,
};

const at = (over: Partial<PrepaymentInput> = {}) =>
  calculatePrepaymentFee({ ...base, ...over });

test('만기가 3년보다 길면 3년째 되는 날을 만기로 본다', () => {
  const r = at();
  assert.equal(r.feeEndDate, '2028-01-01');
  assert.equal(r.feePeriodDays, 1095);
  assert.equal(r.elapsedDays, 365);
  assert.equal(r.remainingDays, 730);
});

test('수수료는 잔존일수 비례로 줄어든다', () => {
  const r = at();
  // 5,000만 × 0.55% × (730 ÷ 1095)
  const expected = Math.floor(50_000_000 * 0.0055 * (730 / 1095));
  assert.equal(r.fee, expected);
  assert.ok(Math.abs(r.remainingRatio - (730 / 1095) * 100) < 0.001);
});

test('갚는 시점이 늦을수록 수수료가 줄어든다', () => {
  const dates = ['2025-01-01', '2025-07-01', '2026-01-01', '2027-01-01', '2027-12-01'];
  let previous = Number.POSITIVE_INFINITY;
  for (const repayDate of dates) {
    const fee = at({ repayDate }).fee;
    assert.ok(fee < previous, `${repayDate}에서 수수료가 줄지 않았다`);
    previous = fee;
  }
});

test('3년이 지나면 수수료가 없다', () => {
  const exact = at({ repayDate: '2028-01-01' });
  assert.equal(exact.remainingDays, 0);
  assert.equal(exact.feeExempt, true);
  assert.equal(exact.fee, 0);

  const later = at({ repayDate: '2029-06-15' });
  assert.equal(later.feeExempt, true);
  assert.equal(later.fee, 0);
});

test('실행 당일에 갚으면 수수료율 전액이 붙는다', () => {
  const r = at({ repayDate: '2025-01-01' });
  assert.equal(r.remainingDays, r.feePeriodDays);
  assert.ok(Math.abs(r.remainingRatio - 100) < 0.001);
  assert.equal(r.fee, Math.floor(50_000_000 * 0.0055));
});

test('만기가 3년보다 짧으면 실제 만기를 쓴다', () => {
  const r = at({ loanYears: 2, repayDate: '2026-01-01' });
  assert.equal(r.feeEndDate, '2027-01-01');
  assert.equal(r.feePeriodDays, 730);
  assert.equal(r.remainingDays, 365);
  // 절반 지났으므로 요율의 절반
  assert.ok(Math.abs(r.remainingRatio - 50) < 0.001);
});

test('부동산담보대출은 매년 최초 대출금액의 10%가 면제된다', () => {
  const without = at({ useFreeAllowance: false });
  const with_ = at({ useFreeAllowance: true });

  assert.equal(with_.freeAllowance, 30_000_000); // 3억의 10%
  assert.equal(with_.chargeableAmount, 20_000_000);
  assert.ok(with_.fee < without.fee);
  assert.equal(with_.fee, Math.floor(20_000_000 * 0.0055 * (730 / 1095)));
});

test('면제 한도가 상환액보다 크면 수수료가 0이다', () => {
  const r = at({ repayAmount: 20_000_000, useFreeAllowance: true });
  assert.equal(r.freeAllowance, 20_000_000);
  assert.equal(r.chargeableAmount, 0);
  assert.equal(r.fee, 0);
});

test('신용대출에는 10% 면제가 적용되지 않는다', () => {
  const r = at({ loanType: 'credit', useFreeAllowance: true });
  assert.equal(r.freeAllowance, 0);
  assert.equal(r.chargeableAmount, 50_000_000);
});

test('대출 종류·금리 유형별 기본 요율이 맞다', () => {
  assert.equal(defaultFeeRate('mortgage', 'variable'), 0.55);
  assert.equal(defaultFeeRate('mortgage', 'fixed'), 0.75);
  assert.equal(defaultFeeRate('credit', 'variable'), 0.11);
  assert.equal(defaultFeeRate('credit', 'fixed'), 0.18);
  assert.equal(PREPAYMENT.rates.length, 4);
});

test('요율이 높을수록 수수료가 많다', () => {
  const variable = at({ feeRate: 0.55 });
  const fixed = at({ feeRate: 0.75 });
  assert.ok(fixed.fee > variable.fee);
});

test('회수 기간 — 아끼는 이자로 수수료를 언제 만회하는가', () => {
  const r = at();
  assert.equal(r.annualInterestSaved, 2_000_000); // 5,000만 × 4%
  // 수수료 18만원대를 월 16.7만원 절약으로 만회 → 약 1.1개월
  assert.ok(r.breakEvenMonths > 0.9 && r.breakEvenMonths < 1.3, `${r.breakEvenMonths}개월`);
});

test('금리가 낮으면 회수 기간이 길어진다', () => {
  const cheap = at({ annualRate: 2 });
  const dear = at({ annualRate: 8 });
  assert.ok(cheap.breakEvenMonths > dear.breakEvenMonths);
});

test('수수료가 0이면 회수 기간도 0이다', () => {
  const r = at({ repayDate: '2028-06-01' });
  assert.equal(r.fee, 0);
  assert.equal(r.breakEvenMonths, 0);
});

test('상환액 대비 실효 수수료율이 명목 요율보다 낮다', () => {
  const r = at();
  // 잔존일수 비례로 깎이므로 항상 명목 요율 이하다
  assert.ok(r.effectiveRate < r.feeRate);
  assert.ok(Math.abs(r.effectiveRate - 0.55 * (730 / 1095)) < 0.001);
});

test('잘못된 날짜를 안내 문구와 함께 돌려준다', () => {
  assert.equal(at({ startDate: '' }).valid, false);
  assert.match(at({ repayDate: '2024-01-01' }).reason ?? '', /빠릅니다/);
  assert.equal(at({ startDate: '2025-02-30' }).valid, false);
  assert.equal(at({ startDate: '' }).fee, 0);
});

test('시간표가 6개월 간격으로 3년치를 만든다', () => {
  const rows = feeTimeline(base);
  assert.equal(rows.length, 7); // 0, 6, 12, 18, 24, 30, 36개월
  assert.equal(rows[0].months, 0);
  assert.equal(rows[rows.length - 1].months, 36);

  // 뒤로 갈수록 수수료가 줄고 마지막은 0이다
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].fee < rows[i - 1].fee, `${rows[i].months}개월에서 줄지 않았다`);
  }
  assert.equal(rows[rows.length - 1].fee, 0);
});

test('시간표가 현재 상환일에 가장 가까운 행을 표시한다', () => {
  const rows = feeTimeline(base); // 상환일이 실행 후 1년
  const current = rows.filter((r) => r.current);
  assert.equal(current.length, 1);
  assert.equal(current[0].months, 12);
});

test('상환액 0이면 수수료도 0이다', () => {
  const r = at({ repayAmount: 0 });
  assert.equal(r.fee, 0);
  assert.equal(r.effectiveRate, 0);
});

test('음수와 잘못된 값을 0으로 처리한다', () => {
  assert.equal(at({ repayAmount: -100 }).fee, 0);
  assert.equal(at({ feeRate: -1 }).fee, 0);
  assert.equal(at({ repayAmount: Number.NaN }).fee, 0);
});
