<script lang="ts">
  /**
   * 중개보수(복비) 계산기 위젯.
   *
   * 이 계산기에서 가장 중요한 커뮤니케이션은 "이건 상한이지 청구서가 아니다"라는 점이다.
   * 실제 보수는 이 범위 안에서 협의해 정하는데, 그걸 모르고 부르는 대로 내는 사람이 많다.
   */
  import { onMount } from 'svelte';
  import NumberField from './NumberField.svelte';
  import { calculateBrokerage } from '../lib/calc/brokerage';
  import { BROKERAGE, PROPERTY_KINDS, type DealKind, type PropertyKind } from '../lib/rates/brokerage';
  import { won, koreanWon } from '../lib/format';

  const STORAGE_KEY = 'semtl:brokerage';

  let dealKind = $state<DealKind>('sale');
  let propertyKind = $state<PropertyKind>('house');
  let amount = $state(500_000_000);
  let monthlyRent = $state(0);
  let includeVat = $state(false);
  let ready = $state(false);
  let copied = $state(false);

  const input = $derived({ dealKind, propertyKind, amount, monthlyRent, includeVat });
  const result = $derived(calculateBrokerage(input));

  const isLease = $derived(dealKind === 'lease');
  const amountLabel = $derived(isLease ? '보증금' : '거래금액');
  const rateText = (rate: number) => `${(rate * 100).toFixed(1).replace(/\.0$/, '')}%`;

  const kindHint = $derived(PROPERTY_KINDS.find((k) => k.id === propertyKind)?.hint ?? '');

  const query = $derived(
    `?deal=${dealKind}&kind=${propertyKind}&amount=${amount}` +
      `&rent=${monthlyRent}${includeVat ? '&vat=1' : ''}`,
  );
  const shareUrl = $derived(ready ? `${location.origin}${location.pathname}${query}` : '');

  onMount(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('amount')) {
      const deal = params.get('deal');
      if (deal === 'sale' || deal === 'lease') dealKind = deal;
      const kind = params.get('kind');
      if (PROPERTY_KINDS.some((k) => k.id === kind)) propertyKind = kind as PropertyKind;
      amount = Number(params.get('amount')) || amount;
      monthlyRent = Number(params.get('rent')) || 0;
      includeVat = params.get('vat') === '1';
    } else {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const p = JSON.parse(saved);
          if (p.dealKind === 'sale' || p.dealKind === 'lease') dealKind = p.dealKind;
          if (PROPERTY_KINDS.some((k) => k.id === p.propertyKind)) propertyKind = p.propertyKind;
          if (typeof p.amount === 'number') amount = p.amount;
          if (typeof p.monthlyRent === 'number') monthlyRent = p.monthlyRent;
          if (typeof p.includeVat === 'boolean') includeVat = p.includeVat;
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(input));
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
  <!-- ===== 입력 ===== -->
  <div class="inputs">
    <div class="card">
      <div class="card-head"><p class="card-title">조건 입력</p></div>

      <form class="form" autocomplete="off" onsubmit={(e) => e.preventDefault()}>
        <div class="field">
          <span class="field-label">거래 유형</span>
          <div class="seg two" role="group" aria-label="거래 유형">
            <button type="button" aria-pressed={!isLease} onclick={() => (dealKind = 'sale')}>
              매매·교환
            </button>
            <button type="button" aria-pressed={isLease} onclick={() => (dealKind = 'lease')}>
              임대차
            </button>
          </div>
        </div>

        <div class="field">
          <label class="field-label" for="brk-kind">물건 종류</label>
          <select id="brk-kind" bind:value={propertyKind}>
            {#each PROPERTY_KINDS as kind (kind.id)}
              <option value={kind.id}>{kind.label}</option>
            {/each}
          </select>
          <p class="field-note">{kindHint}</p>
        </div>

        <NumberField
          id="brk-amount"
          label={amountLabel}
          unit="원"
          bind:value={amount}
          min={0}
          max={100_000_000_000}
          hint={`${koreanWon(amount)}원`}
          sliderMin={10_000_000}
          sliderMax={2_000_000_000}
          sliderStep={10_000_000}
          chips={isLease
            ? [
                { label: '1억', value: 100_000_000 },
                { label: '3억', value: 300_000_000 },
                { label: '5억', value: 500_000_000 },
              ]
            : [
                { label: '3억', value: 300_000_000 },
                { label: '6억', value: 600_000_000 },
                { label: '9억', value: 900_000_000 },
                { label: '15억', value: 1_500_000_000 },
              ]}
        />

        {#if isLease}
          <NumberField
            id="brk-rent"
            label="월차임"
            unit="원"
            bind:value={monthlyRent}
            min={0}
            max={100_000_000}
            hint={monthlyRent > 0 ? '월세' : '0이면 전세'}
            sliderMin={0}
            sliderMax={5_000_000}
            sliderStep={50_000}
          />
        {/if}

        <div class="field">
          <span class="field-label">부가가치세</span>
          <div class="seg two" role="group" aria-label="부가가치세 포함 여부">
            <button type="button" aria-pressed={!includeVat} onclick={() => (includeVat = false)}>
              제외
            </button>
            <button type="button" aria-pressed={includeVat} onclick={() => (includeVat = true)}>
              포함 (10%)
            </button>
          </div>
          <p class="field-note">
            일반과세 사업자 기준입니다. 간이과세자는 이보다 낮습니다.
          </p>
        </div>
      </form>
    </div>
  </div>

  <!-- ===== 결과 ===== -->
  <div class="results">
    <div class="card">
      <div class="headline">
        <p class="k">중개보수 상한 · 한쪽 부담</p>
        <p class="v num">{won(result.total)}<small>원</small></p>
        <p class="sub">
          거래금액 {won(result.dealAmount)}원 × {rateText(result.rate)}
          {#if result.capApplied}· 한도액 {won(result.cap ?? 0)}원 적용{/if}
          {#if includeVat}· 부가세 포함{/if}
        </p>
      </div>

      <!-- 이 계산기에서 가장 중요한 문장 -->
      <div class="cap-notice">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9"></circle>
          <path d="M12 8v5M12 16h.01"></path>
        </svg>
        <p>
          <strong>법으로 정해진 상한입니다.</strong> 실제 중개보수는 이 범위 안에서 개업공인중개사와
          협의해 정합니다. 계약 전에 미리 이야기하는 것이 좋습니다.
        </p>
      </div>

      <div class="figs">
        <div class="fig">
          <p class="k">적용 요율</p>
          <p class="v num">{rateText(result.rate)}</p>
        </div>
        <div class="fig">
          <p class="k">중개보수</p>
          <p class="v num">{won(result.fee)}<small>원</small></p>
        </div>
        <div class="fig">
          <p class="k">부가가치세</p>
          <p class="v num">{won(result.vat)}<small>원</small></p>
        </div>
      </div>

      {#if result.converted}
        <div class="conv">
          <p class="conv-head">월세 거래금액 환산</p>
          <p class="conv-body num">
            보증금 {won(amount)}원 + 월차임 {won(monthlyRent)}원 × {result.multiplier}
            = {won(result.dealAmount)}원
          </p>
          {#if result.lowMultiplierApplied}
            <p class="conv-note">
              배수 100으로 계산하면 5천만원에 못 미쳐 배수를 70으로 낮췄습니다. 소액 월세의 부담을
              덜기 위한 규정입니다.
            </p>
          {/if}
        </div>
      {/if}

      <div class="both">
        <p class="both-head">거래 양쪽이 각각 부담합니다</p>
        <p class="both-body">
          {dealKind === 'sale' ? '매도인과 매수인' : '임대인과 임차인'}이 각각
          {won(result.total)}원을 냅니다. 중개사가 이 거래로 받는 금액은
          <strong class="num">{won(result.bothParties)}원</strong>입니다.
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
  </div>
</div>

<!-- ===== 구간표 ===== -->
<section class="block">
  <h2>{dealKind === 'sale' ? '매매·교환' : '임대차'} 요율표</h2>
  <p class="block-sub">
    {#if result.bands}
      {BROKERAGE.region} 기준입니다. 현재 거래금액이 속한 구간을 표시했습니다.
    {:else}
      이 물건 종류는 거래금액과 무관하게 단일 요율을 적용합니다.
    {/if}
  </p>

  {#if result.bands}
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">거래금액</th>
            <th scope="col">상한요율</th>
            <th scope="col">한도액</th>
            <th scope="col">이 구간 최대</th>
          </tr>
        </thead>
        <tbody>
          {#each result.bands as band, i (band.under)}
            {@const from = i === 0 ? 0 : result.bands[i - 1].under}
            {@const isHere = result.dealAmount >= from && result.dealAmount < band.under}
            {@const bandMax =
              band.cap ?? (Number.isFinite(band.under) ? Math.floor(band.under * band.rate) : null)}
            <tr class:here={isHere}>
              <td>
                {#if i === 0}
                  {koreanWon(band.under)}원 미만
                {:else if Number.isFinite(band.under)}
                  {koreanWon(from)}원 ~ {koreanWon(band.under)}원 미만
                {:else}
                  {koreanWon(from)}원 이상
                {/if}
              </td>
              <td class="p-col">{rateText(band.rate)}</td>
              <td>{band.cap ? `${won(band.cap)}원` : '없음'}</td>
              <td class="i-col">
                {#if band.cap}
                  {won(band.cap)}
                {:else if bandMax !== null}
                  {won(bandMax)} 미만
                {:else}
                  제한 없음
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <div class="flat">
      <p class="flat-rate num">{rateText(result.rate)}</p>
      <p class="flat-note">
        {PROPERTY_KINDS.find((k) => k.id === propertyKind)?.label} ·
        {dealKind === 'sale' ? '매매·교환' : '임대차'} 상한요율
      </p>
    </div>
  {/if}

  <p class="region-note">
    주택의 중개보수 요율은 시·도 조례로 정해집니다. 이 표는 {BROKERAGE.region} 기준이며 대부분의
    시·도가 같은 상한을 쓰지만, 거래 지역의 조례를 확인해보시는 것이 정확합니다.
  </p>
</section>

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

  select {
    font-family: var(--f-body);
    font-size: 14px;
    color: var(--ink);
    background: var(--ground);
    border: 1px solid var(--line-strong);
    border-radius: 9px;
    padding: 11px 12px;
    width: 100%;
    cursor: pointer;
  }

  select:focus {
    outline: none;
    border-color: var(--focus);
    box-shadow: 0 0 0 3px var(--accent-soft);
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
    padding: 22px 24px 20px;
  }

  .headline .k {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--ink-3);
    margin: 0 0 4px;
  }

  .headline .v {
    font-size: clamp(34px, 6vw, 46px);
    font-weight: 600;
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: var(--ink);
    margin: 0;
  }

  .headline .v small {
    font-size: 0.45em;
    font-weight: 500;
    color: var(--ink-2);
    margin-left: 4px;
  }

  .headline .sub {
    font-size: 13.5px;
    color: var(--ink-3);
    margin: 7px 0 0;
  }

  /* 이 계산기의 핵심 메시지 — 눈에 띄되 결과를 가리지 않게 */
  .cap-notice {
    display: flex;
    gap: 11px;
    align-items: flex-start;
    margin: 0 24px 20px;
    padding: 13px 15px;
    background: var(--interest-soft);
    border-radius: 10px;
  }

  .cap-notice svg {
    width: 18px;
    height: 18px;
    color: var(--interest);
    flex: none;
    margin-top: 1px;
  }

  .cap-notice p {
    margin: 0;
    font-size: 13px;
    color: var(--ink-2);
    line-height: 1.6;
  }

  .cap-notice strong {
    color: var(--ink);
  }

  .figs {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    border-top: 1px solid var(--line);
  }

  .fig {
    padding: 15px 24px;
    border-right: 1px solid var(--line);
  }

  .fig:last-child {
    border-right: 0;
  }

  .fig .k {
    font-size: 12.5px;
    color: var(--ink-3);
    font-weight: 500;
    margin: 0 0 3px;
  }

  .fig .v {
    font-size: 19px;
    font-weight: 600;
    letter-spacing: -0.01em;
    margin: 0;
  }

  .fig .v small {
    font-size: 0.62em;
    font-weight: 500;
    color: var(--ink-3);
    margin-left: 3px;
  }

  .conv,
  .both {
    padding: 16px 24px;
    border-top: 1px solid var(--line);
  }

  .conv-head,
  .both-head {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin: 0 0 6px;
  }

  .conv-body {
    font-size: 13.5px;
    color: var(--ink);
    margin: 0;
  }

  .conv-note {
    font-size: 12.5px;
    color: var(--ink-3);
    margin: 9px 0 0;
    line-height: 1.6;
  }

  .both-body {
    font-size: 13.5px;
    color: var(--ink-2);
    margin: 0;
    line-height: 1.65;
  }

  .both-body strong {
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

  /* ---- 요율표 ---- */
  .p-col {
    color: var(--principal);
    font-weight: 600;
  }

  .i-col {
    color: var(--ink-2);
  }

  tbody tr.here td {
    background: var(--accent-soft);
  }

  tbody tr.here td:first-child {
    font-weight: 600;
    color: var(--accent-ink);
  }

  .flat {
    border: 1px solid var(--line);
    border-radius: 11px;
    background: var(--surface);
    padding: 26px 22px;
    text-align: center;
  }

  .flat-rate {
    font-size: 34px;
    font-weight: 600;
    color: var(--principal);
    margin: 0;
    letter-spacing: -0.02em;
  }

  .flat-note {
    font-size: 13.5px;
    color: var(--ink-3);
    margin: 6px 0 0;
  }

  .region-note {
    font-size: 12.5px;
    color: var(--ink-3);
    margin: 14px 0 0;
    line-height: 1.6;
    max-width: 65ch;
  }
</style>
