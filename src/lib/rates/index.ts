/**
 * 연도별 요율 조회.
 *
 * 새 연도가 나오면 2026.ts 를 복사해 값만 바꾸고 여기에 등록한다.
 * 계산기는 항상 이 함수를 거쳐 요율을 가져오므로, 나중에 연도 선택 기능을
 * 붙일 때도 계산 코드는 손대지 않아도 된다.
 */
import { RATES_2026, type YearRates } from './2026.ts';

export type { YearRates, TaxBracket, DeductionBand } from './2026.ts';

const BY_YEAR: Record<number, YearRates> = {
  2026: RATES_2026,
};

/** 가장 최근 연도 */
export const LATEST_YEAR = Math.max(...Object.keys(BY_YEAR).map(Number));

export function ratesFor(year: number = LATEST_YEAR): YearRates {
  return BY_YEAR[year] ?? BY_YEAR[LATEST_YEAR];
}

export const AVAILABLE_YEARS = Object.keys(BY_YEAR)
  .map(Number)
  .sort((a, b) => b - a);
