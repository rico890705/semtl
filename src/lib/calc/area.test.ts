/**
 * 면적 변환 검증.
 *
 * 단순 변환이라 산수는 쉽지만, 전용면적과 공급면적을 혼동하면
 * "84㎡ = 34평"처럼 틀린 답이 나온다. 그 구분을 못박아둔다.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  convertArea,
  m2ToPyeong,
  pyeongToM2,
  PYEONG_IN_M2,
  COMMON_SIZES,
  NATIONAL_HOUSING_M2,
} from './area.ts';

const close = (a: number, b: number, tol = 0.01) =>
  assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('1평은 400/121 제곱미터다', () => {
  close(PYEONG_IN_M2, 3.305785, 0.000001);
  close(pyeongToM2(1), 3.305785, 0.000001);
  close(m2ToPyeong(3.305785), 1, 0.000001);
});

test('변환이 서로를 되돌린다', () => {
  for (const m2 of [33, 59, 84, 114, 200]) {
    close(pyeongToM2(m2ToPyeong(m2)), m2, 0.000001);
  }
});

test('자주 찾는 값이 맞는다', () => {
  close(m2ToPyeong(84), 25.41, 0.01); // 전용 84㎡ = 25.4평
  close(m2ToPyeong(59), 17.85, 0.01);
  close(m2ToPyeong(114), 34.49, 0.01);
  close(pyeongToM2(30), 99.17, 0.01); // 30평 = 99.17㎡
  close(pyeongToM2(10), 33.06, 0.01);
});

test('전용면적을 평으로 바꾼 값과 부르는 평형은 다르다', () => {
  // 이 계산기가 풀어야 할 핵심 혼란
  const r = convertArea({ value: 84, unit: 'm2', exclusiveRatio: 75 });
  close(r.exclusivePyeong, 25.41, 0.01); // 전용 기준으로는 25평
  close(r.supplyM2, 112, 0.01); // 공급면적
  close(r.supplyPyeong, 33.88, 0.01);
  assert.equal(r.nickname, 34); // 시장에서 부르는 "34평형"
});

test('전용률이 낮을수록 공급면적이 커진다', () => {
  const high = convertArea({ value: 84, unit: 'm2', exclusiveRatio: 85 });
  const low = convertArea({ value: 84, unit: 'm2', exclusiveRatio: 65 });
  assert.ok(low.supplyM2 > high.supplyM2);
  assert.ok(low.nickname > high.nickname);
  // 전용면적 자체는 변하지 않는다
  assert.equal(high.exclusiveM2, low.exclusiveM2);
});

test('전용률 100%면 공급면적과 전용면적이 같다', () => {
  const r = convertArea({ value: 84, unit: 'm2', exclusiveRatio: 100 });
  close(r.supplyM2, r.exclusiveM2, 0.000001);
  close(r.supplyPyeong, r.exclusivePyeong, 0.000001);
});

test('평으로 입력해도 같은 결과가 나온다', () => {
  const byM2 = convertArea({ value: 84, unit: 'm2', exclusiveRatio: 75 });
  const byPyeong = convertArea({ value: m2ToPyeong(84), unit: 'pyeong', exclusiveRatio: 75 });
  close(byM2.exclusiveM2, byPyeong.exclusiveM2, 0.000001);
  close(byM2.supplyPyeong, byPyeong.supplyPyeong, 0.000001);
});

test('전용률이 범위를 벗어나면 보정한다', () => {
  assert.equal(convertArea({ value: 84, unit: 'm2', exclusiveRatio: 0 }).exclusiveRatio, 100);
  assert.equal(convertArea({ value: 84, unit: 'm2', exclusiveRatio: 150 }).exclusiveRatio, 100);
  assert.equal(convertArea({ value: 84, unit: 'm2', exclusiveRatio: -10 }).exclusiveRatio, 100);
});

test('0과 잘못된 값을 0으로 처리한다', () => {
  assert.equal(m2ToPyeong(0), 0);
  assert.equal(m2ToPyeong(-5), 0);
  assert.equal(m2ToPyeong(Number.NaN), 0);
  assert.equal(pyeongToM2(-1), 0);
  assert.equal(convertArea({ value: 0, unit: 'm2', exclusiveRatio: 75 }).exclusiveM2, 0);
});

test('국민주택규모 85㎡ 경계', () => {
  // 취득세 농어촌특별세 면제 기준과 같은 값이다
  assert.equal(NATIONAL_HOUSING_M2, 85);
  close(m2ToPyeong(NATIONAL_HOUSING_M2), 25.71, 0.01);
  // 흔한 84㎡가 이 기준 바로 아래인 이유
  assert.ok(84 < NATIONAL_HOUSING_M2);
});

test('평형 대응표가 전용면적 순으로 정렬돼 있다', () => {
  for (let i = 1; i < COMMON_SIZES.length; i++) {
    assert.ok(COMMON_SIZES[i].exclusiveM2 > COMMON_SIZES[i - 1].exclusiveM2);
  }
  const flagship = COMMON_SIZES.find((s) => s.exclusiveM2 === 84);
  assert.ok(flagship, '국민평형 84㎡가 표에 있어야 한다');
  assert.equal(flagship!.nickname, '34평형');
});
