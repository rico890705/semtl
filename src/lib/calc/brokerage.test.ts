/**
 * 중개보수 계산 검증.
 *
 * 구간 경계와 한도액이 핵심이다. 특히 한도액은 "요율로 계산한 값이 한도를 넘을 때만"
 * 눌리므로, 같은 구간 안에서도 금액에 따라 적용 여부가 갈린다.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBrokerage, convertLeaseAmount, bandsFor } from './brokerage.ts';
import { BROKERAGE } from '../rates/brokerage.ts';

const sale = (amount: number, overrides = {}) =>
  calculateBrokerage({
    dealKind: 'sale',
    propertyKind: 'house',
    amount,
    monthlyRent: 0,
    includeVat: false,
    ...overrides,
  });

const lease = (amount: number, monthlyRent = 0, overrides = {}) =>
  calculateBrokerage({
    dealKind: 'lease',
    propertyKind: 'house',
    amount,
    monthlyRent,
    includeVat: false,
    ...overrides,
  });

test('주택 매매 구간별 요율이 맞게 적용된다', () => {
  assert.equal(sale(500_000_000).rate, 0.004); // 2억~9억
  assert.equal(sale(500_000_000).fee, 2_000_000);

  assert.equal(sale(1_000_000_000).rate, 0.005); // 9억~12억
  assert.equal(sale(1_000_000_000).fee, 5_000_000);

  assert.equal(sale(1_300_000_000).rate, 0.006); // 12억~15억
  assert.equal(sale(1_500_000_000).rate, 0.007); // 15억 이상
  assert.equal(sale(1_500_000_000).fee, 10_500_000);
});

test('한도액이 요율 계산값을 누른다', () => {
  // 4,900만 × 0.6% = 294,000원이지만 한도가 25만원이다
  const capped = sale(49_000_000);
  assert.equal(capped.rate, 0.006);
  assert.equal(capped.rawFee, 294_000);
  assert.equal(capped.cap, 250_000);
  assert.equal(capped.fee, 250_000);
  assert.equal(capped.capApplied, true);

  // 1억 9천만 × 0.5% = 950,000원이지만 한도가 80만원이다
  const capped2 = sale(190_000_000);
  assert.equal(capped2.rawFee, 950_000);
  assert.equal(capped2.fee, 800_000);
  assert.equal(capped2.capApplied, true);
});

test('한도액이 있어도 요율 계산값이 작으면 그대로 쓴다', () => {
  // 5,000만 × 0.5% = 250,000원 < 한도 80만원
  const r = sale(50_000_000);
  assert.equal(r.rate, 0.005);
  assert.equal(r.fee, 250_000);
  assert.equal(r.capApplied, false);
  assert.equal(r.cap, 800_000);
});

test('구간 경계는 "미만" 기준으로 갈린다', () => {
  // 5천만원 "미만"이 0.6% 구간이므로 정확히 5천만원은 다음 구간이다
  assert.equal(sale(49_999_999).rate, 0.006);
  assert.equal(sale(50_000_000).rate, 0.005);

  assert.equal(sale(899_999_999).rate, 0.004);
  assert.equal(sale(900_000_000).rate, 0.005);

  assert.equal(sale(1_499_999_999).rate, 0.006);
  assert.equal(sale(1_500_000_000).rate, 0.007);
});

test('주택 임대차 구간별 요율이 맞게 적용된다', () => {
  assert.equal(lease(300_000_000).rate, 0.003); // 1억~6억
  assert.equal(lease(300_000_000).fee, 900_000);

  assert.equal(lease(800_000_000).rate, 0.004); // 6억~12억
  assert.equal(lease(1_300_000_000).rate, 0.005); // 12억~15억
  assert.equal(lease(1_600_000_000).rate, 0.006); // 15억 이상
});

test('임대차 한도액도 동작한다', () => {
  // 4,000만 × 0.5% = 200,000원, 한도도 200,000원
  const r = lease(40_000_000);
  assert.equal(r.rawFee, 200_000);
  assert.equal(r.fee, 200_000);

  // 9,000만 × 0.4% = 360,000원 > 한도 30만원
  const capped = lease(90_000_000);
  assert.equal(capped.rawFee, 360_000);
  assert.equal(capped.fee, 300_000);
  assert.equal(capped.capApplied, true);
});

test('전세는 환산 없이 보증금이 곧 거래금액이다', () => {
  const r = lease(300_000_000, 0);
  assert.equal(r.converted, false);
  assert.equal(r.dealAmount, 300_000_000);
});

test('월세는 보증금 + 월차임 × 100 으로 환산한다', () => {
  // 1,000만 + 50만 × 100 = 6,000만
  const r = lease(10_000_000, 500_000);
  assert.equal(r.converted, true);
  assert.equal(r.dealAmount, 60_000_000);
  assert.equal(r.multiplier, 100);
  assert.equal(r.lowMultiplierApplied, false);
  assert.equal(r.rate, 0.004); // 5천만~1억
  assert.equal(r.fee, 240_000);
});

test('환산액이 5천만원 미만이면 배수를 70으로 낮춘다', () => {
  // 500만 + 30만 × 100 = 3,500만 < 5천만 → 500만 + 30만 × 70 = 2,600만
  const r = lease(5_000_000, 300_000);
  assert.equal(r.dealAmount, 26_000_000);
  assert.equal(r.multiplier, 70);
  assert.equal(r.lowMultiplierApplied, true);
  assert.equal(r.rate, 0.005);
  assert.equal(r.fee, 130_000);
});

test('환산 규정의 경계에서 배수가 바뀐다', () => {
  // 배수 100으로 계산한 값이 정확히 5천만원이면 그대로 100을 쓴다
  const exact = convertLeaseAmount(0, 500_000);
  assert.equal(exact.amount, 50_000_000);
  assert.equal(exact.multiplier, 100);
  assert.equal(exact.lowApplied, false);

  // 1원이라도 모자라면 70으로 내려간다
  const below = convertLeaseAmount(0, 499_999);
  assert.equal(below.multiplier, 70);
  assert.equal(below.lowApplied, true);
  assert.equal(below.amount, 499_999 * 70);
});

test('주거용 오피스텔은 단일 요율을 쓴다', () => {
  const s = calculateBrokerage({
    dealKind: 'sale',
    propertyKind: 'officetel',
    amount: 300_000_000,
    monthlyRent: 0,
    includeVat: false,
  });
  assert.equal(s.rate, 0.005);
  assert.equal(s.fee, 1_500_000);
  assert.equal(s.bands, null);
  assert.equal(s.cap, null);

  const l = calculateBrokerage({
    dealKind: 'lease',
    propertyKind: 'officetel',
    amount: 300_000_000,
    monthlyRent: 0,
    includeVat: false,
  });
  assert.equal(l.rate, 0.004);
  assert.equal(l.fee, 1_200_000);
});

test('요건을 갖추지 않은 오피스텔과 주택 외는 0.9%다', () => {
  for (const propertyKind of ['officetelOther', 'nonHouse'] as const) {
    const r = calculateBrokerage({
      dealKind: 'sale',
      propertyKind,
      amount: 500_000_000,
      monthlyRent: 0,
      includeVat: false,
    });
    assert.equal(r.rate, 0.009);
    assert.equal(r.fee, 4_500_000);
  }
});

test('주택 외는 매매와 임대차 요율이 같다', () => {
  const s = calculateBrokerage({
    dealKind: 'sale',
    propertyKind: 'nonHouse',
    amount: 200_000_000,
    monthlyRent: 0,
    includeVat: false,
  });
  const l = calculateBrokerage({
    dealKind: 'lease',
    propertyKind: 'nonHouse',
    amount: 200_000_000,
    monthlyRent: 0,
    includeVat: false,
  });
  assert.equal(s.rate, l.rate);
});

test('부가가치세는 중개보수의 10%다', () => {
  const without = sale(500_000_000);
  const with_ = sale(500_000_000, { includeVat: true });
  assert.equal(without.vat, 0);
  assert.equal(without.total, without.fee);
  assert.equal(with_.vat, 200_000);
  assert.equal(with_.total, 2_200_000);
});

test('부가세는 한도액이 적용된 뒤의 금액에 붙는다', () => {
  const r = sale(49_000_000, { includeVat: true });
  assert.equal(r.fee, 250_000);
  assert.equal(r.vat, 25_000); // 294,000이 아니라 250,000의 10%
  assert.equal(r.total, 275_000);
});

test('거래 양쪽이 각각 부담하므로 중개사가 받는 총액은 두 배다', () => {
  const r = sale(500_000_000, { includeVat: true });
  assert.equal(r.bothParties, r.total * 2);
  assert.equal(r.bothParties, 4_400_000);
});

test('0원과 잘못된 값에서도 깨지지 않는다', () => {
  assert.equal(sale(0).fee, 0);
  assert.equal(sale(-100).fee, 0);
  assert.equal(lease(0, 0).dealAmount, 0);
  assert.equal(sale(Number.NaN).fee, 0);
});

test('구간표가 주택에만 딸려 나온다', () => {
  assert.equal(bandsFor('house', 'sale'), BROKERAGE.house.sale);
  assert.equal(bandsFor('house', 'lease'), BROKERAGE.house.lease);
  assert.equal(bandsFor('officetel', 'sale'), null);
  assert.equal(bandsFor('nonHouse', 'sale'), null);
});

test('구간표가 빈틈없이 이어진다', () => {
  for (const bands of [BROKERAGE.house.sale, BROKERAGE.house.lease]) {
    // 마지막 구간은 Infinity 여야 모든 금액이 어느 구간엔가 속한다
    assert.equal(bands[bands.length - 1].under, Number.POSITIVE_INFINITY);
    // 구간 상한이 단조 증가해야 find가 올바른 구간을 잡는다
    for (let i = 1; i < bands.length; i++) {
      assert.ok(bands[i].under > bands[i - 1].under, `구간 ${i}의 상한이 역전됐다`);
    }
    // 한도액은 저가 구간에만 있다
    assert.ok(bands[0].cap !== null);
    assert.ok(bands[bands.length - 1].cap === null);
  }
});
