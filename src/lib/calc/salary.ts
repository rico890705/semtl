/**
 * 연봉 실수령액 계산.
 *
 * 계산 순서
 *   1. 연봉 ÷ 12(또는 13) → 세전 월급
 *   2. 비과세액(식대 등)을 뺀 과세대상 급여 산출
 *   3. 4대보험 공제 — 과세대상 급여 기준
 *   4. 연간 세액 계산: 근로소득공제 → 각종 소득공제 → 과세표준 → 산출세액 → 세액공제
 *   5. 결정세액 ÷ 12 → 월 소득세, 지방소득세는 그 10%
 *
 * ⚠️ 세액 산정 방식에 대하여
 * 이 계산은 연말정산과 같은 방식으로 "연간 결정세액"을 구한 뒤 12로 나눈다.
 * 실제로 매달 급여명세서에 찍히는 원천징수액은 국세청 "근로소득 간이세액표"를
 * 따르므로 월 단위로는 차이가 날 수 있다. 그 차이는 이듬해 2월 연말정산에서
 * 정산되므로 연간 기준으로는 이쪽이 실제 부담에 더 가깝다.
 * 간이세액표 데이터를 확보하면 computeIncomeTax 만 교체하면 된다.
 *
 * 반영하지 않은 것: 신용카드·의료비·교육비·기부금·연금저축 등 개인별 공제,
 * 상여금 분리 지급, 식대 외 비과세 항목.
 */
import { ratesFor, type YearRates, type TaxBracket } from '../rates/index.ts';
import { employeeInsurance, ratePct } from './insurance.ts';
import { floorTo10 } from './rounding.ts';

export interface SalaryInput {
  /** 연봉 (원) */
  annualSalary: number;
  /** 연봉에 퇴직금이 포함된 계약이면 13으로 나눈다 */
  severanceIncluded: boolean;
  /** 공제대상 가족 수 (본인 포함) */
  dependents: number;
  /** 8세 이상 20세 이하 자녀 수 — 자녀세액공제 대상 */
  children: number;
  /** 월 비과세액 (식대 등) */
  monthlyNonTaxable: number;
  year?: number;
}

export type DeductionKey =
  | 'pension'
  | 'health'
  | 'longTermCare'
  | 'employment'
  | 'incomeTax'
  | 'localTax';

export interface DeductionLine {
  key: DeductionKey;
  label: string;
  monthly: number;
  /** 요율이나 근거를 한 줄로 */
  note: string;
}

export interface TaxDetail {
  /** 연간 총급여 (비과세 제외) */
  grossPay: number;
  earnedIncomeDeduction: number;
  /** 근로소득금액 */
  earnedIncome: number;
  personalDeduction: number;
  pensionDeduction: number;
  insuranceDeduction: number;
  /** 과세표준 */
  taxBase: number;
  bracket: TaxBracket;
  /** 산출세액 */
  computedTax: number;
  earnedIncomeCredit: number;
  childCredit: number;
  standardCredit: number;
  /** 보험료공제 대신 표준세액공제를 택했는가 */
  usedStandardCredit: boolean;
  /** 결정세액 */
  finalTax: number;
}

export interface SalaryResult {
  year: number;
  ratesVerified: boolean;
  annualGross: number;
  /** 세전 월급 (비과세 포함) */
  monthlyGross: number;
  monthlyNonTaxable: number;
  /** 과세대상 월급여 */
  monthlyTaxable: number;
  deductions: DeductionLine[];
  totalDeduction: number;
  monthlyNet: number;
  annualNet: number;
  /** 세전 대비 공제 비율 (%) */
  deductionRate: number;
  tax: TaxDetail;
}

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));

/** 근로소득공제 — 총급여 구간별 누진 */
export function earnedIncomeDeduction(grossPay: number, rates: YearRates): number {
  let previousUpTo = 0;
  for (const band of rates.incomeTax.earnedIncomeDeduction) {
    if (grossPay <= band.upTo) {
      return Math.min(
        rates.incomeTax.earnedIncomeDeductionCap,
        band.base + (grossPay - previousUpTo) * band.rate,
      );
    }
    previousUpTo = band.upTo;
  }
  return rates.incomeTax.earnedIncomeDeductionCap;
}

/** 근로소득세액공제 — 산출세액에 비례하되 총급여가 높을수록 한도가 줄어든다 */
export function earnedIncomeTaxCredit(
  computedTax: number,
  grossPay: number,
  rates: YearRates,
): number {
  const credit = rates.incomeTax.taxCredit;
  const raw =
    computedTax <= credit.threshold
      ? computedTax * credit.lowRate
      : credit.highBase + (computedTax - credit.threshold) * credit.highRate;

  let previousUpTo = 0;
  let cap = credit.caps[credit.caps.length - 1].floor;
  for (const band of credit.caps) {
    if (grossPay <= band.upTo) {
      cap = Math.max(band.floor, band.cap - (grossPay - previousUpTo) * band.taper);
      break;
    }
    previousUpTo = band.upTo;
  }

  return Math.max(0, Math.min(raw, cap));
}

/** 자녀세액공제 — 8세 이상 자녀 대상 */
export function childTaxCredit(children: number, rates: YearRates): number {
  const { first, second, additional } = rates.incomeTax.childCredit;
  const count = Math.max(0, Math.floor(children));
  if (count === 0) return 0;
  if (count === 1) return first;
  if (count === 2) return second;
  return second + additional * (count - 2);
}

interface TaxArgs {
  annualTaxablePay: number;
  annualPension: number;
  annualInsurance: number;
  dependents: number;
  children: number;
  rates: YearRates;
}

export function computeIncomeTax({
  annualTaxablePay,
  annualPension,
  annualInsurance,
  dependents,
  children,
  rates,
}: TaxArgs): TaxDetail {
  const grossPay = Math.max(0, annualTaxablePay);
  const eid = earnedIncomeDeduction(grossPay, rates);
  const earnedIncome = Math.max(0, grossPay - eid);
  const personalDeduction = rates.incomeTax.basicDeduction * Math.max(1, Math.floor(dependents));
  const child = childTaxCredit(children, rates);

  /**
   * 보험료공제(특별소득공제)와 표준세액공제는 함께 받을 수 없다.
   * 둘 다 계산해서 세금이 적게 나오는 쪽을 택한다 — 연말정산에서 실제로 그렇게 된다.
   * 소득이 낮을수록 표준세액공제가 유리해지고, 대개 세액이 0이 된다.
   */
  const path = (useInsuranceDeduction: boolean): TaxDetail => {
    const insurance = useInsuranceDeduction ? annualInsurance : 0;
    const standardCredit = useInsuranceDeduction ? 0 : rates.incomeTax.standardTaxCredit;

    const taxBase = Math.max(0, earnedIncome - personalDeduction - annualPension - insurance);
    const bracket = rates.incomeTax.brackets.find((b) => taxBase <= b.upTo)!;
    const computedTax = Math.max(0, taxBase * bracket.rate - bracket.progressive);
    const credit = earnedIncomeTaxCredit(computedTax, grossPay, rates);

    return {
      grossPay,
      earnedIncomeDeduction: eid,
      earnedIncome,
      personalDeduction,
      pensionDeduction: annualPension,
      insuranceDeduction: insurance,
      taxBase,
      bracket,
      computedTax,
      earnedIncomeCredit: credit,
      childCredit: child,
      standardCredit,
      usedStandardCredit: !useInsuranceDeduction,
      finalTax: Math.max(0, computedTax - credit - child - standardCredit),
    };
  };

  const withInsurance = path(true);
  const withStandard = path(false);
  return withStandard.finalTax < withInsurance.finalTax ? withStandard : withInsurance;
}

export function calculateSalary(input: SalaryInput): SalaryResult {
  const rates = ratesFor(input.year);
  const annualGross = clamp(input.annualSalary, 0, 100_000_000_000);
  const divisor = input.severanceIncluded ? 13 : 12;

  const monthlyGross = Math.round(annualGross / divisor);
  const monthlyNonTaxable = clamp(input.monthlyNonTaxable, 0, monthlyGross);
  const monthlyTaxable = Math.max(0, monthlyGross - monthlyNonTaxable);

  // --- 4대보험 근로자 부담분 ---
  // 산식은 insurance.ts 한 곳에만 둔다. 4대보험 계산기와 같은 코드를 쓴다.
  const insurance = employeeInsurance(monthlyTaxable, rates);
  const { pension, health, longTermCare, employment } = insurance;

  // --- 세액 ---
  const tax = computeIncomeTax({
    annualTaxablePay: monthlyTaxable * 12,
    annualPension: pension * 12,
    annualInsurance: (health + longTermCare + employment) * 12,
    dependents: input.dependents,
    children: input.children,
    rates,
  });

  const incomeTax = floorTo10(tax.finalTax / 12);
  const localTax = floorTo10(incomeTax * rates.incomeTax.localRate);

  const deductions: DeductionLine[] = [
    {
      key: 'pension',
      label: '국민연금',
      monthly: pension,
      note: insurance.pensionCapped
        ? `기준소득월액 상한 적용 (${ratePct(rates.pension.employeeRate)})`
        : `과세대상 급여의 ${ratePct(rates.pension.employeeRate)}`,
    },
    {
      key: 'health',
      label: '건강보험',
      monthly: health,
      note: `과세대상 급여의 ${ratePct(rates.health.employeeRate)}`,
    },
    {
      key: 'longTermCare',
      label: '장기요양보험',
      monthly: longTermCare,
      note: `건강보험료의 ${ratePct(rates.health.longTermCareRate)}`,
    },
    {
      key: 'employment',
      label: '고용보험',
      monthly: employment,
      note: `과세대상 급여의 ${ratePct(rates.employment.employeeRate)}`,
    },
    {
      key: 'incomeTax',
      label: '소득세',
      monthly: incomeTax,
      note: `연간 결정세액 ÷ 12 (과세표준 ${ratePct(tax.bracket.rate)} 구간)`,
    },
    {
      key: 'localTax',
      label: '지방소득세',
      monthly: localTax,
      note: `소득세의 ${ratePct(rates.incomeTax.localRate)}`,
    },
  ];

  const totalDeduction = deductions.reduce((sum, d) => sum + d.monthly, 0);
  const monthlyNet = monthlyGross - totalDeduction;

  return {
    year: rates.year,
    ratesVerified: rates.verified,
    annualGross,
    monthlyGross,
    monthlyNonTaxable,
    monthlyTaxable,
    deductions,
    totalDeduction,
    monthlyNet,
    // 퇴직금 포함 연봉이라도 실제로 급여로 받는 것은 12개월분이다
    annualNet: monthlyNet * 12,
    deductionRate: monthlyGross > 0 ? (totalDeduction / monthlyGross) * 100 : 0,
    tax,
  };
}

export interface SalaryTableRow {
  annualSalary: number;
  monthlyGross: number;
  monthlyNet: number;
  totalDeduction: number;
  deductionRate: number;
}

/**
 * 연봉 구간별 실수령액 표.
 * "연봉 5000 실수령액" 같은 검색이 실제로 가장 많은 형태라 화면에도 보여주고,
 * 나중에 구간별 롱테일 페이지를 만들 때도 이 함수를 그대로 쓴다.
 */
export function salaryTable(
  from: number,
  to: number,
  step: number,
  base: Omit<SalaryInput, 'annualSalary'>,
): SalaryTableRow[] {
  const rows: SalaryTableRow[] = [];
  for (let annual = from; annual <= to; annual += step) {
    const result = calculateSalary({ ...base, annualSalary: annual });
    rows.push({
      annualSalary: annual,
      monthlyGross: result.monthlyGross,
      monthlyNet: result.monthlyNet,
      totalDeduction: result.totalDeduction,
      deductionRate: result.deductionRate,
    });
  }
  return rows;
}
