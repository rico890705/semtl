/**
 * 나이 계산.
 *
 * 2023년 6월 만 나이 통일법이 시행됐지만 한국에는 여전히 세 가지 나이가 함께 쓰인다.
 *
 *   만 나이    생일 기준. 태어나면 0살, 생일마다 +1.
 *              법령·공문서·계약의 기본이다.
 *   연 나이    올해 − 태어난 해. 생일과 무관하다.
 *              병역법, 청소년보호법(술·담배)에서 쓴다.
 *   세는 나이  태어나면 1살, 새해마다 +1.
 *              공식 기준에서는 사라졌지만 일상 대화에는 남아 있다.
 *
 * 그래서 셋을 나란히 보여주는 것이 이 계산기의 핵심이다.
 * "술은 되는데 왜 성인이 아니지" 같은 혼란이 대부분 만 나이와 연 나이의 차이에서 온다.
 */
import { parseDate, toISO, addMonths, daysBetween, splitDuration } from '../date.ts';

export interface AgeInput {
  /** 생년월일 (YYYY-MM-DD) */
  birthDate: string;
  /** 기준일 — 보통 오늘 */
  baseDate: string;
}

export interface Milestone {
  age: number;
  label: string;
  /** 만 나이가 아니라 연 나이 기준인 항목 */
  yearBased?: boolean;
  date: string;
  reached: boolean;
  /** 아직이면 남은 일수, 지났으면 0 */
  daysLeft: number;
}

export interface AgeResult {
  valid: boolean;
  reason?: string;

  birthDate: string;
  baseDate: string;

  /** 만 나이 */
  koreanAge: number;
  /** 만 나이를 년·월·일로 쪼갠 값 */
  detail: { years: number; months: number; days: number };
  /** 연 나이 — 올해 − 태어난 해 */
  yearAge: number;
  /** 세는 나이 */
  countingAge: number;

  /** 태어나서 지금까지의 총 일수 */
  totalDays: number;
  /** 올해 생일이 지났는가 */
  birthdayPassed: boolean;
  nextBirthdayDate: string;
  daysToNextBirthday: number;

  milestones: Milestone[];
}

/**
 * 나이별 기준.
 * 만 나이 기준이 원칙이지만 병역·청소년보호법처럼 연 나이를 쓰는 것은 따로 표시한다.
 */
const MILESTONES: { age: number; label: string; yearBased?: boolean }[] = [
  { age: 14, label: '형사 책임 연령' },
  { age: 17, label: '주민등록증 발급' },
  { age: 18, label: '투표권 · 운전면허 취득' },
  { age: 19, label: '성인 (민법상 성년)' },
  { age: 19, label: '술·담배 구입', yearBased: true },
  { age: 60, label: '법정 정년' },
  { age: 65, label: '기초연금 · 경로우대' },
];

const EMPTY = {
  birthDate: '',
  baseDate: '',
  koreanAge: 0,
  detail: { years: 0, months: 0, days: 0 },
  yearAge: 0,
  countingAge: 0,
  totalDays: 0,
  birthdayPassed: false,
  nextBirthdayDate: '',
  daysToNextBirthday: 0,
  milestones: [] as Milestone[],
};

export function calculateAge(input: AgeInput): AgeResult {
  const birth = parseDate(input.birthDate);
  const base = parseDate(input.baseDate);

  if (!birth || !base) {
    return { valid: false, reason: '생년월일과 기준일을 입력해주세요.', ...EMPTY };
  }
  if (daysBetween(birth, base) < 0) {
    return { valid: false, reason: '기준일이 생년월일보다 빠릅니다.', ...EMPTY };
  }

  const detail = splitDuration(birth, base);
  const koreanAge = detail.years;
  const yearAge = base.getUTCFullYear() - birth.getUTCFullYear();
  const countingAge = yearAge + 1;

  /**
   * 올해 생일이 지났는가.
   * 생일이 지났으면 만 나이와 연 나이가 같아지고, 아직이면 만 나이가 하나 적다.
   * 두 값을 비교하는 것이 가장 단순하고 정확하다.
   */
  const birthdayPassed = koreanAge === yearAge;

  // 다음 생일 — 이번 생일이 지났으면 내년 것
  const nextBirthday = addMonths(birth, (koreanAge + 1) * 12);

  const milestones: Milestone[] = MILESTONES.map((m) => {
    // 연 나이 기준은 "그 해 1월 1일"에 도달한다
    const date = m.yearBased
      ? new Date(Date.UTC(birth.getUTCFullYear() + m.age, 0, 1))
      : addMonths(birth, m.age * 12);
    const left = daysBetween(base, date);
    return {
      age: m.age,
      label: m.label,
      yearBased: m.yearBased,
      date: toISO(date),
      reached: left <= 0,
      daysLeft: Math.max(0, left),
    };
  });

  return {
    valid: true,
    birthDate: toISO(birth),
    baseDate: toISO(base),
    koreanAge,
    detail,
    yearAge,
    countingAge,
    totalDays: daysBetween(birth, base),
    birthdayPassed,
    nextBirthdayDate: toISO(nextBirthday),
    daysToNextBirthday: Math.max(0, daysBetween(base, nextBirthday)),
    milestones,
  };
}
