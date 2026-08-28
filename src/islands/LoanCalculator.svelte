<script lang="ts">
  /**
   * 대출 계산기 위젯 — 이 페이지에서 유일하게 JS가 나가는 부분.
   *
   * 계산 자체는 src/lib/calc/loan.ts 의 순수 함수가 담당한다.
   * 여기서는 입력 상태, URL 동기화, localStorage 기억만 다룬다.
   */
  import { onMount } from 'svelte';
  import NumberField from './NumberField.svelte';
  import {
    buildSchedule,
    yearlyBreakdown,
    REPAYMENT_METHODS,
    type RepaymentMethod,
  } from '../lib/calc/loan';
  import { won, koreanWon, pct, months as fmtMonths } from '../lib/format';

  interface Props {
    initialPrincipal?: number;
    initialRate?: number;
    initialYears?: number;
    initialMethod?: RepaymentMethod;
  }

  let {
    initialPrincipal = 300_000_000,
    initialRate = 3.9,
    initialYears = 30,
    initialMethod = 'equal-payment',
  }: Props = $props();

  const STORAGE_KEY = 'semtl:loan';

  let principal = $state(initialPrincipal);
  let annualRate = $state(initialRate);
  let years = $state(initialYears);
  let graceMonths = $state(0);
  let method = $state<RepaymentMethod>(initialMethod);

  let showAllRows = $state(false);
  let copied = $state(false);
  let ready = $state(false);

  const result = $derived(buildSchedule({ principal, annualRate, years, method, graceMonths }));
  const yearly = $derived(yearlyBreakdown(result.schedule));
  const maxYear = $derived(Math.max(1, ...yearly.map((y) => y.total)));
  const visibleRows = $derived(showAllRows ? result.schedule : result.schedule.slice(0, 12));
  const methodLabel = $derived(REPAYMENT_METHODS.find((m) => m.value === method)!.label);

  const query = $derived(
    `?amount=${principal}&rate=${annualRate}&years=${years}&method=${method}` +
      (graceMonths ? `&grace=${graceMonths}` : ''),
  );

  const shareUrl = $derived(ready ? `${location.origin}${location.pathname}${query}` : '');

  // 헤드라인은 상환 방식에 따라 뜻이 달라진다
  const headline = $derived.by(() => {
    const first = result.schedule.find((r) => !r.grace) ?? result.schedule[0];
    if (!first) return { label: '월 상환액', value: 0, sub: '' };

    if (method === 'bullet') {
      return {
        label: '월 이자',
        value: first.payment,
        sub: `만기에 원금 ${koreanWon(principal)}원을 한 번에 상환합니다`,
      };
    }
    if (method === 'equal-principal') {
      return {
        label: graceMonths ? '거치 후 첫 달 상환액' : '첫 달 상환액',
        value: first.payment,
        sub: `매달 조금씩 줄어 마지막 달에는 ${won(result.lastPayment)}원`,
      };
    }
    return {
      label: graceMonths ? '거치 후 월 상환액' : '월 상환액',
      value: first.payment,
      sub: graceMonths
        ? `거치기간 ${fmtMonths(graceMonths)} 동안은 이자만 ${won(result.schedule[0].payment)}원`
        : `${years}년 동안 매달 같은 금액을 냅니다`,
    };
  });

  const steps = $derived([
    ['01', `월 이자율 = 연 ${annualRate}% ÷ 12`, `${(result.monthlyRate * 100).toFixed(4)}%`],
    ['02', `총 상환 회차 = ${years}년 × 12`, `${result.months}회`],
    ['03', '첫 달 이자 = 원금 × 월 이자율', `${won(result.schedule[0]?.interest ?? 0)}원`],
    [
      '04',
      '첫 달 원금 = 상환액 − 이자',
      `${won(result.schedule[0]?.principal ?? 0)}원`,
    ],
    ['05', `${methodLabel} 기준 총 이자`, `${won(result.totalInterest)}원`],
  ]);

  const chartNote = $derived.by(() => {
    if (method === 'bullet') return '만기까지 이자만 냅니다. 마지막 해에 원금이 한 번에 잡힙니다.';
    const first = yearly[0];
    const last = yearly[yearly.length - 1];
    if (!first || !last || !first.total || !last.total) return '';
    const a = Math.round((first.interest / first.total) * 100);
    const b = Math.round((last.interest / last.total) * 100);
    return `1년차 상환액의 ${a}%가 이자입니다. ${yearly.length}년차에는 ${b}%로 줄어듭니다.`;
  });

  onMount(() => {
    // 공유 링크로 들어온 경우가 저장값보다 우선한다
    const params = new URLSearchParams(location.search);
    if (params.has('amount')) {
      principal = Number(params.get('amount')) || principal;
      annualRate = Number(params.get('rate')) || annualRate;
      years = Number(params.get('years')) || years;
      graceMonths = Number(params.get('grace')) || 0;
      const m = params.get('method') as RepaymentMethod | null;
      if (m && REPAYMENT_METHODS.some((r) => r.value === m)) method = m;
    } else {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (typeof parsed.principal === 'number') principal = parsed.principal;
          if (typeof parsed.annualRate === 'number') annualRate = parsed.annualRate;
          if (typeof parsed.years === 'number') years = parsed.years;
          if (typeof parsed.graceMonths === 'number') graceMonths = parsed.graceMonths;
          if (REPAYMENT_METHODS.some((r) => r.value === parsed.method)) method = parsed.method;
        }
      } catch {
        /* 저장값이 깨졌거나 접근 불가 — 기본값으로 시작한다 */
      }
    }
    ready = true;
  });

  // 마지막 입력을 기억해 재방문 시 다시 채워준다 (서버로는 나가지 않는다)
  $effect(() => {
    if (!ready) return;
    const snapshot = JSON.stringify({ principal, annualRate, years, graceMonths, method });
    try {
      localStorage.setItem(STORAGE_KEY, snapshot);
    } catch {
      /* 저장 불가여도 계산에는 영향이 없다 */
    }
  });

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      /* 권한이 없으면 아래 입력창을 직접 선택해 복사할 수 있다 */
    }
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  function downloadCsv() {
    const header = '회차,상환액,원금,이자,남은원금\n';
    const body = result.schedule
      .map((r) => [r.n, r.payment, r.principal, r.interest, r.balance].join(','))
      .join('\n');
    // 엑셀이 UTF-8로 열도록 BOM을 붙인다
    const blob = new Blob(['﻿' + header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `대출상환표_${koreanWon(principal)}원_${years}년.csv`;
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
        <NumberField
          id="loan-amount"
          label="대출금액"
          unit="원"
          bind:value={principal}
          min={1_000_000}
          max={2_000_000_000}
          hint={`${koreanWon(principal)}원`}
          sliderMin={10_000_000}
          sliderMax={1_000_000_000}
          sliderStep={5_000_000}
          chips={[
            { label: '1억', value: 100_000_000 },
            { label: '2억', value: 200_000_000 },
            { label: '3억', value: 300_000_000 },
            { label: '5억', value: 500_000_000 },
          ]}
        />

        <NumberField
          id="loan-rate"
          label="연 이자율"
          unit="%"
          bind:value={annualRate}
          min={0}
          max={30}
          decimals={2}
          hint="고정금리 기준"
          sliderMin={0.5}
          sliderMax={12}
          sliderStep={0.05}
        />

        <NumberField
          id="loan-years"
          label="대출기간"
          unit="년"
          bind:value={years}
          min={1}
          max={50}
          hint={`${result.months}회 상환`}
          sliderMin={1}
          sliderMax={40}
          chips={[
            { label: '10년', value: 10 },
            { label: '20년', value: 20 },
            { label: '30년', value: 30 },
            { label: '40년', value: 40 },
          ]}
        />

        <NumberField
          id="loan-grace"
          label="거치기간"
          unit="개월"
          bind:value={graceMonths}
          min={0}
          max={years * 12 - 1}
          hint={graceMonths ? '이 기간은 이자만 납부' : '없음'}
          sliderMin={0}
          sliderMax={60}
        />

        <div class="field">
          <span class="field-label">상환 방식</span>
          <div class="seg" role="group" aria-label="상환 방식">
            {#each REPAYMENT_METHODS as m (m.value)}
              <button
                type="button"
                aria-pressed={method === m.value}
                onclick={() => (method = m.value)}
              >
                {m.label}
              </button>
            {/each}
          </div>
          <p class="seg-blurb">{REPAYMENT_METHODS.find((m) => m.value === method)!.blurb}</p>
        </div>
      </form>
    </div>
  </div>

  <!-- ===== 결과 ===== -->
  <div class="results">
    <div class="card">
      <div class="headline">
        <p class="k">{headline.label}</p>
        <p class="v num">{won(headline.value)}<small>원</small></p>
        <p class="sub">{headline.sub}</p>
      </div>

      <div class="figs">
        <div class="fig">
          <p class="k"><span class="dot dot--principal"></span>총 원금</p>
          <p class="v num">{koreanWon(result.totalPrincipal)}<small>원</small></p>
        </div>
        <div class="fig">
          <p class="k"><span class="dot dot--interest"></span>총 이자</p>
          <p class="v num">{koreanWon(result.totalInterest)}<small>원</small></p>
        </div>
        <div class="fig">
          <p class="k">총 상환액</p>
          <p class="v num">{koreanWon(result.totalPayment)}<small>원</small></p>
        </div>
      </div>

      <div class="ratio">
        <div class="ratio-bar">
          <span class="p" style={`width:${100 - result.interestShare}%`}></span>
          <span class="i" style={`width:${result.interestShare}%`}></span>
        </div>
        <div class="ratio-legend num">
          <span>원금 {pct(100 - result.interestShare)}</span>
          <span>이자 {pct(result.interestShare)}</span>
        </div>
      </div>

      <details class="why">
        <summary>계산 근거 보기</summary>
        <div class="why-body">
          <ul class="steps">
            {#each steps as [n, desc, value] (n)}
              <li>
                <span class="n num">{n}</span>
                <span class="d">{desc}</span>
                <span class="r num">{value}</span>
              </li>
            {/each}
          </ul>
        </div>
      </details>

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
        <p class="share-note">계산 결과가 주소에 담깁니다. 북마크하면 저장이고, 보내면 공유입니다.</p>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><p class="card-title">연도별 상환 구성</p></div>
      <div class="chart-body">
        <div class="chart">
          {#each yearly as y (y.year)}
            <div
              class="ybar"
              style={`height:${(y.total / maxYear) * 100}%`}
              title={`${y.year}년차 · 원금 ${won(y.principal)}원 / 이자 ${won(y.interest)}원`}
            >
              <i class="i-seg" style={`height:${y.total ? (y.interest / y.total) * 100 : 0}%`}></i>
              <i class="p-seg" style={`height:${y.total ? (y.principal / y.total) * 100 : 0}%`}></i>
            </div>
          {/each}
        </div>
        <div class="chart-x num">
          {#each yearly as y (y.year)}
            <span>{y.year === 1 || y.year % (yearly.length > 20 ? 5 : 2) === 0 ? y.year : ''}</span>
          {/each}
        </div>
        <p class="chart-note">{chartNote}</p>
      </div>
    </div>
  </div>
</div>

<!-- ===== 상환 스케줄 ===== -->
<section class="block">
  <div class="sched-head">
    <div>
      <h2>상환 스케줄</h2>
      <p class="block-sub">회차별 원금과 이자가 어떻게 나뉘는지 확인하세요.</p>
    </div>
    <button type="button" class="btn btn--ghost" onclick={downloadCsv}>CSV 내려받기</button>
  </div>

  <div class="table-scroll">
    <table>
      <thead>
        <tr>
          <th scope="col">회차</th>
          <th scope="col">상환액</th>
          <th scope="col">원금</th>
          <th scope="col">이자</th>
          <th scope="col">남은 원금</th>
        </tr>
      </thead>
      <tbody>
        {#each visibleRows as row (row.n)}
          <tr>
            <td>{row.n}회{#if row.grace}<span class="grace">거치</span>{/if}</td>
            <td>{won(row.payment)}</td>
            <td class="p-col">{won(row.principal)}</td>
            <td class="i-col">{won(row.interest)}</td>
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

  .seg {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
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

  .seg-blurb {
    font-size: 12.5px;
    color: var(--ink-3);
    margin: 0;
    line-height: 1.5;
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
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
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

  .ratio {
    padding: 18px 24px 22px;
    border-top: 1px solid var(--line);
  }

  .ratio-bar {
    display: flex;
    height: 13px;
    border-radius: 4px;
    overflow: hidden;
    background: var(--surface-2);
    margin-bottom: 9px;
  }

  .ratio-bar span {
    display: block;
    transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .ratio-bar .p {
    background: var(--principal);
  }

  .ratio-bar .i {
    background: var(--interest);
  }

  .ratio-legend {
    display: flex;
    justify-content: space-between;
    font-size: 12.5px;
    color: var(--ink-2);
  }

  .why {
    border-top: 1px solid var(--line);
  }

  .why summary {
    padding: 15px 24px;
    cursor: pointer;
    list-style: none;
    font-size: 14px;
    font-weight: 600;
    color: var(--accent-ink);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .why summary::-webkit-details-marker {
    display: none;
  }

  .why summary::after {
    content: '▾';
    margin-left: auto;
    color: var(--ink-3);
    font-size: 12px;
    transition: transform 0.18s;
  }

  .why[open] summary::after {
    transform: rotate(180deg);
  }

  .why-body {
    padding: 0 24px 22px;
  }

  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .steps li {
    display: grid;
    grid-template-columns: 26px 1fr auto;
    gap: 12px;
    align-items: baseline;
    padding: 10px 0;
    border-bottom: 1px dashed var(--line);
    font-size: 14px;
  }

  .steps li:last-child {
    border-bottom: 0;
  }

  .steps .n {
    font-size: 11.5px;
    color: var(--ink-3);
    border: 1px solid var(--line);
    border-radius: 5px;
    text-align: center;
    padding: 1px 0;
  }

  .steps .d {
    color: var(--ink-2);
  }

  .steps .r {
    font-weight: 600;
    font-size: 14px;
    white-space: nowrap;
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

  .share-note {
    font-size: 12.5px;
    color: var(--ink-3);
    margin: 9px 0 0;
  }

  .chart-body {
    padding: 18px 24px 20px;
  }

  .chart {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 132px;
    padding-bottom: 2px;
    border-bottom: 1px solid var(--line-strong);
  }

  .ybar {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    border-radius: 3px 3px 0 0;
    overflow: hidden;
    transition: opacity 0.13s;
  }

  .ybar:hover {
    opacity: 0.78;
  }

  .ybar i {
    display: block;
  }

  .i-seg {
    background: var(--interest);
  }

  .p-seg {
    background: var(--principal);
  }

  .chart-x {
    display: flex;
    gap: 3px;
    margin-top: 7px;
    font-size: 11px;
    color: var(--ink-3);
  }

  .chart-x span {
    flex: 1;
    min-width: 0;
    text-align: center;
    overflow: hidden;
  }

  .chart-note {
    font-size: 12.5px;
    color: var(--ink-3);
    margin: 11px 0 0;
  }

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

  .grace {
    font-size: 10.5px;
    margin-left: 6px;
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--surface-2);
    color: var(--ink-3);
  }

  .table-more {
    margin-top: 12px;
    text-align: center;
  }
</style>
