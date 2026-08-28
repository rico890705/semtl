/**
 * 절사 규칙 검증 — 부동소수점 오차 회귀 테스트.
 *
 * 실제로 발견된 버그: 3,300,000 × 0.009 가 29699.999999999996 으로 나와
 * 고용보험료가 29,700원이 아니라 29,690원으로 계산됐다.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { floorTo10, floorToWon } from './rounding.ts';

test('부동소수점 오차 때문에 한 단위가 깎이지 않는다', () => {
  // 실제로 터졌던 조합
  assert.equal(floorTo10(3_300_000 * 0.009), 29_700);

  // 같은 함정에 빠지기 쉬운 다른 조합들
  assert.equal(floorTo10(1_000_000 * 0.009), 9_000);
  assert.equal(floorTo10(2_000_000 * 0.009), 18_000);
  assert.equal(floorTo10(3_000_000 * 0.045), 135_000);
  assert.equal(floorTo10(1_100_000 * 0.03), 33_000);
});

test('정상적인 절사는 그대로 동작한다', () => {
  assert.equal(floorTo10(29_709.6), 29_700);
  assert.equal(floorTo10(29_719), 29_710);
  assert.equal(floorTo10(1_234.5), 1_230);
  assert.equal(floorTo10(9), 0);
  assert.equal(floorTo10(10), 10);
});

test('0과 음수, 잘못된 값은 0으로 처리한다', () => {
  assert.equal(floorTo10(0), 0);
  assert.equal(floorTo10(-500), 0);
  assert.equal(floorTo10(Number.NaN), 0);
  assert.equal(floorTo10(Number.POSITIVE_INFINITY), 0);
});

test('원 단위 절사도 같은 보정을 받는다', () => {
  assert.equal(floorToWon(2_999.9999999999995), 3_000);
  assert.equal(floorToWon(2_999.4), 2_999);
  assert.equal(floorToWon(0), 0);
  assert.equal(floorToWon(-1), 0);
});

test('여유값이 실제 금액 차이를 삼키지 않는다', () => {
  // 1e-6 은 1원보다 훨씬 작으므로 진짜 경계는 그대로 지켜져야 한다
  assert.equal(floorTo10(29_699.99), 29_690);
  assert.equal(floorToWon(2_999.99), 2_999);
});
