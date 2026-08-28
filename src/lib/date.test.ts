/**
 * 날짜 계산 검증.
 * 근속일수 하루 차이가 퇴직금을 바꾸므로 경계를 꼼꼼히 본다.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDate,
  toISO,
  addDays,
  addMonths,
  daysBetween,
  splitDuration,
  formatDuration,
  formatKorean,
} from './date.ts';

const d = (iso: string) => parseDate(iso)!;

test('정상적인 날짜를 읽는다', () => {
  assert.equal(toISO(d('2026-08-31')), '2026-08-31');
  assert.equal(toISO(d('2024-02-29')), '2024-02-29'); // 윤년
  assert.equal(toISO(d('2000-01-01')), '2000-01-01');
});

test('존재하지 않는 날짜와 잘못된 형식은 거부한다', () => {
  assert.equal(parseDate('2026-02-30'), null);
  assert.equal(parseDate('2025-02-29'), null); // 평년
  assert.equal(parseDate('2026-13-01'), null);
  assert.equal(parseDate('2026-00-10'), null);
  assert.equal(parseDate('2026-8-31'), null); // 자리수 부족
  assert.equal(parseDate('아무거나'), null);
  assert.equal(parseDate(''), null);
});

test('일수 계산이 윤년을 넘어도 맞는다', () => {
  assert.equal(daysBetween(d('2026-01-01'), d('2026-01-01')), 0);
  assert.equal(daysBetween(d('2026-01-01'), d('2027-01-01')), 365);
  assert.equal(daysBetween(d('2024-01-01'), d('2025-01-01')), 366); // 윤년
  assert.equal(daysBetween(d('2026-08-31'), d('2026-09-01')), 1);
  assert.equal(daysBetween(d('2026-09-01'), d('2026-08-31')), -1);
});

test('개월 이동에서 없는 날짜는 그 달의 마지막 날로 맞춘다', () => {
  // 5월 31일 − 3개월 → 2월 31일이 아니라 2월 28일
  assert.equal(toISO(addMonths(d('2026-05-31'), -3)), '2026-02-28');
  assert.equal(toISO(addMonths(d('2024-05-31'), -3)), '2024-02-29'); // 윤년
  assert.equal(toISO(addMonths(d('2026-03-31'), -1)), '2026-02-28');
  assert.equal(toISO(addMonths(d('2026-01-31'), 1)), '2026-02-28');
});

test('개월 이동이 연도를 넘어간다', () => {
  assert.equal(toISO(addMonths(d('2026-02-01'), -3)), '2025-11-01');
  assert.equal(toISO(addMonths(d('2026-11-15'), 3)), '2027-02-15');
  assert.equal(toISO(addMonths(d('2026-06-15'), 0)), '2026-06-15');
});

test('일 단위 이동', () => {
  assert.equal(toISO(addDays(d('2026-08-31'), 1)), '2026-09-01');
  assert.equal(toISO(addDays(d('2026-03-01'), -1)), '2026-02-28');
  assert.equal(toISO(addDays(d('2024-03-01'), -1)), '2024-02-29');
});

test('기간을 년·월·일로 나눈다', () => {
  assert.deepEqual(splitDuration(d('2020-09-01'), d('2026-09-01')), {
    years: 6,
    months: 0,
    days: 0,
  });
  assert.deepEqual(splitDuration(d('2020-01-15'), d('2026-04-20')), {
    years: 6,
    months: 3,
    days: 5,
  });
  // 일수가 모자라 직전 달에서 빌려오는 경우
  assert.deepEqual(splitDuration(d('2026-01-31'), d('2026-03-01')), {
    years: 0,
    months: 1,
    days: 1,
  });
  // 역순이면 0
  assert.deepEqual(splitDuration(d('2026-05-01'), d('2026-01-01')), {
    years: 0,
    months: 0,
    days: 0,
  });
});

test('기간 표기에서 0인 단위는 생략한다', () => {
  assert.equal(formatDuration({ years: 6, months: 3, days: 12 }), '6년 3개월 12일');
  assert.equal(formatDuration({ years: 6, months: 0, days: 0 }), '6년');
  assert.equal(formatDuration({ years: 0, months: 2, days: 0 }), '2개월');
  assert.equal(formatDuration({ years: 0, months: 0, days: 0 }), '0일');
});

test('한국식 날짜 표기', () => {
  assert.equal(formatKorean(d('2026-08-31')), '2026년 8월 31일');
  assert.equal(formatKorean(d('2026-01-01')), '2026년 1월 1일');
});

test('시간대와 무관하게 같은 날을 가리킨다', () => {
  // UTC 자정 기준으로 다루므로 로컬 시간대가 무엇이든 날짜가 밀리지 않는다
  const date = d('2026-08-31');
  assert.equal(date.getUTCDate(), 31);
  assert.equal(date.getUTCMonth(), 7);
  assert.equal(date.getUTCHours(), 0);
});
