/**
 * 대출 계산 검증.
 *
 * 계산기 사이트에서 숫자가 틀리면 신뢰가 통째로 날아간다.
 * 폐쇄형 공식과의 대조, 그리고 "합계가 맞는가" 같은 불변식을 함께 확인한다.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSchedule, principalFromPayment } from './loan.ts';

const P = 300_000_000;
const RATE = 3.9;
const YEARS = 30;
const r = RATE / 100 / 12;
const n = YEARS * 12;

const eq = buildSchedule({ principal: P, annualRate: RATE, years: YEARS, method: 'equal-payment' });
const ep = buildSchedule({ principal: P, annualRate: RATE, years: YEARS, method: 'equal-principal' });
const bl = buildSchedule({ principal: P, annualRate: RATE, years: YEARS, method: 'bullet' });

test('원리금균등 월 상환액이 폐쇄형 공식과 일치한다', () => {
  const closedForm = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  assert.ok(
    Math.abs(eq.schedule[0].payment - Math.round(closedForm)) <= 1,
    `${eq.schedule[0].payment} vs ${Math.round(closedForm)}`,
  );
});

test('원금 합계가 대출금액과 정확히 일치한다 (반올림 누적 오차 없음)', () => {
  for (const result of [eq, ep, bl]) {
    assert.equal(result.totalPrincipal, P);
  }
});

test('모든 회차에서 상환액 = 원금 + 이자', () => {
  for (const result of [eq, ep, bl]) {
    for (const row of result.schedule) {
      assert.equal(row.payment, row.principal + row.interest);
    }
  }
});

test('마지막 회차 후 잔액이 0이다', () => {
  for (const result of [eq, ep, bl]) {
    assert.equal(result.schedule.at(-1)!.balance, 0);
  }
});

test('잔액은 단조 감소한다', () => {
  for (const result of [eq, ep, bl]) {
    result.schedule.reduce((prev, row) => {
      assert.ok(row.balance <= prev, `${row.n}회차에서 잔액이 늘었다`);
      return row.balance;
    }, P);
  }
});

test('회차 수 = 기간 × 12', () => {
  for (const result of [eq, ep, bl]) {
    assert.equal(result.schedule.length, n);
  }
});

test('총 이자는 만기일시 > 원리금균등 > 원금균등 순이다', () => {
  assert.ok(bl.totalInterest > eq.totalInterest);
  assert.ok(eq.totalInterest > ep.totalInterest);
});

test('원금균등은 상환액이 점점 줄어든다', () => {
  assert.ok(ep.schedule[0].payment > ep.schedule.at(-1)!.payment);
  assert.equal(ep.schedule[0].interest, Math.round(P * r));
});

test('만기일시는 매달 이자만 낸다', () => {
  assert.equal(bl.schedule[0].payment, Math.round(P * r));
  assert.equal(bl.totalInterest, Math.round(P * r) * n);
  assert.equal(bl.schedule.at(-1)!.principal, P);
});

test('거치기간에는 원금이 줄지 않고 총 이자가 늘어난다', () => {
  const grace = buildSchedule({
    principal: P,
    annualRate: RATE,
    years: YEARS,
    method: 'equal-payment',
    graceMonths: 12,
  });
  assert.equal(grace.totalPrincipal, P);
  assert.equal(grace.schedule.length, n);
  assert.ok(grace.schedule.slice(0, 12).every((row) => row.principal === 0));
  assert.ok(grace.totalInterest > eq.totalInterest);
});

test('무이자 대출은 원금을 회차로 나눈 금액만 낸다', () => {
  const zero = buildSchedule({
    principal: 12_000_000,
    annualRate: 0,
    years: 1,
    method: 'equal-payment',
  });
  assert.equal(zero.totalInterest, 0);
  assert.equal(zero.schedule[0].payment, 1_000_000);
  assert.equal(zero.totalPrincipal, 12_000_000);
});

test('역계산이 원래 대출금액을 복원한다', () => {
  const closedForm = Math.round((P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1));
  const restored = principalFromPayment(closedForm, RATE, YEARS);
  assert.ok(Math.abs(restored - P) < 2_000, `${restored} vs ${P}`);
});

test('극단값에서도 깨지지 않는다', () => {
  const tiny = buildSchedule({ principal: 1, annualRate: 0.1, years: 1, method: 'equal-payment' });
  assert.equal(tiny.totalPrincipal, 1);

  const huge = buildSchedule({
    principal: 2_000_000_000,
    annualRate: 30,
    years: 50,
    method: 'equal-payment',
  });
  assert.equal(huge.totalPrincipal, 2_000_000_000);
  assert.equal(huge.schedule.at(-1)!.balance, 0);
});
