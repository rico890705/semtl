/**
 * 급여 계산의 원 단위 절사 규칙.
 *
 * 4대보험료와 원천징수세액은 10원 미만을 절사한다.
 *
 * 부동소수점 함정
 *   3,300,000 × 0.009 는 수학적으로 29,700 이지만 JS에서는 29699.999999999996 이 나온다.
 *   (0.009 를 이진수로 정확히 표현할 수 없기 때문)
 *   이 값을 그냥 절사하면 29,690원이 되어 실제보다 10원이 적어진다.
 *   요율에 따라 산발적으로 터지므로 눈으로는 발견하기 어렵다.
 *
 *   아주 작은 여유값을 더해 이 오차만 흡수한다. 1e-6 은 어떤 실제 금액보다도
 *   훨씬 작아서 정상적인 절사(예: 29,709.6 → 29,700)에는 영향을 주지 않는다.
 */
const FLOAT_EPSILON = 1e-6;

/** 10원 미만 절사 */
export function floorTo10(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.floor((amount + FLOAT_EPSILON) / 10) * 10;
}

/** 1원 미만 절사 */
export function floorToWon(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.floor(amount + FLOAT_EPSILON);
}
