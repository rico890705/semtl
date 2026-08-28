/**
 * 4대보험 계산.
 *
 * 실수령액 계산기와 4대보험 계산기가 이 파일을 함께 쓴다.
 * 요율이 바뀌었을 때 한쪽만 고쳐지는 사고를 막으려면 보험료 산식은 한 군데에만 있어야 한다.
 *
 * 부담 주체가 항목마다 다르다는 점이 이 계산의 핵심이다.
 *   국민연금·건강보험·장기요양·고용보험(실업급여) → 노사가 절반씩
 *   고용안정·직업능력개발사업                    → 사업주 전액
 *   산재보험                                    → 사업주 전액
 */
import { ratesFor, type YearRates } from '../rates/index.ts';
import { floorTo10 } from './rounding.ts';

export type InsuranceKey =
  | 'pension'
  | 'health'
  | 'longTermCare'
  | 'employment'
  | 'employmentStability'
  | 'industrial';

export interface InsuranceLine {
  key: InsuranceKey;
  label: string;
  employee: number;
  employer: number;
  total: number;
  /** 요율 근거 한 줄 */
  note: string;
}

export interface InsuranceInput {
  /**
   * 세전 월급 (비과세 포함).
   * 보험료는 과세대상 급여로 매기지만, 회사가 실제로 쓰는 돈에는 비과세액도 들어간다.
   * 그래서 이 함수는 두 값을 모두 알아야 한다.
   */
  monthlyGross: number;
  /** 월 비과세액 — 보험료 산정에서 제외된다 */
  monthlyNonTaxable: number;
  /** 고용안정·직업능력개발사업 요율을 정하는 기업 규모 */
  companySize: string;
  /** 산재보험 업종 요율 (소수. 예: 0.0147) */
  industrialRate: number;
  year?: number;
}

export interface InsuranceResult {
  year: number;
  ratesVerified: boolean;
  /** 세전 월급 (비과세 포함) */
  monthlyGross: number;
  /** 보험료 산정 기준이 되는 과세대상 급여 */
  monthlyTaxable: number;
  /** 국민연금에 실제로 적용된 기준소득월액 */
  pensionBase: number;
  pensionCapped: boolean;
  pensionFloored: boolean;
  lines: InsuranceLine[];
  employeeTotal: number;
  employerTotal: number;
  grandTotal: number;
  /** 세전 월급 + 사업주 부담 = 회사가 실제로 쓰는 돈 */
  employerCost: number;
}

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));

/** 요율을 사람이 읽을 수 있는 문자열로 — 0.03545 → "3.545%" */
export const ratePct = (rate: number): string =>
  `${(rate * 100).toFixed(4).replace(/\.?0+$/, '')}%`;

export interface EmployeeInsurance {
  pension: number;
  health: number;
  longTermCare: number;
  employment: number;
  total: number;
  pensionBase: number;
  pensionCapped: boolean;
  pensionFloored: boolean;
}

/**
 * 근로자 부담분만 계산한다. 실수령액 계산기가 쓴다.
 * 국민연금은 기준소득월액에 상·하한이 있어 급여에 그대로 비례하지 않는다.
 */
export function employeeInsurance(monthlyTaxable: number, rates: YearRates): EmployeeInsurance {
  const taxable = Math.max(0, monthlyTaxable);
  const pensionBase = clamp(taxable, rates.pension.minBase, rates.pension.maxBase);

  const pension = taxable > 0 ? floorTo10(pensionBase * rates.pension.employeeRate) : 0;
  const health = floorTo10(taxable * rates.health.employeeRate);
  const longTermCare = floorTo10(health * rates.health.longTermCareRate);
  const employment = floorTo10(taxable * rates.employment.employeeRate);

  return {
    pension,
    health,
    longTermCare,
    employment,
    total: pension + health + longTermCare + employment,
    pensionBase,
    pensionCapped: taxable > rates.pension.maxBase,
    pensionFloored: taxable > 0 && taxable < rates.pension.minBase,
  };
}

export function calculateInsurance(input: InsuranceInput): InsuranceResult {
  const rates = ratesFor(input.year);
  const gross = Math.max(0, Math.round(input.monthlyGross));
  const nonTaxable = clamp(Math.round(input.monthlyNonTaxable), 0, gross);
  const taxable = gross - nonTaxable;
  const worker = employeeInsurance(taxable, rates);

  // --- 사업주 부담 ---
  const pensionEmployer = taxable > 0 ? floorTo10(worker.pensionBase * rates.pension.employerRate) : 0;
  const healthEmployer = floorTo10(taxable * rates.health.employerRate);
  const longTermCareEmployer = floorTo10(healthEmployer * rates.health.longTermCareRate);
  const employmentEmployer = floorTo10(taxable * rates.employment.employerRate);

  const tier =
    rates.employment.stabilityTiers.find((t) => t.id === input.companySize) ??
    rates.employment.stabilityTiers[0];
  const stabilityEmployer = floorTo10(taxable * tier.rate);

  const industrialRate = Math.max(0, input.industrialRate) + rates.industrial.commutingRate;
  const industrialEmployer = floorTo10(taxable * industrialRate);

  const lines: InsuranceLine[] = [
    {
      key: 'pension',
      label: '국민연금',
      employee: worker.pension,
      employer: pensionEmployer,
      total: worker.pension + pensionEmployer,
      note: worker.pensionCapped
        ? `기준소득월액 상한 적용 · 노사 각 ${ratePct(rates.pension.employeeRate)}`
        : `노사 각 ${ratePct(rates.pension.employeeRate)}`,
    },
    {
      key: 'health',
      label: '건강보험',
      employee: worker.health,
      employer: healthEmployer,
      total: worker.health + healthEmployer,
      note: `노사 각 ${ratePct(rates.health.employeeRate)}`,
    },
    {
      key: 'longTermCare',
      label: '장기요양보험',
      employee: worker.longTermCare,
      employer: longTermCareEmployer,
      total: worker.longTermCare + longTermCareEmployer,
      note: `각자 건강보험료의 ${ratePct(rates.health.longTermCareRate)}`,
    },
    {
      key: 'employment',
      label: '고용보험 (실업급여)',
      employee: worker.employment,
      employer: employmentEmployer,
      total: worker.employment + employmentEmployer,
      note: `노사 각 ${ratePct(rates.employment.employeeRate)}`,
    },
    {
      key: 'employmentStability',
      label: '고용안정·직업능력개발',
      employee: 0,
      employer: stabilityEmployer,
      total: stabilityEmployer,
      note: `사업주 전액 · ${tier.label} ${ratePct(tier.rate)}`,
    },
    {
      key: 'industrial',
      label: '산재보험',
      employee: 0,
      employer: industrialEmployer,
      total: industrialEmployer,
      note: `사업주 전액 · 업종 ${ratePct(Math.max(0, input.industrialRate))} + 출퇴근재해 ${ratePct(rates.industrial.commutingRate)}`,
    },
  ];

  const employeeTotal = lines.reduce((sum, l) => sum + l.employee, 0);
  const employerTotal = lines.reduce((sum, l) => sum + l.employer, 0);

  return {
    year: rates.year,
    ratesVerified: rates.verified,
    monthlyGross: gross,
    monthlyTaxable: taxable,
    pensionBase: worker.pensionBase,
    pensionCapped: worker.pensionCapped,
    pensionFloored: worker.pensionFloored,
    lines,
    employeeTotal,
    employerTotal,
    grandTotal: employeeTotal + employerTotal,
    // 비과세액도 회사가 실제로 지급하는 돈이므로 세전 급여 전액을 더한다
    employerCost: gross + employerTotal,
  };
}
