/**
 * 부동산 취득세 계산.
 *
 * 총 납부액 = 취득세 + 지방교육세 + 농어촌특별세
 *
 * 세율을 정하는 순서
 *   1. 주택인가 아닌가 — 주택 외는 주택 수·면적과 무관하게 4%
 *   2. 법인인가 — 지역·주택 수 무관하게 12%
 *   3. 조정대상지역인가 — 같은 주택 수라도 조정지역이면 한 단계 위 세율
 *   4. 표준 구간이면 취득가액에 따라 1~3% 누진
 *
 * 부가세의 함정
 *   표준 구간에서 지방교육세는 "취득세율의 10%"라 가액에 따라 같이 움직이지만,
 *   중과 구간에서는 0.4% 고정이다. 중과세율이 8%든 12%든 지방교육세는 같다.
 *   농어촌특별세는 전용 85㎡ 이하면 아예 붙지 않는다 — 국민주택규모 비과세.
 */
import { floorToWon } from './rounding.ts';
import { ACQUISITION, type OwnerKind } from '../rates/acquisition.ts';

export type PropertyKind = 'house' | 'nonHouse';

export interface AcquisitionInput {
  propertyKind: PropertyKind;
  /** 취득가액 (원) */
  price: number;
  /** 전용면적 (㎡) */
  exclusiveArea: number;
  /** 취득 후 보유하게 되는 주택 수 */
  owner: OwnerKind;
  /** 조정대상지역 여부 */
  adjustedArea: boolean;
  /** 생애최초 주택 구입 감면 대상 여부 */
  firstTime: boolean;
}

export type RateTier = 'standard' | 'heavyMid' | 'heavyTop' | 'nonHouse';

export interface AcquisitionResult {
  propertyKind: PropertyKind;
  price: number;
  tier: RateTier;
  /** 적용된 취득세율 (소수) */
  rate: number;
  /** 세율이 그렇게 정해진 이유 한 줄 */
  rateReason: string;
  /** 누진 구간(6~9억)에 걸렸는가 */
  progressive: boolean;

  /** 감면 전 취득세 */
  baseTax: number;
  /** 생애최초 감면액 */
  relief: number;
  /** 감면 후 취득세 */
  acquisitionTax: number;
  educationTax: number;
  ruralTax: number;
  /** 농어촌특별세가 면제됐는가 (국민주택규모) */
  ruralExempt: boolean;

  total: number;
  /** 취득가액 대비 실효세율 (%) */
  effectiveRate: number;

  /** 생애최초 감면을 못 받은 이유 (해당 시) */
  reliefBlockedReason?: string;
}

const positive = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

/**
 * 1주택 표준세율.
 * 6억 초과 9억 이하 구간은 누진 산식으로 두 끝점(1%, 3%)을 매끄럽게 잇는다.
 */
export function standardHouseRate(price: number): { rate: number; progressive: boolean } {
  const s = ACQUISITION.house.standard;
  const value = positive(price);

  if (value <= s.lowThreshold) return { rate: s.lowRate, progressive: false };
  if (value > s.highThreshold) return { rate: s.highRate, progressive: false };

  // 세율(%) = 취득가액 ÷ 3억 × 2 − 3, 소수점 다섯째 자리에서 반올림
  const percent = (value / s.progressiveDivisor) * 2 - s.progressiveOffset;
  const factor = Math.pow(10, s.rateDecimals);
  const rounded = Math.round(percent * factor) / factor;

  return { rate: rounded / 100, progressive: true };
}

interface TierInfo {
  tier: RateTier;
  rate: number;
  reason: string;
}

/** 물건 종류·주택 수·지역으로 세율 구간을 정한다 */
export function resolveTier(input: AcquisitionInput): TierInfo {
  const { heavy } = ACQUISITION.house;

  if (input.propertyKind === 'nonHouse') {
    return {
      tier: 'nonHouse',
      rate: ACQUISITION.nonHouse.rate,
      reason: '주택 외 부동산 유상취득 표준세율',
    };
  }

  if (input.owner === 'corporate') {
    return { tier: 'heavyTop', rate: heavy.top, reason: '법인은 지역·주택 수와 무관하게 중과' };
  }

  const area = input.adjustedArea ? '조정대상지역' : '비조정대상지역';

  if (input.adjustedArea) {
    if (input.owner === 'second') {
      return { tier: 'heavyMid', rate: heavy.mid, reason: `${area} 2주택 중과` };
    }
    if (input.owner === 'third' || input.owner === 'fourthPlus') {
      return { tier: 'heavyTop', rate: heavy.top, reason: `${area} 3주택 이상 중과` };
    }
  } else {
    if (input.owner === 'third') {
      return { tier: 'heavyMid', rate: heavy.mid, reason: `${area} 3주택 중과` };
    }
    if (input.owner === 'fourthPlus') {
      return { tier: 'heavyTop', rate: heavy.top, reason: `${area} 4주택 이상 중과` };
    }
  }

  const { rate, progressive } = standardHouseRate(input.price);
  return {
    tier: 'standard',
    rate,
    reason: progressive
      ? '6억 초과 9억 이하 누진 구간'
      : input.price <= ACQUISITION.house.standard.lowThreshold
        ? '6억원 이하 표준세율'
        : '9억원 초과 표준세율',
  };
}

export function calculateAcquisitionTax(input: AcquisitionInput): AcquisitionResult {
  const price = positive(input.price);
  const area = positive(input.exclusiveArea);
  const { tier, rate, reason } = resolveTier(input);
  const progressive = tier === 'standard' && standardHouseRate(price).progressive;

  const baseTax = floorToWon(price * rate);

  // --- 생애최초 감면 ---
  let relief = 0;
  let reliefBlockedReason: string | undefined;
  if (input.firstTime) {
    if (input.propertyKind !== 'house') {
      reliefBlockedReason = '주택이 아닌 부동산은 생애최초 감면 대상이 아닙니다.';
    } else if (input.owner !== 'first') {
      reliefBlockedReason = '생애최초 감면은 취득 후 1주택인 경우에만 적용됩니다.';
    } else if (price > ACQUISITION.firstTime.priceLimit) {
      reliefBlockedReason = '취득가액이 12억원을 넘으면 생애최초 감면을 받을 수 없습니다.';
    } else {
      relief = Math.min(ACQUISITION.firstTime.maxRelief, baseTax);
    }
  }
  const acquisitionTax = baseTax - relief;

  // --- 부가세 ---
  // 감면과 무관하게 과세표준(취득가액) 기준으로 매긴다
  const overThreshold = area > ACQUISITION.exclusiveAreaThreshold;
  let educationTax = 0;
  let ruralTax = 0;
  let ruralExempt = false;

  if (tier === 'nonHouse') {
    educationTax = floorToWon(price * ACQUISITION.nonHouse.education);
    ruralTax = floorToWon(price * ACQUISITION.nonHouse.rural);
  } else if (tier === 'heavyMid' || tier === 'heavyTop') {
    const s = tier === 'heavyMid' ? ACQUISITION.surtax.heavyMid : ACQUISITION.surtax.heavyTop;
    educationTax = floorToWon(price * s.education);
    ruralExempt = !overThreshold;
    ruralTax = overThreshold ? floorToWon(price * s.ruralOver85) : 0;
  } else {
    // 표준 구간 — 지방교육세가 취득세율을 따라 움직인다
    educationTax = floorToWon(price * rate * ACQUISITION.surtax.standard.educationOfRate);
    ruralExempt = !overThreshold;
    ruralTax = overThreshold ? floorToWon(price * ACQUISITION.surtax.standard.ruralOver85) : 0;
  }

  const total = acquisitionTax + educationTax + ruralTax;

  return {
    propertyKind: input.propertyKind,
    price,
    tier,
    rate,
    rateReason: reason,
    progressive,
    baseTax,
    relief,
    acquisitionTax,
    educationTax,
    ruralTax,
    ruralExempt,
    total,
    effectiveRate: price > 0 ? (total / price) * 100 : 0,
    reliefBlockedReason,
  };
}

export interface RateTableRow {
  owner: OwnerKind;
  label: string;
  adjusted: number | null;
  nonAdjusted: number | null;
  /** 표준세율 구간이면 true (가액에 따라 달라짐) */
  adjustedStandard: boolean;
  nonAdjustedStandard: boolean;
}

/** 화면에 보여줄 세율표 — 현재 조건이 어디에 해당하는지 짚어주기 위해 쓴다 */
export function rateTable(price: number): RateTableRow[] {
  const std = standardHouseRate(price).rate;
  const { mid, top } = ACQUISITION.house.heavy;

  return [
    { owner: 'first', label: '1주택', adjusted: std, nonAdjusted: std, adjustedStandard: true, nonAdjustedStandard: true },
    { owner: 'second', label: '2주택', adjusted: mid, nonAdjusted: std, adjustedStandard: false, nonAdjustedStandard: true },
    { owner: 'third', label: '3주택', adjusted: top, nonAdjusted: mid, adjustedStandard: false, nonAdjustedStandard: false },
    { owner: 'fourthPlus', label: '4주택 이상', adjusted: top, nonAdjusted: top, adjustedStandard: false, nonAdjustedStandard: false },
    { owner: 'corporate', label: '법인', adjusted: top, nonAdjusted: top, adjustedStandard: false, nonAdjustedStandard: false },
  ];
}
