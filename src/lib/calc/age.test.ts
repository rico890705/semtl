/**
 * 나이 계산 검증.
 *
 * 만 나이·연 나이·세는 나이가 갈리는 지점(생일 전후, 연말연시)을 집중적으로 본다.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateAge } from './age.ts';

const at = (birthDate: string, baseDate: string) => calculateAge({ birthDate, baseDate });

test('생일 당일에 만 나이가 오른다', () => {
  const dayBefore = at('2000-06-15', '2026-06-14');
  const onBirthday = at('2000-06-15', '2026-06-15');

  assert.equal(dayBefore.koreanAge, 25);
  assert.equal(onBirthday.koreanAge, 26);
});

test('세 가지 나이가 생일 전후로 갈린다', () => {
  // 생일 전 — 만 나이만 하나 적다
  const before = at('2000-06-15', '2026-03-01');
  assert.equal(before.koreanAge, 25);
  assert.equal(before.yearAge, 26);
  assert.equal(before.countingAge, 27);
  assert.equal(before.birthdayPassed, false);

  // 생일 후 — 만 나이와 연 나이가 같아진다
  const after = at('2000-06-15', '2026-09-01');
  assert.equal(after.koreanAge, 26);
  assert.equal(after.yearAge, 26);
  assert.equal(after.countingAge, 27);
  assert.equal(after.birthdayPassed, true);
});

test('연 나이는 생일과 무관하게 올해 − 태어난 해다', () => {
  for (const base of ['2026-01-01', '2026-06-15', '2026-12-31']) {
    assert.equal(at('2000-06-15', base).yearAge, 26, base);
  }
});

test('세는 나이는 연 나이보다 항상 1 크다', () => {
  for (const base of ['2026-01-01', '2026-07-01', '2026-12-31']) {
    const r = at('1995-03-20', base);
    assert.equal(r.countingAge, r.yearAge + 1);
  }
});

test('태어난 날에는 만 0세다', () => {
  const r = at('2026-08-28', '2026-08-28');
  assert.equal(r.koreanAge, 0);
  assert.equal(r.yearAge, 0);
  assert.equal(r.countingAge, 1);
  assert.equal(r.totalDays, 0);
});

test('만 나이를 년·월·일로 쪼갠다', () => {
  const r = at('2000-01-15', '2026-04-20');
  assert.deepEqual(r.detail, { years: 26, months: 3, days: 5 });
  assert.equal(r.koreanAge, 26);
});

test('총 일수가 윤년을 반영한다', () => {
  // 2024년은 윤년이라 366일
  assert.equal(at('2024-01-01', '2025-01-01').totalDays, 366);
  assert.equal(at('2025-01-01', '2026-01-01').totalDays, 365);
});

test('2월 29일생도 처리된다', () => {
  const r = at('2024-02-29', '2026-03-01');
  assert.equal(r.valid, true);
  assert.equal(r.koreanAge, 2);
  // 평년에는 2월 29일이 없으므로 다음 생일이 2월 28일로 맞춰진다
  assert.ok(r.nextBirthdayDate.startsWith('2027-02-2'));
});

test('다음 생일까지 남은 일수를 센다', () => {
  const r = at('2000-06-15', '2026-06-01');
  assert.equal(r.nextBirthdayDate, '2026-06-15');
  assert.equal(r.daysToNextBirthday, 14);

  // 생일 당일이면 다음 생일은 내년이다
  const onDay = at('2000-06-15', '2026-06-15');
  assert.equal(onDay.nextBirthdayDate, '2027-06-15');
  assert.equal(onDay.daysToNextBirthday, 365);
});

test('만 나이 기준 항목은 생일에 도달한다', () => {
  const r = at('2008-06-15', '2026-06-14');
  const adult = r.milestones.find((m) => m.age === 19 && !m.yearBased)!;
  assert.equal(adult.date, '2027-06-15');
  assert.equal(adult.reached, false);
  assert.ok(adult.daysLeft > 0);

  const after = at('2008-06-15', '2027-06-15');
  const adultAfter = after.milestones.find((m) => m.age === 19 && !m.yearBased)!;
  assert.equal(adultAfter.reached, true);
  assert.equal(adultAfter.daysLeft, 0);
});

test('연 나이 기준 항목은 그 해 1월 1일에 도달한다', () => {
  // 2008년생은 2027년 1월 1일부터 술·담배 구입이 가능하다 (연 나이 19세)
  const r = at('2008-06-15', '2026-12-31');
  const drink = r.milestones.find((m) => m.yearBased)!;
  assert.equal(drink.date, '2027-01-01');
  assert.equal(drink.reached, false);

  const newYear = at('2008-06-15', '2027-01-01');
  const drinkAfter = newYear.milestones.find((m) => m.yearBased)!;
  assert.equal(drinkAfter.reached, true);
});

test('연 나이 기준이 만 나이 기준보다 먼저 온다', () => {
  // 이 차이가 "술은 되는데 성인은 아닌" 구간을 만든다
  const r = at('2008-06-15', '2027-03-01');
  const drink = r.milestones.find((m) => m.yearBased)!;
  const adult = r.milestones.find((m) => m.age === 19 && !m.yearBased)!;
  assert.equal(drink.reached, true);
  assert.equal(adult.reached, false);
});

test('기준 항목이 나이순으로 정렬돼 있다', () => {
  const r = at('2000-01-01', '2026-01-01');
  const ages = r.milestones.map((m) => m.age);
  for (let i = 1; i < ages.length; i++) {
    assert.ok(ages[i] >= ages[i - 1], '나이순이 아니다');
  }
});

test('잘못된 입력을 안내 문구와 함께 돌려준다', () => {
  assert.equal(at('', '2026-01-01').valid, false);
  assert.equal(at('2026-02-30', '2026-06-01').valid, false);
  assert.match(at('2026-06-01', '2020-01-01').reason ?? '', /빠릅니다/);
  assert.equal(at('', '').koreanAge, 0);
});
