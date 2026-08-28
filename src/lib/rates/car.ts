/**
 * 자동차 구매 관련 세금.
 *
 * 2026-08-28 찾기쉬운 생활법령정보(정부) 기준으로 확인.
 *
 * ⚠️ 자주 도는 오해 — "자동차 취득세는 9.1%"
 * 자동차 취득세에는 지방교육세가 별도로 붙지 않는다. 승용차는 7%가 전부다.
 * 9.1%라는 설명은 매년 내는 자동차세(보유세)에 붙는 지방교육세(자동차세의 30%)나
 * 부동산 취득세의 부가세목 구조와 혼동한 것이다.
 *
 * 출고가에 이미 들어 있는 것과 따로 내는 것
 *   출고가에 포함  개별소비세, 교육세, 부가가치세
 *   등록할 때 따로  취득세, 공채매입
 * 그래서 "차값 3,000만원"이라 해도 실제로는 취득세 210만원이 더 든다.
 */

export type VehicleKind = 'passenger' | 'light' | 'van' | 'motorcycle';

export interface VehicleSpec {
  id: VehicleKind;
  label: string;
  /** 취득세율 (%) */
  acquisitionRate: number;
  /** 취득세 감면 한도 (원). 0이면 감면 없음. */
  reliefLimit: number;
  hint: string;
}

export const VEHICLE_KINDS: VehicleSpec[] = [
  {
    id: 'passenger',
    label: '승용차',
    acquisitionRate: 7,
    reliefLimit: 0,
    hint: '비영업용 일반 승용차',
  },
  {
    id: 'light',
    label: '경차',
    acquisitionRate: 4,
    reliefLimit: 750_000,
    hint: '배기량 1,000cc 이하 · 취득세 75만원까지 감면',
  },
  {
    id: 'van',
    label: '승합 · 화물',
    acquisitionRate: 5,
    reliefLimit: 0,
    hint: '비영업용 승합차·화물차',
  },
  {
    id: 'motorcycle',
    label: '이륜차',
    acquisitionRate: 2,
    reliefLimit: 0,
    hint: '125cc 이하',
  },
];

export const CAR = {
  verified: true,
  basisYear: 2026,

  /**
   * 출고가에 이미 포함되어 있는 세금.
   * 계산기에서 직접 쓰지는 않지만, 차값의 구성을 설명할 때 근거가 된다.
   */
  included: {
    /** 개별소비세 기본세율. 탄력세율 적용 시 3.5%. 경차는 과세 제외. */
    exciseRate: 5,
    exciseReducedRate: 3.5,
    /** 교육세 = 개별소비세의 30% */
    educationOfExcise: 30,
    /** 부가가치세 = (공급가 + 개소세 + 교육세)의 10% */
    vatRate: 10,
  },

  /**
   * 공채(도시철도채권·지역개발채권) 매입.
   * 지역과 배기량에 따라 매입액이 다르고, 대부분 즉시 할인 매도하므로
   * 실제 부담은 매입액의 일부다. 그래서 사용자가 직접 넣게 한다.
   */
  bond: {
    /** 즉시 매도 시 실부담 비율의 통상 범위 (%) */
    typicalDiscountLow: 7,
    typicalDiscountHigh: 12,
  },

  /** 할부 기간으로 흔히 쓰는 개월 수 */
  commonTerms: [12, 24, 36, 48, 60, 72],

  sources: [
    {
      label: '찾기쉬운 생활법령정보 — 자동차를 구입할 때 내야 할 세금',
      url: 'https://easylaw.go.kr/CSP/CnpClsMain.laf?popMenu=ov&csmSeq=675&ccfNo=1&cciNo=1&cnpClsNo=2',
    },
    {
      label: '현대자동차 — 자동차 관련 세금 제도 안내',
      url: 'https://www.hyundai.com/kr/ko/e/customer/guide/system/tax-car',
    },
  ],
} as const;

export const vehicleById = (id: VehicleKind): VehicleSpec =>
  VEHICLE_KINDS.find((v) => v.id === id) ?? VEHICLE_KINDS[0];
