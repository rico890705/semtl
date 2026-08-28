/**
 * 부동산 중개보수 요율.
 *
 * 2026-08-27 국토교통부·서울특별시 자료와 대조 완료.
 *
 * 다른 요율 파일과 갱신 주기가 다르다.
 * 4대보험·세율은 매년 바뀌지만 중개보수 요율은 법 개정이 있을 때만 바뀐다
 * (직전 개정 2021년 10월). 그래서 연도별 파일이 아니라 따로 둔다.
 *
 * ⚠️ 지역차
 * 주택의 중개보수는 국토교통부령이 정한 범위 안에서 시·도 조례로 정한다.
 * 아래는 서울특별시 기준이며 대부분의 시·도가 같은 상한을 쓰지만,
 * 지역에 따라 다를 수 있으므로 화면에 기준 지역을 밝힌다.
 *
 * ⚠️ 이 요율은 "상한"이다
 * 실제 중개보수는 이 범위 안에서 의뢰인과 개업공인중개사가 협의해 정한다.
 * 계산 결과를 "내야 할 금액"으로 오해하지 않도록 화면에서 분명히 해야 한다.
 */

export type DealKind = 'sale' | 'lease';
export type PropertyKind = 'house' | 'officetel' | 'officetelOther' | 'nonHouse';

export interface BrokerageBand {
  /** 이 금액 "미만"까지 적용 (마지막 구간은 Infinity) */
  under: number;
  rate: number;
  /** 한도액. 없으면 null */
  cap: number | null;
}

export const PROPERTY_KINDS: { id: PropertyKind; label: string; hint: string }[] = [
  { id: 'house', label: '주택', hint: '아파트·빌라·단독주택' },
  {
    id: 'officetel',
    label: '오피스텔 (주거용)',
    hint: '전용 85㎡ 이하 + 부엌·화장실·목욕시설 구비',
  },
  { id: 'officetelOther', label: '오피스텔 (그 외)', hint: '위 요건을 갖추지 않은 오피스텔' },
  { id: 'nonHouse', label: '주택 외', hint: '상가·토지·공장 등' },
];

export const BROKERAGE = {
  verified: true,
  /** 요율 기준 지역 — 주택 요율은 시·도 조례로 정해진다 */
  region: '서울특별시',
  /** 직전 개정 시점 */
  revisedAt: '2021년 10월',

  sources: [
    {
      label: '국토교통부 — 중개보수 요율표',
      url: 'https://irts.molit.go.kr/com/cmn/popup/fee/rtecsFeeRtoPopup.do',
    },
    {
      label: '서울특별시 — 부동산 중개보수 요율',
      url: 'https://land.seoul.go.kr/land/broker/brokerageCommission.do',
    },
    {
      label: '찾기쉬운 생활법령정보 — 부동산 중개보수 산정',
      url: 'https://www.easylaw.go.kr/CSP/CnpClsMain.laf?csmSeq=649&ccfNo=2&cciNo=2&cnpClsNo=2',
    },
  ],

  /** 주택 — 구간별 상한요율과 한도액 */
  house: {
    sale: [
      { under: 50_000_000, rate: 0.006, cap: 250_000 },
      { under: 200_000_000, rate: 0.005, cap: 800_000 },
      { under: 900_000_000, rate: 0.004, cap: null },
      { under: 1_200_000_000, rate: 0.005, cap: null },
      { under: 1_500_000_000, rate: 0.006, cap: null },
      { under: Number.POSITIVE_INFINITY, rate: 0.007, cap: null },
    ] as BrokerageBand[],
    lease: [
      { under: 50_000_000, rate: 0.005, cap: 200_000 },
      { under: 100_000_000, rate: 0.004, cap: 300_000 },
      { under: 600_000_000, rate: 0.003, cap: null },
      { under: 1_200_000_000, rate: 0.004, cap: null },
      { under: 1_500_000_000, rate: 0.005, cap: null },
      { under: Number.POSITIVE_INFINITY, rate: 0.006, cap: null },
    ] as BrokerageBand[],
  },

  /** 주거용 오피스텔 — 구간 없이 단일 요율 */
  officetel: { sale: 0.005, lease: 0.004 },
  /** 요건을 갖추지 않은 오피스텔 */
  officetelOther: 0.009,
  /** 상가·토지 등 주택 외 */
  nonHouse: 0.009,

  /**
   * 월세 거래금액 환산.
   * 보증금 + 월차임 × 100 으로 계산하되, 그 결과가 5천만원 미만이면 배수를 70으로 낮춘다.
   * (소액 월세에서 중개보수가 과도해지지 않도록 하는 규정)
   */
  monthlyRent: {
    multiplier: 100,
    lowMultiplier: 70,
    lowThreshold: 50_000_000,
  },

  /** 부가가치세 — 일반과세자 기준. 간이과세자는 더 낮다. */
  vatRate: 0.1,
} as const;
