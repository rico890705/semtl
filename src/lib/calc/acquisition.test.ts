/**
 * 취득세 계산 검증.
 *
 * 세율을 정하는 분기가 많다 — 주택 여부 × 주택 수 × 조정지역 × 가액 구간.
 * 조합별로 세율과 부가세가 맞는지, 특히 중과 구간에서 부가세 산정 방식이
 * 바뀌는 부분을 집중적으로 본다.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAcquisitionTax,
  standardHouseRate,
  resolveTier,
  rateTable,
  type AcquisitionInput,
} from './acquisition.ts';
import { ACQUISITION } from '../rates/acquisition.ts';

const base: AcquisitionInput = {
  propertyKind: 'house',
  price: 500_000_000,
  exclusiveArea: 84,
  owner: 'first',
  adjustedArea: false,
  firstTime: false,
};

const at = (overrides: Partial<AcquisitionInput> = {}) =>
  calculateAcquisitionTax({ ...base, ...overrides });

test('6억원 이하 1주택은 1%다', () => {
  const r = at({ price: 500_000_000 });
  assert.equal(r.rate, 0.01);
  assert.equal(r.baseTax, 5_000_000);
  assert.equal(r.educationTax, 500_000); // 취득세율의 10%
  assert.equal(r.ruralTax, 0); // 84㎡ 이므로 비과세
  assert.equal(r.total, 5_500_000);
  assert.ok(Math.abs(r.effectiveRate - 1.1) < 0.001);
});

test('9억원 초과 1주택은 3%다', () => {
  const r = at({ price: 1_000_000_000, exclusiveArea: 100 });
  assert.equal(r.rate, 0.03);
  assert.equal(r.baseTax, 30_000_000);
  assert.equal(r.educationTax, 3_000_000);
  assert.equal(r.ruralTax, 2_000_000); // 85㎡ 초과 0.2%
  assert.equal(r.total, 35_000_000);
  assert.ok(Math.abs(r.effectiveRate - 3.5) < 0.001);
});

test('6억~9억 누진 구간이 양 끝에서 매끄럽게 이어진다', () => {
  // 경계에서 표준세율과 정확히 맞아야 계단이 생기지 않는다
  assert.equal(standardHouseRate(600_000_000).rate, 0.01);
  assert.equal(standardHouseRate(900_000_000).rate, 0.03);

  // 6억 바로 위도 1%에서 미세하게만 올라간다
  const justOver = standardHouseRate(600_000_001).rate;
  assert.ok(justOver >= 0.01 && justOver < 0.0101, `${justOver}`);

  // 9억 바로 아래도 3%에 거의 붙어 있다
  const justUnder = standardHouseRate(899_999_999).rate;
  assert.ok(justUnder > 0.0299 && justUnder <= 0.03, `${justUnder}`);
});

test('누진 구간 세율이 산식과 일치한다', () => {
  // 세율(%) = 취득가액(억) ÷ 3 × 2 − 3
  for (const eok of [6.5, 7, 7.5, 8, 8.5]) {
    const price = eok * 100_000_000;
    const expected = ((eok / 3) * 2 - 3) / 100;
    const actual = standardHouseRate(price).rate;
    assert.ok(Math.abs(actual - expected) < 1e-6, `${eok}억: ${actual} vs ${expected}`);
  }
  // 7.5억이면 정확히 2%
  assert.equal(standardHouseRate(750_000_000).rate, 0.02);
});

test('누진 구간에서는 세율이 단조 증가한다', () => {
  let previous = 0;
  for (let price = 600_000_000; price <= 900_000_000; price += 10_000_000) {
    const rate = standardHouseRate(price).rate;
    assert.ok(rate >= previous, `${price}에서 세율이 떨어졌다`);
    previous = rate;
  }
});

test('조정대상지역 2주택은 8% 중과다', () => {
  const r = at({ price: 800_000_000, owner: 'second', adjustedArea: true });
  assert.equal(r.tier, 'heavyMid');
  assert.equal(r.rate, 0.08);
  assert.equal(r.baseTax, 64_000_000);
  // 중과 구간의 지방교육세는 본세율과 무관하게 0.4% 고정
  assert.equal(r.educationTax, 3_200_000);
  assert.equal(r.ruralTax, 0); // 84㎡
  assert.equal(r.total, 67_200_000);
});

test('비조정대상지역 2주택은 중과되지 않는다', () => {
  const adjusted = at({ price: 800_000_000, owner: 'second', adjustedArea: true });
  const plain = at({ price: 800_000_000, owner: 'second', adjustedArea: false });
  assert.equal(plain.tier, 'standard');
  assert.ok(plain.rate < 0.03);
  assert.ok(plain.total < adjusted.total / 3, '중과 여부로 세금이 크게 갈려야 한다');
});

test('주택 수와 지역 조합별로 세율 구간이 맞다', () => {
  const cases: [AcquisitionInput['owner'], boolean, string][] = [
    ['first', true, 'standard'],
    ['first', false, 'standard'],
    ['second', true, 'heavyMid'],
    ['second', false, 'standard'],
    ['third', true, 'heavyTop'],
    ['third', false, 'heavyMid'],
    ['fourthPlus', true, 'heavyTop'],
    ['fourthPlus', false, 'heavyTop'],
    ['corporate', true, 'heavyTop'],
    ['corporate', false, 'heavyTop'],
  ];

  for (const [owner, adjustedArea, expected] of cases) {
    const tier = resolveTier({ ...base, owner, adjustedArea }).tier;
    assert.equal(tier, expected, `${owner} / ${adjustedArea ? '조정' : '비조정'}`);
  }
});

test('12% 중과에서 농어촌특별세가 1.0%로 오른다', () => {
  const small = at({ price: 800_000_000, owner: 'third', adjustedArea: true, exclusiveArea: 84 });
  const large = at({ price: 800_000_000, owner: 'third', adjustedArea: true, exclusiveArea: 100 });

  assert.equal(small.rate, 0.12);
  assert.equal(small.ruralTax, 0);
  assert.equal(small.ruralExempt, true);

  assert.equal(large.ruralTax, 8_000_000); // 8억 × 1.0%
  assert.equal(large.educationTax, 3_200_000); // 중과는 0.4% 고정
  assert.equal(large.total, 96_000_000 + 3_200_000 + 8_000_000);
});

test('8% 중과의 농어촌특별세는 0.6%다', () => {
  const r = at({ price: 800_000_000, owner: 'second', adjustedArea: true, exclusiveArea: 100 });
  assert.equal(r.ruralTax, 4_800_000); // 8억 × 0.6%
});

test('국민주택규모 이하는 농어촌특별세가 붙지 않는다', () => {
  const threshold = ACQUISITION.exclusiveAreaThreshold;
  assert.equal(at({ exclusiveArea: threshold, price: 1_000_000_000 }).ruralTax, 0);
  assert.ok(at({ exclusiveArea: threshold + 0.01, price: 1_000_000_000 }).ruralTax > 0);
});

test('생애최초 감면은 취득세에서 최대 200만원을 뺀다', () => {
  const plain = at({ price: 500_000_000 });
  const first = at({ price: 500_000_000, firstTime: true });

  assert.equal(first.relief, 2_000_000);
  assert.equal(first.acquisitionTax, plain.baseTax - 2_000_000);
  assert.equal(first.baseTax, plain.baseTax, '감면 전 세액은 같아야 한다');
  // 부가세는 감면과 무관하게 과세표준 기준이다
  assert.equal(first.educationTax, plain.educationTax);
  assert.equal(first.total, plain.total - 2_000_000);
});

test('취득세가 200만원보다 적으면 전액만 감면된다', () => {
  // 1억 × 1% = 100만원
  const r = at({ price: 100_000_000, firstTime: true });
  assert.equal(r.baseTax, 1_000_000);
  assert.equal(r.relief, 1_000_000);
  assert.equal(r.acquisitionTax, 0);
});

test('생애최초 감면이 막히는 조건을 안내한다', () => {
  const tooExpensive = at({ price: 1_300_000_000, firstTime: true, exclusiveArea: 100 });
  assert.equal(tooExpensive.relief, 0);
  assert.match(tooExpensive.reliefBlockedReason ?? '', /12억/);

  const notFirst = at({ owner: 'second', firstTime: true });
  assert.equal(notFirst.relief, 0);
  assert.match(notFirst.reliefBlockedReason ?? '', /1주택/);

  const notHouse = at({ propertyKind: 'nonHouse', firstTime: true });
  assert.equal(notHouse.relief, 0);
  assert.match(notHouse.reliefBlockedReason ?? '', /주택이 아닌/);

  // 정상적으로 감면되면 안내 문구가 없다
  assert.equal(at({ firstTime: true }).reliefBlockedReason, undefined);
});

test('12억원 경계에서 감면 여부가 갈린다', () => {
  const limit = ACQUISITION.firstTime.priceLimit;
  assert.equal(at({ price: limit, firstTime: true, exclusiveArea: 100 }).relief, 2_000_000);
  assert.equal(at({ price: limit + 1, firstTime: true, exclusiveArea: 100 }).relief, 0);
});

test('주택 외 부동산은 주택 수·면적과 무관하게 4%다', () => {
  const r = at({ propertyKind: 'nonHouse', price: 500_000_000, exclusiveArea: 40 });
  assert.equal(r.tier, 'nonHouse');
  assert.equal(r.rate, 0.04);
  assert.equal(r.baseTax, 20_000_000);
  assert.equal(r.educationTax, 2_000_000); // 0.4%
  assert.equal(r.ruralTax, 1_000_000); // 0.2% — 면적과 무관하게 부과
  assert.equal(r.total, 23_000_000);

  // 주택 수를 바꿔도 결과가 같다
  const many = at({ propertyKind: 'nonHouse', price: 500_000_000, owner: 'fourthPlus', adjustedArea: true });
  assert.equal(many.rate, 0.04);
});

test('총액이 항목 합계와 맞는다', () => {
  for (const owner of ['first', 'second', 'third', 'fourthPlus', 'corporate'] as const) {
    for (const adjustedArea of [true, false]) {
      const r = at({ price: 900_000_000, owner, adjustedArea, exclusiveArea: 100 });
      assert.equal(
        r.total,
        r.acquisitionTax + r.educationTax + r.ruralTax,
        `${owner}/${adjustedArea}`,
      );
      assert.equal(r.acquisitionTax, r.baseTax - r.relief);
    }
  }
});

test('세율표가 현재 가액의 표준세율을 반영한다', () => {
  const rows = rateTable(750_000_000);
  assert.equal(rows.length, 5);
  const first = rows.find((r) => r.owner === 'first')!;
  assert.equal(first.adjusted, 0.02); // 7.5억 → 2%
  assert.equal(first.nonAdjusted, 0.02);

  const second = rows.find((r) => r.owner === 'second')!;
  assert.equal(second.adjusted, 0.08);
  assert.equal(second.nonAdjusted, 0.02);
  assert.equal(second.adjustedStandard, false);
  assert.equal(second.nonAdjustedStandard, true);
});

test('0원과 잘못된 값에서도 깨지지 않는다', () => {
  const zero = at({ price: 0 });
  assert.equal(zero.total, 0);
  assert.equal(zero.effectiveRate, 0);
  assert.equal(at({ price: -100 }).total, 0);
  assert.equal(at({ price: Number.NaN }).total, 0);
});
