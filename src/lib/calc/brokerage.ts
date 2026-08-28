/**
 * 부동산 중개보수(복비) 계산.
 *
 * 산식
 *   중개보수 = 거래금액 × 상한요율   (한도액이 있는 구간은 그 금액을 넘지 못한다)
 *
 * 신경 쓸 지점
 *
 * 1) 월세는 거래금액을 환산한다.
 *    보증금 + 월차임 × 100. 다만 그 값이 5천만원 미만이면 배수를 70으로 낮춘다.
 *    소액 월세에서 중개보수가 과도해지는 것을 막는 규정이다.
 *
 * 2) 한도액은 저가 구간에만 있다.
 *    예를 들어 주택 매매 5천만원 미만 구간은 0.6%지만 25만원을 넘지 못한다.
 *    4,900만원 × 0.6% = 29.4만원이므로 실제로는 25만원이 상한이 된다.
 *
 * 3) 결과는 "상한"이지 청구서가 아니다.
 *    실제 보수는 이 범위 안에서 협의해 정한다. 화면에서 이를 분명히 해야 한다.
 *
 * 4) 거래 당사자가 각각 부담한다.
 *    매도인과 매수인(임대인과 임차인)이 각자 이 금액을 낸다.
 */
import { floorToWon } from './rounding.ts';
import {
  BROKERAGE,
  type BrokerageBand,
  type DealKind,
  type PropertyKind,
} from '../rates/brokerage.ts';

export interface BrokerageInput {
  dealKind: DealKind;
  propertyKind: PropertyKind;
  /** 매매가 또는 임대차 보증금 */
  amount: number;
  /** 월차임. 0이면 전세(또는 매매)로 본다. */
  monthlyRent: number;
  /** 부가가치세를 더할지 */
  includeVat: boolean;
}

export interface BrokerageResult {
  dealKind: DealKind;
  propertyKind: PropertyKind;
  /** 요율을 적용하는 기준 금액 */
  dealAmount: number;
  /** 월세 환산이 적용됐는가 */
  converted: boolean;
  /** 환산에 쓰인 배수 (100 또는 70) */
  multiplier: number;
  /** 배수를 70으로 낮춘 규정이 적용됐는가 */
  lowMultiplierApplied: boolean;

  rate: number;
  /** 이 구간의 한도액 */
  cap: number | null;
  /** 한도액이 실제로 상한을 눌렀는가 */
  capApplied: boolean;

  /** 요율만 적용한 금액 (한도 적용 전) */
  rawFee: number;
  /** 중개보수 상한 */
  fee: number;
  vat: number;
  /** 상한 + 부가세 */
  total: number;
  /** 거래 양쪽이 각각 부담하므로, 중개사가 받는 총액 */
  bothParties: number;

  /** 구간표. 단일 요율인 물건은 null. */
  bands: BrokerageBand[] | null;
}

const positive = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

/** 물건 종류와 거래 유형에 맞는 구간표. 단일 요율이면 null. */
export function bandsFor(
  propertyKind: PropertyKind,
  dealKind: DealKind,
): BrokerageBand[] | null {
  if (propertyKind !== 'house') return null;
  return dealKind === 'sale' ? BROKERAGE.house.sale : BROKERAGE.house.lease;
}

/** 단일 요율 물건의 요율 */
function flatRate(propertyKind: PropertyKind, dealKind: DealKind): number {
  if (propertyKind === 'officetel') {
    return dealKind === 'sale' ? BROKERAGE.officetel.sale : BROKERAGE.officetel.lease;
  }
  if (propertyKind === 'officetelOther') return BROKERAGE.officetelOther;
  return BROKERAGE.nonHouse;
}

/**
 * 임대차 거래금액 환산.
 * 월차임이 없으면(전세) 보증금이 곧 거래금액이다.
 */
export function convertLeaseAmount(
  deposit: number,
  monthlyRent: number,
): { amount: number; multiplier: number; lowApplied: boolean } {
  const base = positive(deposit);
  const rent = positive(monthlyRent);
  if (rent === 0) return { amount: base, multiplier: 0, lowApplied: false };

  const { multiplier, lowMultiplier, lowThreshold } = BROKERAGE.monthlyRent;
  const standard = base + rent * multiplier;
  if (standard >= lowThreshold) {
    return { amount: standard, multiplier, lowApplied: false };
  }
  return { amount: base + rent * lowMultiplier, multiplier: lowMultiplier, lowApplied: true };
}

export function calculateBrokerage(input: BrokerageInput): BrokerageResult {
  const { dealKind, propertyKind, includeVat } = input;
  const amount = positive(input.amount);
  const rent = dealKind === 'lease' ? positive(input.monthlyRent) : 0;

  const converted = dealKind === 'lease' && rent > 0;
  const conversion = converted
    ? convertLeaseAmount(amount, rent)
    : { amount, multiplier: 0, lowApplied: false };
  const dealAmount = conversion.amount;

  const bands = bandsFor(propertyKind, dealKind);
  let rate: number;
  let cap: number | null = null;

  if (bands) {
    const band = bands.find((b) => dealAmount < b.under) ?? bands[bands.length - 1];
    rate = band.rate;
    cap = band.cap;
  } else {
    rate = flatRate(propertyKind, dealKind);
  }

  const rawFee = floorToWon(dealAmount * rate);
  const fee = cap !== null ? Math.min(rawFee, cap) : rawFee;
  const vat = includeVat ? floorToWon(fee * BROKERAGE.vatRate) : 0;

  return {
    dealKind,
    propertyKind,
    dealAmount,
    converted,
    multiplier: conversion.multiplier,
    lowMultiplierApplied: conversion.lowApplied,
    rate,
    cap,
    capApplied: cap !== null && rawFee > cap,
    rawFee,
    fee,
    vat,
    total: fee + vat,
    bothParties: (fee + vat) * 2,
    bands,
  };
}
