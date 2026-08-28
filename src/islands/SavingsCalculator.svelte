<script lang="ts">
  /**
   * 예적금 이자 계산기 위젯.
   *
   * 화면의 중심은 만기 수령액이 아니라 "표면금리 vs 실질 수익률" 비교다.
   * 연 3% 적금에 1,200만원을 넣고 이자가 36만원일 거라 기대했다가
   * 19만 5천원을 받고 당황하는 일이 흔한데, 그 이유를 숫자로 보여주는 것이
   * 이 계산기가 다른 계산기보다 나을 수 있는 지점이다.
   */
  import { onMount } from 'svelte';
  import NumberField from './NumberField.svelte';
  import {
    calculateSavings,
    compareInterestKinds,
    type ProductKind,
    type InterestKind,
  } from '../lib/calc/savings';
  import { SAVINGS, taxOptionById } from '../lib/rates/savings';
  import { won, koreanWon, pct, months as fmtMonths } from '../lib/format';

  const STORAGE_KEY = 'semtl:savings';

  let product = $state<ProductKind>('installment');
  let interestKind = $state<InterestKind>('simple');
  let amount = $state(1_000_000);
  let periodMonths = $state(12);
  let annualRate = $state(3);
  let taxId = $state('normal');
  let showAllRows = $state(false);
  let ready = $state(false);
  let copied = $state(false);

  const taxOption = $derived(taxOptionById(taxId));
  const isInstallment = $derived(product === 'installment');

  const input = $derived({
    product,
    interestKind,
    amount,
    months: periodMonths,
    annualRate,
    taxRate: taxOption.rate,
  });

  const result = $derived(calculateSavings(input));
  const comparison = $derived(
    compareInterestKinds({
      product,
      amount,
      months: periodMonths,
      annualRate,
      taxRate: taxOption.rate,
    }),
  );

  const visibleRows = $derived(showAllRows ? result.schedule : result.schedule.slice(0, 12));

  /** 표면금리 대비 실질 수익률 비율 (%) */
  const yieldRatio = $derived(
    result.nominalRate > 0 ? (result.annualizedGrossYield / result.nominalRate) * 100 : 100,
  );

  const query = $derived(
    `?product=${product}&kind=${interestKind}&amount=${amount}` +
      `&months=${periodMonths}&rate=${annualRate}&tax=${taxId}`,
  );
  const shareUrl = $derived(ready ? `${location.origin}${location.pathname}${query}` : '');

  onMount(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('amount')) {
      const p = params.get('product');
      if (p === 'deposit' || p === 'installment') product = p;
      const k = params.get('kind');
      if (k === 'simple' || k === 'compound') interestKind = k;
      amount = Number(params.get('amount')) || amount;
      periodMonths = Number(params.get('months')) || periodMonths;
      annualRate = Number(params.get('rate')) || annualRate;
      const t = params.get('tax');
      if (SAVINGS.taxOptions.some((o) => o.id === t)) taxId = t!;
    } else {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const s = JSON.parse(saved);
          if (s.product === 'deposit' || s.product === 'installment') product = s.product;
          if (s.interestKind === 'simple' || s.interestKind === 'compound')
            interestKind = s.interestKind;
          if (typeof s.amount === 'number') amount = s.amount;
          if (typeof s.periodMonths === 'number') periodMonths = s.periodMonths;
          if (typeof s.annualRate === 'number') annualRate = s.annualRate;
          if (SAVINGS.taxOptions.some((o) => o.id === s.taxId)) taxId = s.taxId;
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
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ product, interestKind, amount, periodMonths, annualRate, taxId }),
      );
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

  function downloadCsv() {
    const header = '회차,납입액,누적원금,이번달이자,누적이자,잔액\n';
    const body = result.schedule
      .map((r) =>
        [
          r.month,
          Math.round(r.payment),
          Math.round(r.cumulativePrincipal),
          Math.round(r.monthInterest),
          Math.round(r.cumulativeInterest),
          Math.round(r.balance),
        ].join(','),
      )
      .join('\n');
    const blob = new Blob(['﻿' + header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${isInstallment ? '적금' : '예금'}_이자내역_${periodMonths}개월.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="split">
  <!-- ===== 입력 ===== -->
  <div class="inputs">
    <div class="card">
      <div class="card-head"><p class="card-title">조건 입력</p></div>

      <form class="form" autocomplete="off" onsubmit={(e) => e.preventDefault()}>
        <div class="field">
          <span class="field-label">상품</span>
          <div class="seg two" role="group" aria-label="상품 종류">
            <button
              type="button"
              aria-pressed={isInstallment}
              onclick={() => (product = 'installment')}>적금</button
            >
            <button type="button" aria-pressed={!isInstallment} onclick={() => (product = 'deposit')}
              >예금</button
            >
          </div>
          <p class="field-note">
            {isInstallment ? '매달 일정액을 납입합니다.' : '목돈을 한 번에 예치합니다.'}
          </p>
        </div>

        <NumberField
          id="sav-amount"
          label={isInstallment ? '월 납입액' : '예치금액'}
          unit="원"
          bind:value={amount}
          min={0}
          max={10_000_000_000}
          hint={`${koreanWon(amount)}원`}
          sliderMin={isInstallment ? 100_000 : 1_000_000}
          sliderMax={isInstallment ? 5_000_000 : 200_000_000}
          sliderStep={isInstallment ? 100_000 : 1_000_000}
          chips={isInstallment
            ? [
                { label: '30만', value: 300_000 },
                { label: '50만', value: 500_000 },
                { label: '100만', value: 1_000_000 },
              ]
            : [
                { label: '1천만', value: 10_000_000 },
                { label: '3천만', value: 30_000_000 },
                { label: '1억', value: 100_000_000 },
              ]}
        />

        <NumberField
          id="sav-months"
          label="기간"
          unit="개월"
          bind:value={periodMonths}
          min={1}
          max={600}
          hint={fmtMonths(periodMonths)}
          sliderMin={1}
          sliderMax={60}
          chips={[
            { label: '6개월', value: 6 },
            { label: '1년', value: 12 },
            { label: '2년', value: 24 },
            { label: '3년', value: 36 },
          ]}
        />

        <NumberField
          id="sav-rate"
          label="연 이자율"
          unit="%"
          bind:value={annualRate}
          min={0}
          max={30}
          decimals={2}
          hint="상품에 적힌 금리"
          sliderMin={0}
          sliderMax={10}
          sliderStep={0.05}
        />

        <div class="field">
          <span class="field-label">이자 계산</span>
          <div class="seg two" role="group" aria-label="이자 계산 방식">
            <button
              type="button"
              aria-pressed={interestKind === 'simple'}
              onclick={() => (interestKind = 'simple')}>단리</button
            >
            <button
              type="button"
              aria-pressed={interestKind === 'compound'}
              onclick={() => (interestKind = 'compound')}>월복리</button
            >
          </div>
          <p class="field-note">대부분의 은행 예적금은 단리입니다.</p>
        </div>

        <div class="field">
          <label class="field-label" for="sav-tax">이자소득 과세</label>
          <select id="sav-tax" bind:value={taxId}>
            {#each SAVINGS.taxOptions as option (option.id)}
              <option value={option.id}>{option.label} ({pct(option.rate * 100, 1)})</option>
            {/each}
          </select>
          <p class="field-note">{taxOption.hint}</p>
        </div>
      </form>
    </div>
  </div>

  <!-- ===== 결과 ===== -->
  <div class="results">
    <div class="card">
      <div class="headline">
        <p class="k">세후 만기 수령액</p>
        <p class="v num">{won(result.maturity)}<small>원</small></p>
        <p class="sub">
          원금 {won(result.principal)}원 + 세후 이자 {won(result.netInterest)}원
        </p>
      </div>

      <div class="figs">
        <div class="fig">
          <p class="k"><span class="dot dot--principal"></span>원금</p>
          <p class="v num">{koreanWon(result.principal)}<small>원</small></p>
        </div>
        <div class="fig">
          <p class="k">세전 이자</p>
          <p class="v num">{won(result.grossInterest)}<small>원</small></p>
        </div>
        <div class="fig">
          <p class="k"><span class="dot dot--interest"></span>이자소득세</p>
          <p class="v num">{won(result.tax)}<small>원</small></p>
        </div>
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

    <!-- 이 계산기의 핵심 화면 -->
    <div class="card">
      <div class="card-head"><p class="card-title">표면금리 vs 실질 수익률</p></div>
      <div class="yield">
        <div class="yield-row">
          <span class="yield-label">상품에 적힌 금리</span>
          <div class="yield-bar">
            <span class="fill nominal" style="width:100%"></span>
          </div>
          <span class="yield-value num">{pct(result.nominalRate, 2)}</span>
        </div>
        <div class="yield-row">
          <span class="yield-label">원금 대비 실질 (연환산)</span>
          <div class="yield-bar">
            <span class="fill actual" style={`width:${Math.min(100, yieldRatio)}%`}></span>
          </div>
          <span class="yield-value num">{pct(result.annualizedGrossYield, 2)}</span>
        </div>

        {#if isInstallment}
          <p class="yield-note">
            적금은 첫 회차만 {fmtMonths(periodMonths)} 전부 예치되고 마지막 회차는 한 달만
            예치됩니다. 평균 예치기간이 <strong>{result.averageHeldMonths}개월</strong>이라 원금 대비
            수익률이 표면금리의 <strong>{Math.round(yieldRatio)}%</strong> 수준이 됩니다. 상품이
            잘못된 것이 아니라 적금의 구조가 원래 그렇습니다.
          </p>
        {:else}
          <p class="yield-note">
            예금은 목돈이 전 기간 예치되므로 원금 대비 수익률이 표면금리와 같습니다.
            {#if interestKind === 'compound'}
              월복리라 이자에도 이자가 붙어 표면금리보다 조금 높습니다.
            {/if}
          </p>
        {/if}
      </div>

      <div class="compare">
        <p class="compare-head">단리와 월복리 차이</p>
        <div class="compare-body">
          <span>단리 {won(comparison.simple.maturity)}원</span>
          <span class="arrow" aria-hidden="true">→</span>
          <span>월복리 {won(comparison.compound.maturity)}원</span>
          <strong class="num">+{won(comparison.difference)}원</strong>
        </div>
        <p class="compare-note">
          {#if comparison.difference < result.principal * 0.001}
            기간이 짧아 복리 효과가 크지 않습니다. 금리 0.1%p 차이가 더 큽니다.
          {:else}
            기간이 길어질수록 복리 효과가 커집니다.
          {/if}
        </p>
      </div>
    </div>
  </div>
</div>

<!-- ===== 월별 내역 ===== -->
<section class="block">
  <div class="sched-head">
    <div>
      <h2>월별 내역</h2>
      <p class="block-sub">원금과 이자가 어떻게 쌓이는지 확인하세요.</p>
    </div>
    <button type="button" class="btn btn--ghost" onclick={downloadCsv}>CSV 내려받기</button>
  </div>

  <div class="table-scroll">
    <table>
      <thead>
        <tr>
          <th scope="col">회차</th>
          <th scope="col">납입액</th>
          <th scope="col">누적 원금</th>
          <th scope="col">이번 달 이자</th>
          <th scope="col">누적 이자</th>
          <th scope="col">잔액</th>
        </tr>
      </thead>
      <tbody>
        {#each visibleRows as row (row.month)}
          <tr>
            <td>{row.month}개월</td>
            <td>{row.payment > 0 ? won(row.payment) : '−'}</td>
            <td class="p-col">{won(row.cumulativePrincipal)}</td>
            <td class="i-col">{won(row.monthInterest)}</td>
            <td class="i-col">{won(row.cumulativeInterest)}</td>
            <td>{won(row.balance)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if result.schedule.length > 12}
    <div class="table-more">
      <button type="button" class="btn btn--ghost" onclick={() => (showAllRows = !showAllRows)}>
        {showAllRows ? '12회차까지만 보기' : `전체 ${result.schedule.length}회차 보기`}
      </button>
    </div>
  {/if}

  <p class="table-note">
    표의 이자는 세전 기준입니다. 이자소득세는 만기에 이자 총액에서 한 번에 원천징수됩니다.
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
    padding: 22px 24px 24px;
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
    display: flex;
    align-items: center;
    gap: 6px;
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

  /* ---- 표면금리 vs 실질 수익률 ---- */
  .yield {
    padding: 16px 24px 20px;
  }

  .yield-row {
    display: grid;
    grid-template-columns: 130px 1fr 62px;
    gap: 12px;
    align-items: center;
    margin-bottom: 10px;
  }

  .yield-label {
    font-size: 12.5px;
    color: var(--ink-2);
  }

  .yield-bar {
    height: 14px;
    border-radius: 4px;
    background: var(--surface-2);
    overflow: hidden;
  }

  .fill {
    display: block;
    height: 100%;
    transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .fill.nominal {
    background: var(--line-strong);
  }

  .fill.actual {
    background: var(--principal);
  }

  .yield-value {
    font-size: 13.5px;
    font-weight: 600;
    text-align: right;
    color: var(--ink);
  }

  .yield-note {
    font-size: 12.5px;
    color: var(--ink-2);
    margin: 14px 0 0;
    padding: 11px 13px;
    background: var(--surface-2);
    border-radius: 8px;
    line-height: 1.65;
  }

  .yield-note strong {
    color: var(--ink);
    font-weight: 600;
  }

  @media (max-width: 560px) {
    .yield-row {
      grid-template-columns: 96px 1fr 58px;
      gap: 8px;
    }

    .yield-label {
      font-size: 11.5px;
    }
  }

  .compare {
    padding: 16px 24px 20px;
    border-top: 1px solid var(--line);
  }

  .compare-head {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin: 0 0 8px;
  }

  .compare-body {
    display: flex;
    align-items: baseline;
    gap: 9px;
    flex-wrap: wrap;
    font-size: 13.5px;
    color: var(--ink-2);
    font-family: var(--f-mono);
    font-variant-numeric: tabular-nums;
  }

  .compare-body .arrow {
    color: var(--ink-3);
  }

  .compare-body strong {
    color: var(--principal);
    font-weight: 600;
    margin-left: auto;
  }

  .compare-note {
    font-size: 12.5px;
    color: var(--ink-3);
    margin: 8px 0 0;
  }

  /* ---- 표 ---- */
  .sched-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .sched-head .block-sub {
    margin-bottom: 0;
  }

  .p-col {
    color: var(--principal);
    font-weight: 500;
  }

  .i-col {
    color: var(--interest);
    font-weight: 500;
  }

  .table-more {
    margin-top: 12px;
    text-align: center;
  }

  .table-note {
    font-size: 12.5px;
    color: var(--ink-3);
    margin: 12px 0 0;
  }
</style>
