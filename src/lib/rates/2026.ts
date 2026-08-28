/**
 * 2026년 기준 요율·세율.
 *
 * 2026-08-27 공식 자료 대조 완료 (VERIFIED = true).
 * 대조한 출처는 아래 sources 배열에 있다. 다음 갱신 시에도 같은 페이지를 다시 확인하면 된다.
 *
 * 매년 바뀌는 것 — 갱신 시점을 함께 적어둔다
 *   - 국민연금 보험료율          2026~2033년 매년 0.5%p 인상 (9.5% → 13%)
 *   - 국민연금 기준소득월액 상·하한  매년 7월
 *   - 건강보험료율·장기요양보험료율   매년 1월
 *   - 산재보험 업종별 요율         매년 1월 (고용노동부 고시)
 *   - 자녀세액공제 등 세법 개정사항   매년
 *
 * 상대적으로 안정적인 것
 *   - 소득세 과세표준 구간과 세율    2023년 개정 후 유지
 *   - 근로소득공제·근로소득세액공제 산식
 *   - 퇴직소득세 근속연수공제·환산급여공제  2023년 개정 후 유지
 *   - 식대 비과세 한도 20만원      2023년 인상 후 유지
 */

export interface TaxBracket {
  /** 이 금액 이하까지 적용 (마지막 구간은 Infinity) */
  upTo: number;
  rate: number;
  /** 누진공제액 */
  progressive: number;
}

export interface DeductionBand {
  upTo: number;
  base: number;
  rate: number;
}

export interface YearRates {
  year: number;
  /** 공식 자료와 대조를 마쳤는가. false 인 동안은 참고용으로만 쓸 것. */
  verified: boolean;
  sources: { label: string; url: string }[];

  pension: {
    /** 근로자 부담분 (사업주가 같은 금액을 부담) */
    employeeRate: number;
    /** 사업주 부담분 */
    employerRate: number;
    /** 기준소득월액 하한 */
    minBase: number;
    /** 기준소득월액 상한 — 이 위로는 보험료가 더 오르지 않는다 */
    maxBase: number;
  };

  health: {
    /** 근로자 부담분 (총 보험료율의 절반) */
    employeeRate: number;
    /** 사업주 부담분 */
    employerRate: number;
    /** 장기요양보험료 = 건강보험료 × 이 비율 */
    longTermCareRate: number;
  };

  employment: {
    /** 실업급여분 근로자 부담 */
    employeeRate: number;
    /** 실업급여분 사업주 부담 */
    employerRate: number;
    /**
     * 고용안정·직업능력개발사업 — 전액 사업주 부담이며 기업 규모에 따라 달라진다.
     * 근로자는 이 항목을 내지 않는다.
     */
    stabilityTiers: { id: string; label: string; rate: number }[];
  };

  /**
   * 산재보험 — 전액 사업주 부담.
   * 업종별로 요율 차이가 매우 커서(제조·건설이 높고 사무직이 낮다) 사용자가 직접 넣게 한다.
   * averageRate 는 사업종류별 평균이며 기본값으로만 쓴다.
   */
  industrial: {
    averageRate: number;
    /** 업종과 무관하게 붙는 출퇴근재해 요율 */
    commutingRate: number;
  };

  incomeTax: {
    brackets: TaxBracket[];
    /** 근로소득공제 구간 */
    earnedIncomeDeduction: DeductionBand[];
    /** 근로소득공제 한도 */
    earnedIncomeDeductionCap: number;
    /** 기본공제 1인당 */
    basicDeduction: number;
    /** 근로소득세액공제 */
    taxCredit: {
      threshold: number;
      lowRate: number;
      highBase: number;
      highRate: number;
      /** 총급여 구간별 공제 한도 */
      caps: { upTo: number; cap: number; taper: number; floor: number }[];
    };
    /**
     * 표준세액공제.
     * 특별소득공제(보험료공제 등)를 받지 않는 경우에 적용된다.
     * 저소득 구간에서는 보험료공제보다 이쪽이 유리해 세액이 0이 되는 일이 많다.
     */
    standardTaxCredit: number;
    /**
     * 근로소득이 없는 종합소득자의 표준세액공제.
     * 근로소득자(13만원)보다 적다. 소득세법 제59조의4 제9항.
     */
    standardTaxCreditNoEarned: number;
    /**
     * 사업소득 원천징수율.
     * 프리랜서가 "3.3% 떼고" 받는 것은 소득세 3% + 지방소득세 0.3%다.
     * 지방소득세는 별도로 신고·납부하므로 종합소득세 정산에서는 3%만 기납부세액이 된다.
     */
    businessWithholdingRate: number;
    /** 자녀세액공제 (8세 이상 자녀) */
    childCredit: { first: number; second: number; additional: number };
    /** 지방소득세 = 소득세 × 이 비율 */
    localRate: number;
  };

  /**
   * 퇴직소득세.
   * 근속연수로 나눠 12를 곱한 "환산급여"에 기본세율을 적용한 뒤 다시 되돌리는 구조라
   * 같은 금액이라도 오래 일했을수록 세금이 크게 줄어든다.
   */
  severanceTax: {
    /** 근속연수공제 — 근속연수 구간별 누진 */
    serviceYearDeduction: { upToYears: number; base: number; perYear: number }[];
    /** 환산급여공제 — 환산급여 구간별 누진 */
    convertedDeduction: { upTo: number; base: number; rate: number }[];
  };

  /** 근로기준법상 월 소정근로시간 (주 40시간 기준) — 통상임금 환산에 쓴다 */
  monthlyWorkHours: number;

  nonTaxable: {
    /** 식대 비과세 월 한도 */
    mealAllowanceMonthly: number;
  };
}

/** 2026-08-27 아래 sources의 공식 자료와 대조 완료 */
const VERIFIED = true;

export const RATES_2026: YearRates = {
  year: 2026,
  verified: VERIFIED,
  sources: [
    {
      label: '보건복지부 — 2026년 건강보험료율 7.19% 결정',
      url: 'https://www.mohw.go.kr/board.es?mid=a10503010100&bid=0027&act=view&list_no=1487279',
    },
    {
      label: '보건복지부 — 2026년도 장기요양보험료율 0.9448% (건강보험료 대비 13.14%)',
      url: 'https://www.mohw.go.kr/board.es?mid=a10503010100&bid=0027&act=view&list_no=1487817',
    },
    {
      label: '국민연금공단 — 2026년 기준소득월액 상·하한액 조정',
      url: 'https://www.nps.or.kr/pnsgdnc/newgdnc/getOHAE0001M1.do?pstId=ZZ202600000000000147',
    },
    {
      label: '국민연금공단 — 연금개혁 FAQ (보험료율 9.5%)',
      url: 'https://www.nps.or.kr/pnsinfo/ntpsklg/getOHAF0104M0.do',
    },
    {
      label: '고용노동부 — 2026년도 사업종류별 산재보험료율 고시',
      url: 'https://www.moel.go.kr/info/lawinfo/instruction/view.do?bbs_seq=20251201757',
    },
    {
      label: '국세청 — 종합소득세 세율',
      url: 'https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7667',
    },
    {
      label: '국세청 — 근로소득세액공제',
      url: 'https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7875&mi=6596',
    },
    {
      label: '국세청 — 퇴직소득세 계산방법',
      url: 'https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7880&mi=6409',
    },
    {
      label: '국가법령정보센터 — 소득세법 제47조 (근로소득공제)',
      url: 'https://www.law.go.kr/법령/소득세법/제47조',
    },
  ],

  pension: {
    // 2026년 연금개혁 시행으로 총 9%에서 9.5%로 인상 (2033년 13%까지 매년 0.5%p)
    employeeRate: 0.0475,
    employerRate: 0.0475,
    // 2026.7.1 ~ 2027.6.30 적용. 매년 7월에 바뀐다.
    minBase: 410_000,
    maxBase: 6_590_000,
  },

  health: {
    // 2026년 직장가입자 보험료율 7.19%를 노사가 절반씩
    employeeRate: 0.03595,
    employerRate: 0.03595,
    // 2026년 장기요양보험료율은 소득 대비 0.9448%, 건강보험료 대비 13.14%
    longTermCareRate: 0.1314,
  },

  employment: {
    // 실업급여 총 1.8%를 노사가 절반씩 (2022년 7월 인상 후 동결)
    employeeRate: 0.009,
    employerRate: 0.009,
    // 고용안정·직업능력개발사업 — 사업주 전액 부담
    stabilityTiers: [
      { id: 'under150', label: '150인 미만', rate: 0.0025 },
      { id: 'priority150', label: '150인 이상 (우선지원대상기업)', rate: 0.0045 },
      { id: 'under1000', label: '150인 이상 1,000인 미만', rate: 0.0065 },
      { id: 'over1000', label: '1,000인 이상 · 국가·지자체', rate: 0.0085 },
    ],
  },

  industrial: {
    /**
     * 사업종류별(28개 업종) 평균 요율.
     *
     * 주의: 흔히 인용되는 "2026년 평균 산재보험료율 1.47%"는 사업종류별 평균에
     * 출퇴근재해 요율을 합산한 값이다. 이 필드는 출퇴근재해를 뺀 업종 평균이어야
     * commutingRate 와 더했을 때 1.47%가 된다.
     */
    averageRate: 0.0141,
    // 출퇴근재해 요율 — 전 업종 동일 0.6/1,000
    commutingRate: 0.0006,
  },

  incomeTax: {
    // 2023년 개정 구간. 누진공제액은 구간 경계에서 연속이 되도록 계산된 값이다.
    brackets: [
      { upTo: 14_000_000, rate: 0.06, progressive: 0 },
      { upTo: 50_000_000, rate: 0.15, progressive: 1_260_000 },
      { upTo: 88_000_000, rate: 0.24, progressive: 5_760_000 },
      { upTo: 150_000_000, rate: 0.35, progressive: 15_440_000 },
      { upTo: 300_000_000, rate: 0.38, progressive: 19_940_000 },
      { upTo: 500_000_000, rate: 0.4, progressive: 25_940_000 },
      { upTo: 1_000_000_000, rate: 0.42, progressive: 35_940_000 },
      { upTo: Number.POSITIVE_INFINITY, rate: 0.45, progressive: 65_940_000 },
    ],

    earnedIncomeDeduction: [
      { upTo: 5_000_000, base: 0, rate: 0.7 },
      { upTo: 15_000_000, base: 3_500_000, rate: 0.4 },
      { upTo: 45_000_000, base: 7_500_000, rate: 0.15 },
      { upTo: 100_000_000, base: 12_000_000, rate: 0.05 },
      { upTo: Number.POSITIVE_INFINITY, base: 14_750_000, rate: 0.02 },
    ],
    earnedIncomeDeductionCap: 20_000_000,

    basicDeduction: 1_500_000,

    taxCredit: {
      threshold: 1_300_000,
      lowRate: 0.55,
      highBase: 715_000,
      highRate: 0.3,
      caps: [
        { upTo: 33_000_000, cap: 740_000, taper: 0, floor: 740_000 },
        { upTo: 70_000_000, cap: 740_000, taper: 0.008, floor: 660_000 },
        { upTo: 120_000_000, cap: 660_000, taper: 0.5, floor: 500_000 },
        { upTo: Number.POSITIVE_INFINITY, cap: 500_000, taper: 0.5, floor: 200_000 },
      ],
    },

    standardTaxCredit: 130_000,
    standardTaxCreditNoEarned: 70_000,
    businessWithholdingRate: 0.03,

    // 2026년 인상: 1명 25만원, 2명 55만원, 3명 이상 55만원 + 초과 1명당 40만원
    childCredit: { first: 250_000, second: 550_000, additional: 400_000 },

    localRate: 0.1,
  },

  severanceTax: {
    // 2023년 개정분. 구간 경계에서 공제액이 이어지도록 base 값이 맞춰져 있다.
    serviceYearDeduction: [
      { upToYears: 5, base: 0, perYear: 1_000_000 },
      { upToYears: 10, base: 5_000_000, perYear: 2_000_000 },
      { upToYears: 20, base: 15_000_000, perYear: 2_500_000 },
      { upToYears: Number.POSITIVE_INFINITY, base: 40_000_000, perYear: 3_000_000 },
    ],
    convertedDeduction: [
      { upTo: 8_000_000, base: 0, rate: 1 },
      { upTo: 70_000_000, base: 8_000_000, rate: 0.6 },
      { upTo: 100_000_000, base: 45_200_000, rate: 0.55 },
      { upTo: 300_000_000, base: 61_700_000, rate: 0.45 },
      { upTo: Number.POSITIVE_INFINITY, base: 151_700_000, rate: 0.35 },
    ],
  },

  // 주 40시간 + 주휴 8시간 기준 월 209시간
  monthlyWorkHours: 209,

  nonTaxable: {
    mealAllowanceMonthly: 200_000,
  },
};
