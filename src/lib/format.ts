/** 숫자 표기 헬퍼 — 화면에 보이는 모든 숫자는 여기를 거친다. */

/** 1234567 → "1,234,567" */
export function won(n: number): string {
  return Math.round(Number.isFinite(n) ? n : 0).toLocaleString('ko-KR');
}

/**
 * 1234567 → "123만 4,567"
 * 300000000 → "3억"
 * 금액 입력창 옆의 보조 표기용. 자릿수를 세지 않고도 규모가 읽힌다.
 */
export function koreanWon(n: number): string {
  const value = Math.round(Number.isFinite(n) ? n : 0);
  if (value === 0) return '0';

  const sign = value < 0 ? '-' : '';
  let rest = Math.abs(value);

  const jo = Math.floor(rest / 1e12);
  rest %= 1e12;
  const eok = Math.floor(rest / 1e8);
  rest %= 1e8;
  const man = Math.floor(rest / 1e4);
  rest %= 1e4;

  const parts: string[] = [];
  if (jo) parts.push(`${jo.toLocaleString('ko-KR')}조`);
  if (eok) parts.push(`${eok.toLocaleString('ko-KR')}억`);
  if (man) parts.push(`${man.toLocaleString('ko-KR')}만`);
  // 억 이상 단위가 있으면 끝자리는 생략해 읽기 쉽게 둔다
  if (rest && !jo && !eok) parts.push(rest.toLocaleString('ko-KR'));

  return sign + (parts.join(' ') || '0');
}

/** 41.234 → "41.2%" */
export function pct(n: number, digits = 1): string {
  return `${(Number.isFinite(n) ? n : 0).toFixed(digits)}%`;
}

/** 입력창에서 숫자만 뽑아낸다. "1,234원" → 1234 */
export function parseNumber(raw: string): number {
  const cleaned = raw.replace(/[^0-9.-]/g, '');
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : 0;
}

/** 36 → "3년", 30 → "2년 6개월", 5 → "5개월" */
export function months(n: number): string {
  const total = Math.max(0, Math.round(n));
  if (total === 0) return '없음';
  const y = Math.floor(total / 12);
  const m = total % 12;
  if (y && m) return `${y}년 ${m}개월`;
  if (y) return `${y}년`;
  return `${m}개월`;
}
