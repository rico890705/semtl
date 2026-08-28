<script lang="ts">
  /**
   * 평수 계산기 위젯.
   *
   * 단순 변환만 내놓으면 오히려 헷갈린다.
   * "전용 84㎡ = 25.4평"이 맞는 답인데, 시장에서는 같은 집을 34평이라 부르기 때문이다.
   * 부르는 평수는 공급면적 기준이라서다.
   *
   * 그래서 전용과 공급을 같이 보여주고 전용률을 드러낸다.
   */
  import { onMount } from 'svelte';
  import NumberField from './NumberField.svelte';
  import {
    convertArea,
    m2ToPyeong,
    COMMON_SIZES,
    NATIONAL_HOUSING_M2,
    PYEONG_IN_M2,
    type AreaUnit,
  } from '../lib/calc/area';

  const STORAGE_KEY = 'semtl:area';

  let value = $state(84);
  let unit = $state<AreaUnit>('m2');
  let exclusiveRatio = $state(75);
  let ready = $state(false);
  let copied = $state(false);

  const result = $derived(convertArea({ value, unit, exclusiveRatio }));
  const isM2 = $derived(unit === 'm2');
  const overNationalSize = $derived(result.exclusiveM2 > NATIONAL_HOUSING_M2);

  const fmt = (n: number, digits = 2) =>
    n.toLocaleString('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

  const query = $derived(`?value=${value}&unit=${unit}&ratio=${exclusiveRatio}`);
  const shareUrl = $derived(ready ? `${location.origin}${location.pathname}${query}` : '');

  function switchUnit(next: AreaUnit) {
    if (next === unit) return;
    // 단위를 바꿔도 같은 넓이를 가리키도록 값을 환산해준다
    value = Number(
      (next === 'pyeong' ? m2ToPyeong(value) : value * PYEONG_IN_M2).toFixed(2),
    );
    unit = next;
  }

  onMount(() => {
    const p = new URLSearchParams(location.search);
    if (p.has('value')) {
      value = Number(p.get('value')) || value;
      const u = p.get('unit');
      if (u === 'm2' || u === 'pyeong') unit = u;
      exclusiveRatio = Number(p.get('ratio')) || exclusiveRatio;
    } else {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const s = JSON.parse(saved);
          if (typeof s.value === 'number') value = s.value;
          if (s.unit === 'm2' || s.unit === 'pyeong') unit = s.unit;
          if (typeof s.exclusiveRatio === 'number') exclusiveRatio = s.exclusiveRatio;
        }
      } catch {
        /* 저장값이 깨졌거나 접근 불가 — 기본값으로 시작 */
      }
    }
    ready = true;
  });

  $effect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ value, unit, exclusiveRatio }));
    } catch {
      /* 저장 불가여도 계산에는 영향이 없다 */
    }
  });

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      /* 권한이 없으면 입력창을 직접 선택해 복사할 수 있다 */
    }
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

<div class="split">
  <div class="inputs">
    <div class="card">
      <div class="card-head"><p class="card-title">면적 입력</p></div>

      <form class="form" autocomplete="off" onsubmit={(e) => e.preventDefault()}>
        <div class="field">
          <span class="field-label">입력 단위</span>
          <div class="seg two" role="group" aria-label="입력 단위">
            <button type="button" aria-pressed={isM2} onclick={() => switchUnit('m2')}>
              제곱미터
            </button>
            <button type="button" aria-pressed={!isM2} onclick={() => switchUnit('pyeong')}>
              평
            </button>
          </div>
        </div>

        <NumberField
          id="area-value"
          label={isM2 ? '전용면적' : '전용면적'}
          unit={isM2 ? '㎡' : '평'}
          bind:value
          min={0}
          max={100_000}
          decimals={2}
          hint={isM2 ? `${fmt(result.exclusivePyeong)}평` : `${fmt(result.exclusiveM2)}㎡`}
          sliderMin={isM2 ? 10 : 3}
          sliderMax={isM2 ? 300 : 90}
          sliderStep={isM2 ? 0.5 : 0.1}
          chips={isM2
            ? [
                { label: '59㎡', value: 59 },
                { label: '84㎡', value: 84 },
                { label: '114㎡', value: 114 },
              ]
            : [
                { label: '10평', value: 10 },
                { label: '25평', value: 25 },
                { label: '34평', value: 34 },
              ]}
        />

        <NumberField
          id="area-ratio"
          label="전용률"
          unit="%"
          bind:value={exclusiveRatio}
          min={1}
          max={100}
          decimals={1}
          hint="전용면적 ÷ 공급면적"
          sliderMin={50}
          sliderMax={100}
          sliderStep={0.5}
        />
        <p class="field-note tight">
          아파트는 보통 70~80%입니다. 관리비 고지서나 분양 자료에서 확인할 수 있습니다.
          모르면 75%로 두세요.
        </p>
      </form>
    </div>
  </div>

  <div class="results">
    <div class="card">
      <div class="headline">
        <p class="k">전용면적</p>
        <p class="v num">
          {isM2 ? fmt(result.exclusivePyeong) : fmt(result.exclusiveM2)}<small
            >{isM2 ? '평' : '㎡'}</small
          >
        </p>
        <p class="sub">
          {fmt(result.exclusiveM2)}㎡ = {fmt(result.exclusivePyeong)}평
          {#if overNationalSize}
            · 국민주택규모({NATIONAL_HOUSING_M2}㎡) 초과
          {:else}
            · 국민주택규모 이하
          {/if}
        </p>
      </div>

      <!-- 이 계산기가 풀어야 할 핵심 혼란 -->
      <div class="compare">
        <div class="cmp-row">
          <span class="cmp-label">
            전용면적
            <span class="cmp-note">실제로 쓰는 집 안 넓이</span>
          </span>
          <span class="cmp-value num">{fmt(result.exclusiveM2)}㎡</span>
          <span class="cmp-pyeong num">{fmt(result.exclusivePyeong)}평</span>
        </div>
        <div class="cmp-row supply">
          <span class="cmp-label">
            공급면적
            <span class="cmp-note">전용 + 계단·복도 등 주거공용</span>
          </span>
          <span class="cmp-value num">{fmt(result.supplyM2)}㎡</span>
          <span class="cmp-pyeong num">{fmt(result.supplyPyeong)}평</span>
        </div>

        <p class="cmp-verdict">
          이 집은 시장에서 <strong>{result.nickname}평형</strong>이라고 부릅니다.
          전용면적을 평으로 바꾸면 {fmt(result.exclusivePyeong)}평이지만, 부르는 평수는
          <strong>공급면적 기준</strong>이라 다릅니다.
        </p>
      </div>

      <div class="share">
        <div class="share-row">
          <input
            class="num"
            readonly
            value={shareUrl}
            aria-label="이 계산 결과의 링크"
            onfocus={(e) => e.currentTarget.select()}
          />
          <button type="button" class="btn" onclick={copyLink}>
            {copied ? '복사됨' : '링크 복사'}
          </button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><p class="card-title">아파트 평형 대응표</p></div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">전용면적</th>
              <th scope="col">전용 기준 평수</th>
              <th scope="col">부르는 이름</th>
              <th scope="col" class="note-col">비고</th>
            </tr>
          </thead>
          <tbody>
            {#each COMMON_SIZES as size (size.exclusiveM2)}
              <tr class:here={Math.abs(result.exclusiveM2 - size.exclusiveM2) < 1}>
                <td>{size.exclusiveM2}㎡</td>
                <td class="p-col">{fmt(m2ToPyeong(size.exclusiveM2), 1)}평</td>
                <td class="i-col">{size.nickname}</td>
                <td class="note-col">{size.note}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="table-note">
        "부르는 이름"은 공급면적 기준이라 전용 기준 평수와 차이가 납니다. 전용률에 따라
        단지마다 조금씩 다릅니다.
      </p>
    </div>
  </div>
</div>

<style>
  .split {
    display: grid;
    gap: 20px;
    align-items: start;
  }

  @media (min-width: 900px) {
    .split {
      grid-template-columns: 372px 1fr;
    }

    .inputs {
      position: sticky;
      top: 78px;
    }
  }

  .form {
    padding: 18px 20px 22px;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  .field-label {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
  }

  .field-note {
    font-size: 12.5px;
    color: var(--ink-3);
    margin: 0;
    line-height: 1.5;
  }

  .field-note.tight {
    margin-top: -14px;
  }

  .seg {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 4px;
    padding: 4px;
    background: var(--surface-2);
    border-radius: 9px;
  }

  .seg button {
    font-family: var(--f-body);
    font-size: 13px;
    font-weight: 600;
    padding: 8px 4px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--ink-3);
    cursor: pointer;
    transition: all 0.13s;
  }

  .seg button:hover {
    color: var(--ink);
  }

  .seg button[aria-pressed='true'] {
    background: var(--surface);
    color: var(--accent-ink);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  }

  .results {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .headline {
    padding: 22px 24px 22px;
  }

  .headline .k {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--ink-3);
    margin: 0 0 4px;
  }

  .headline .v {
    font-size: clamp(36px, 7vw, 52px);
    font-weight: 600;
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: var(--accent-ink);
    margin: 0;
  }

  .headline .v small {
    font-size: 0.4em;
    font-weight: 500;
    color: var(--ink-2);
    margin-left: 5px;
  }

  .headline .sub {
    font-size: 13.5px;
    color: var(--ink-3);
    margin: 8px 0 0;
  }

  /* ---- 전용 vs 공급 ---- */
  .compare {
    padding: 16px 24px 20px;
    border-top: 1px solid var(--line);
  }

  .cmp-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 14px;
    align-items: baseline;
    padding: 10px 0;
    border-bottom: 1px dashed var(--line);
  }

  .cmp-label {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--principal);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .cmp-row.supply .cmp-label {
    color: var(--interest);
  }

  .cmp-note {
    font-size: 11.5px;
    font-weight: 400;
    color: var(--ink-3);
  }

  .cmp-value {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink-2);
    min-width: 76px;
    text-align: right;
  }

  .cmp-pyeong {
    font-size: 15px;
    font-weight: 700;
    color: var(--ink);
    min-width: 68px;
    text-align: right;
  }

  .cmp-verdict {
    font-size: 13px;
    color: var(--ink-2);
    margin: 14px 0 0;
    padding: 12px 14px;
    background: var(--surface-2);
    border-radius: 9px;
    line-height: 1.65;
  }

  .cmp-verdict strong {
    color: var(--ink);
    font-weight: 600;
  }

  .share {
    padding: 16px 24px 20px;
    border-top: 1px solid var(--line);
  }

  .share-row {
    display: flex;
    gap: 8px;
  }

  .share input {
    flex: 1;
    min-width: 0;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: var(--ground);
    color: var(--ink-2);
    font-size: 12.5px;
    padding: 9px 11px;
  }

  .share input:focus {
    outline: none;
    border-color: var(--focus);
  }

  /* ---- 대응표 ---- */
  .table-scroll {
    margin: 4px 20px 0;
    border: 0;
  }

  table {
    min-width: 420px;
  }

  .p-col {
    color: var(--principal);
    font-weight: 600;
  }

  .i-col {
    color: var(--interest);
    font-weight: 600;
  }

  .note-col {
    text-align: left;
    font-family: var(--f-body);
    font-size: 12px;
    color: var(--ink-3);
  }

  tbody tr.here td {
    background: var(--accent-soft);
  }

  tbody tr.here td:first-child {
    font-weight: 700;
    color: var(--accent-ink);
  }

  .table-note {
    font-size: 12.5px;
    color: var(--ink-3);
    margin: 12px 24px 20px;
    line-height: 1.6;
  }

  @media (max-width: 620px) {
    .note-col {
      display: none;
    }

    table {
      min-width: 300px;
    }
  }
</style>
