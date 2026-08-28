/**
 * 대출 상환 계산
 *
 * 모든 금액은 "원" 단위 정수로 다룬다. 은행이 원 단위로 절사·반올림하기 때문에
 * 매 회차 이자를 원 단위로 반올림해야 상환표 합계가 총액과 정확히 맞는다.
 * 이 파일은 순수 함수만 둔다 — DOM도 프레임워크도 모른다.
 */

export type RepaymentMethod = 'equal-payment' | 'equal-principal' | 'bullet';

export const REPAYMENT_METHODS: { value: RepaymentMethod; label: string; blurb: string }[] = [
  {
    value: 'equal-payment',
    label: '원리금균등',
    blurb: '매달 내는 총액이 같습니다. 주택담보대출에서 가장 널리 쓰입니다.',
  },
  {
    value: 'equal-principal',
    label: '원금균등',
    blurb: '매달 갚는 원금이 같아 상환액이 점점 줄어듭니다. 총 이자가 가장 적습니다.',
  },
  {
    value: 'bullet',
    label: '만기일시',
    blurb: '기간 내내 이자만 내고 만기에 원금을 한 번에 갚습니다.',
  },
];

export interface LoanInput {
  /** 대출 원금 (원) */
  principal: number;
  /** 연 이자율 (%) */
  annualRate: number;
  /** 대출 기간 (년) */
  years: number;
  /**
   * 기간을 개월로 직접 지정한다. 주면 years 대신 이 값을 쓴다.
   * 자동차 할부처럼 30개월·42개월 같은 기간이 흔한 경우에 필요하다.
   * years 만 쓰면 정수 년으로 반올림돼 30개월이 36개월이 되어버린다.
   */
  months?: number;
  method: RepaymentMethod;
  /** 거치기간 (개월). 이 기간에는 이자만 낸다. */
  graceMonths?: number;
}

export interface ScheduleRow {
  /** 회차 (1부터) */
  n: number;
  payment: number;
  principal: number;
  interest: number;
  /** 상환 후 남은 원금 */
  balance: number;
  /** 거치기간 회차 여부 */
  grace: boolean;
}

export interface LoanResult {
  schedule: ScheduleRow[];
  months: number;
  graceMonths: number;
  /** 월 이자율 (소수) */
  monthlyRate: number;
  firstPayment: number;
  lastPayment: number;
  /** 원리금균등에서만 의미 있는 고정 상환액 */
  fixedPayment: number | null;
  totalPrincipal: number;
  totalInterest: number;
  totalPayment: number;
  /** 총 상환액 중 이자 비중 (%) */
  interestShare: number;
}

const clampInt = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(Number.isFinite(v) ? v : min)));

/**
 * 회차별 상환 스케줄을 만든다.
 * 마지막 회차가 잔액을 모두 흡수하므로 원금 합계는 항상 대출금액과 일치한다.
 */
export function buildSchedule(input: LoanInput): LoanResult {
  const principal = clampInt(input.principal, 0, 1_000_000_000_000);
  const months =
    input.months !== undefined ? clampInt(input.months, 1, 600) : clampInt(input.years, 1, 50) * 12;
  const graceMonths = clampInt(input.graceMonths ?? 0, 0, months - 1);
  const repayMonths = months - graceMonths;
  const annualRate = Number.isFinite(input.annualRate) ? Math.max(0, input.annualRate) : 0;
  const r = annualRate / 100 / 12;

  const schedule: ScheduleRow[] = [];
  let balance = principal;

  // 거치기간 — 이자만 납부, 원금은 그대로
  for (let n = 1; n <= graceMonths; n++) {
    const interest = Math.round(balance * r);
    schedule.push({ n, payment: interest, principal: 0, interest, balance, grace: true });
  }

  let fixedPayment: number | null = null;

  if (input.method === 'equal-payment') {
    const raw =
      r === 0
        ? principal / repayMonths
        : (principal * r * Math.pow(1 + r, repayMonths)) / (Math.pow(1 + r, repayMonths) - 1);
    fixedPayment = Math.round(raw);

    for (let k = 1; k <= repayMonths; k++) {
      const interest = Math.round(balance * r);
      // 마지막 회차는 잔액을 전부 털어낸다 (반올림 누적 오차 흡수)
      let paid = k === repayMonths ? balance : fixedPayment - interest;
      if (paid > balance) paid = balance;
      if (paid < 0) paid = 0;
      balance -= paid;
      schedule.push({
        n: graceMonths + k,
        payment: paid + interest,
        principal: paid,
        interest,
        balance,
        grace: false,
      });
    }
  } else if (input.method === 'equal-principal') {
    const per = Math.floor(principal / repayMonths);

    for (let k = 1; k <= repayMonths; k++) {
      const interest = Math.round(balance * r);
      const paid = k === repayMonths ? balance : Math.min(per, balance);
      balance -= paid;
      schedule.push({
        n: graceMonths + k,
        payment: paid + interest,
        principal: paid,
        interest,
        balance,
        grace: false,
      });
    }
  } else {
    // 만기일시 — 이자만 내다가 마지막에 원금 전액
    for (let k = 1; k <= repayMonths; k++) {
      const interest = Math.round(balance * r);
      const paid = k === repayMonths ? balance : 0;
      const after = balance - paid;
      schedule.push({
        n: graceMonths + k,
        payment: paid + interest,
        principal: paid,
        interest,
        balance: after,
        grace: false,
      });
      balance = after;
    }
  }

  let totalPrincipal = 0;
  let totalInterest = 0;
  for (const row of schedule) {
    totalPrincipal += row.principal;
    totalInterest += row.interest;
  }
  const totalPayment = totalPrincipal + totalInterest;

  return {
    schedule,
    months,
    graceMonths,
    monthlyRate: r,
    firstPayment: schedule[0]?.payment ?? 0,
    lastPayment: schedule[schedule.length - 1]?.payment ?? 0,
    fixedPayment,
    totalPrincipal,
    totalInterest,
    totalPayment,
    interestShare: totalPayment > 0 ? (totalInterest / totalPayment) * 100 : 0,
  };
}

export interface YearBucket {
  year: number;
  principal: number;
  interest: number;
  total: number;
}

/** 연도별 원금·이자 합계 — 상환 구성 차트용 */
export function yearlyBreakdown(schedule: ScheduleRow[]): YearBucket[] {
  const buckets: YearBucket[] = [];
  for (let i = 0; i < schedule.length; i += 12) {
    let principal = 0;
    let interest = 0;
    for (let k = i; k < Math.min(i + 12, schedule.length); k++) {
      principal += schedule[k].principal;
      interest += schedule[k].interest;
    }
    buckets.push({ year: i / 12 + 1, principal, interest, total: principal + interest });
  }
  return buckets;
}

/**
 * 역계산 — "매달 이만큼만 낼 수 있다"에서 대출 가능 금액을 구한다.
 * 사람들이 실제로 이 방향으로 검색하는데 대부분의 계산기가 지원하지 않는다.
 */
export function principalFromPayment(
  monthlyPayment: number,
  annualRate: number,
  years: number,
): number {
  const n = clampInt(years, 1, 50) * 12;
  const r = Math.max(0, annualRate) / 100 / 12;
  if (!Number.isFinite(monthlyPayment) || monthlyPayment <= 0) return 0;
  if (r === 0) return Math.round(monthlyPayment * n);
  return Math.round((monthlyPayment * (Math.pow(1 + r, n) - 1)) / (r * Math.pow(1 + r, n)));
}
