/**
 * 부동산 취득세.
 *
 * 2026-08-27 확인 완료.
 *
 * 취득세는 변수가 많다. 취득가액만으로 정해지지 않고
 * 취득 후 보유 주택 수, 조정대상지역 여부, 전용면적, 생애최초 여부가 모두 세율을 바꾼다.
 *
 * 특히 중과 구간에서는 부가세(지방교육세·농어촌특별세)의 계산 방식 자체가 달라진다.
 * 표준 구간에서는 지방교육세가 "본세율의 10%"지만, 중과 구간에서는 0.4% 고정이다.
 */

/** 취득 후 보유하게 되는 주택 수 기준 */
export type OwnerKind = 'first' | 'second' | 'third' | 'fourthPlus' | 'corporate';

export const OWNER_KINDS: { id: OwnerKind; label: string; hint: string }[] = [
  { id: 'first', label: '1주택', hint: '이 집이 유일한 주택' },
  { id: 'second', label: '2주택', hint: '기존 1채 + 이번 취득' },
  { id: 'third', label: '3주택', hint: '기존 2채 + 이번 취득' },
  { id: 'fourthPlus', label: '4주택 이상', hint: '기존 3채 이상 + 이번 취득' },
  { id: 'corporate', label: '법인', hint: '지역·주택 수와 무관하게 최고세율' },
];

export const ACQUISITION = {
  verified: true,
  /** 감면 일몰 등 기준 시점 */
  basisYear: 2026,

  house: {
    /**
     * 1주택 표준세율.
     * 6억 이하 1%, 9억 초과 3%, 그 사이는 누진 산식으로 이어진다.
     *   세율(%) = 취득가액(억) ÷ 3 × 2 − 3
     * 소수점 다섯째 자리에서 반올림해 넷째 자리까지 쓴다.
     */
    standard: {
      lowThreshold: 600_000_000,
      highThreshold: 900_000_000,
      lowRate: 0.01,
      highRate: 0.03,
      /** 누진 구간 세율 계산에 쓰는 상수 */
      progressiveDivisor: 300_000_000,
      progressiveOffset: 3,
      rateDecimals: 4,
    },
    /** 다주택·법인 중과세율 */
    heavy: { mid: 0.08, top: 0.12 },
  },

  /**
   * 부가세.
   * 표준 구간과 중과 구간의 산정 방식이 다르다.
   */
  surtax: {
    standard: {
      /** 지방교육세 = 취득세율 × 50% × 20% = 취득세율의 10% */
      educationOfRate: 0.1,
      /** 농어촌특별세 — 전용 85㎡ 초과에만 부과 */
      ruralOver85: 0.002,
    },
    heavyMid: { education: 0.004, ruralOver85: 0.006 },
    heavyTop: { education: 0.004, ruralOver85: 0.01 },
  },

  /** 국민주택규모 기준 — 이 면적 이하는 농어촌특별세가 붙지 않는다 */
  exclusiveAreaThreshold: 85,

  /**
   * 생애최초 주택 구입 감면.
   * 취득세 본세에서 최대 200만원을 깎아준다.
   * 요건: 세대원 전원 무주택, 취득가액 12억원 이하, 취득 후 3년 이상 실거주.
   * 2028년 말 일몰 예정.
   */
  firstTime: {
    maxRelief: 2_000_000,
    priceLimit: 1_200_000_000,
    sunsetYear: 2028,
  },

  /**
   * 주택 외 부동산(상가·토지 등) 유상취득.
   * 면적과 주택 수의 영향을 받지 않는다.
   */
  nonHouse: {
    rate: 0.04,
    education: 0.004,
    rural: 0.002,
  },

  sources: [
    {
      label: '위택스 — 지방세 정보 (취득세)',
      url: 'https://www.wetax.go.kr',
    },
    {
      label: '찾기쉬운 생활법령정보 — 부동산 매매 시 각종 세금',
      url: 'https://www.easylaw.go.kr/CSP/CnpClsMainBtr.laf?popMenu=ov&csmSeq=649&ccfNo=4&cciNo=3&cnpClsNo=2',
    },
    {
      label: '국가법령정보센터 — 지방세법 제11조(부동산 취득세율)',
      url: 'https://www.law.go.kr/법령/지방세법/제11조',
    },
  ],
} as const;
