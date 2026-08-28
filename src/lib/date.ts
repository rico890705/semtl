/**
 * 날짜 계산.
 *
 * 모든 연산은 UTC 자정 기준으로 한다. 로컬 시간대를 쓰면 서머타임이나
 * 시차 때문에 하루가 밀리는 일이 생기는데, 근속일수 하루 차이가 퇴직금을 바꾼다.
 *
 * 만 나이·D-day 계산기에서도 쓸 예정이라 계산기별 코드가 아니라 공용으로 둔다.
 */

/** 'YYYY-MM-DD' → UTC 자정 Date. 형식이 틀리거나 존재하지 않는 날짜면 null. */
export function parseDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso?.trim() ?? '');
  if (!match) return null;

  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  // 2월 30일처럼 존재하지 않는 날짜는 Date가 조용히 넘겨버리므로 되돌려 확인한다
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/**
 * 개월 단위 이동.
 * 이동한 달에 그 날짜가 없으면 그 달의 마지막 날로 맞춘다.
 * (5월 31일 − 3개월 → 2월 31일이 아니라 2월 28일)
 */
export function addMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();

  const target = new Date(Date.UTC(year, month + months, 1));
  const lastDayOfTarget = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();

  return new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, lastDayOfTarget)),
  );
}

/** to − from 을 일수로. 같은 날이면 0. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * 두 날짜 사이를 년·월·일로 나눈다. 근속기간 표시용.
 *
 * 일수를 직접 빼서 음수면 빌려오는 방식은 월말에서 짧은 달로 건너뛸 때 깨진다.
 * (1월 31일 → 3월 1일: 2월이 28일뿐이라 한 번 빌려도 여전히 모자란다)
 * 그래서 년·월을 먼저 확정해 기준점으로 이동한 뒤, 거기서 남은 일수를 센다.
 */
export function splitDuration(
  from: Date,
  to: Date,
): { years: number; months: number; days: number } {
  if (to.getTime() < from.getTime()) return { years: 0, months: 0, days: 0 };

  let years = to.getUTCFullYear() - from.getUTCFullYear();
  let months = to.getUTCMonth() - from.getUTCMonth();

  // 아직 그 달의 해당 일자에 도달하지 못했으면 한 달을 덜 센다
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const anchor = addMonths(from, years * 12 + months);
  return { years, months, days: Math.max(0, daysBetween(anchor, to)) };
}

/** { years: 6, months: 3, days: 12 } → "6년 3개월 12일" */
export function formatDuration(duration: {
  years: number;
  months: number;
  days: number;
}): string {
  const parts: string[] = [];
  if (duration.years) parts.push(`${duration.years}년`);
  if (duration.months) parts.push(`${duration.months}개월`);
  if (duration.days) parts.push(`${duration.days}일`);
  return parts.join(' ') || '0일';
}

/** Date → "2026년 8월 31일" */
export function formatKorean(date: Date): string {
  return `${date.getUTCFullYear()}년 ${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일`;
}
