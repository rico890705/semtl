/**
 * 면적 변환 (제곱미터 ↔ 평).
 *
 * 1평은 정확히 400/121 제곱미터다. 흔히 3.3058로 쓴다.
 *
 * 이 계산기가 실제로 풀어야 하는 혼란
 *   "전용 84㎡인데 왜 34평이라고 부르지?"
 *
 * 84㎡를 평으로 바꾸면 25.4평이다. 그런데 시장에서는 이 집을 34평이라 부른다.
 * 부르는 평수는 전용면적이 아니라 공급면적(전용 + 주거공용) 기준이기 때문이다.
 * 전용률이 75%라면 공급면적은 112㎡이고, 그게 33.9평이라 "34평형"이 된다.
 *
 * 그래서 단순 변환만 내놓으면 오히려 헷갈린다.
 * 전용·공급을 같이 보여주고 전용률을 드러내야 한다.
 */

/** 1평 = 400/121 ㎡ */
export const PYEONG_IN_M2 = 400 / 121;

export type AreaUnit = 'm2' | 'pyeong';

export function m2ToPyeong(m2: number): number {
  return Number.isFinite(m2) && m2 > 0 ? m2 / PYEONG_IN_M2 : 0;
}

export function pyeongToM2(pyeong: number): number {
  return Number.isFinite(pyeong) && pyeong > 0 ? pyeong * PYEONG_IN_M2 : 0;
}

export interface AreaInput {
  /** 입력한 값 */
  value: number;
  /** 입력 단위 */
  unit: AreaUnit;
  /** 전용률 (%) — 공급면적 환산에 쓴다 */
  exclusiveRatio: number;
}

export interface AreaResult {
  /** 입력값을 전용면적으로 본 값 */
  exclusiveM2: number;
  exclusivePyeong: number;
  /** 전용률로 환산한 공급면적 */
  supplyM2: number;
  supplyPyeong: number;
  exclusiveRatio: number;
  /** 시장에서 부르는 평형 (공급면적 반올림) */
  nickname: number;
}

const positive = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

export function convertArea(input: AreaInput): AreaResult {
  const value = positive(input.value);
  const exclusiveM2 = input.unit === 'm2' ? value : pyeongToM2(value);
  const exclusivePyeong = m2ToPyeong(exclusiveM2);

  // 전용률이 0이면 공급면적을 구할 수 없으므로 전용면적을 그대로 둔다
  const ratio = Math.min(100, Math.max(1, positive(input.exclusiveRatio) || 100));
  const supplyM2 = exclusiveM2 / (ratio / 100);
  const supplyPyeong = m2ToPyeong(supplyM2);

  return {
    exclusiveM2,
    exclusivePyeong,
    supplyM2,
    supplyPyeong,
    exclusiveRatio: ratio,
    nickname: Math.round(supplyPyeong),
  };
}

export interface CommonSize {
  /** 전용면적 (㎡) */
  exclusiveM2: number;
  /** 시장에서 부르는 이름 */
  nickname: string;
  note: string;
}

/**
 * 아파트에서 흔히 보는 전용면적과 그 통칭.
 * 통칭은 공급면적 기준이라 전용면적을 평으로 바꾼 값과 다르다.
 */
export const COMMON_SIZES: CommonSize[] = [
  { exclusiveM2: 39, nickname: '16평형', note: '원룸·소형' },
  { exclusiveM2: 49, nickname: '20평형', note: '신혼·1~2인' },
  { exclusiveM2: 59, nickname: '24평형', note: '국민주택 소형' },
  { exclusiveM2: 74, nickname: '30평형', note: '3인 가구' },
  { exclusiveM2: 84, nickname: '34평형', note: '가장 흔한 국민평형' },
  { exclusiveM2: 101, nickname: '40평형', note: '중대형' },
  { exclusiveM2: 114, nickname: '45평형', note: '중대형' },
  { exclusiveM2: 134, nickname: '52평형', note: '대형' },
];

/** 국민주택규모 — 이 면적 이하는 취득세 농특세가 면제된다 */
export const NATIONAL_HOUSING_M2 = 85;
