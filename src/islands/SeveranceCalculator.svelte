<script lang="ts">
  /**
   * 퇴직금 계산기 위젯.
   *
   * 대부분의 퇴직금 계산기가 세전 금액만 보여주는데, 실제로 통장에 들어오는 건
   * 퇴직소득세를 뗀 금액이다. 세전·세후를 같이 보여주고 계산 과정을 펼쳐 볼 수 있게 했다.
   */
  import { onMount } from 'svelte';
  import NumberField from './NumberField.svelte';
  import { calculateSeverance } from '../lib/calc/severance';
  import { won, koreanWon, pct } from '../lib/format';

  interface Props {
    /** 빌드 시점 기준 기본값 — SSR과 클라이언트가 같은 값을 그리도록 페이지에서 넘긴다 */
    defaultStartDate: string;
    defaultLastWorkDate: string;
  }

  let { defaultStartDate, defaultLastWorkDate }: Props = $props();

  const STORAGE_KEY = 'semtl:severance';

  let startDate = $state(defaultStartDate);
  let lastWorkDate = $state(defaultLastWorkDate);
  let monthlyBasePay = $state(3_000_000);
  let monthlyAllowance = $state(0);
  let annualBonus = $state(0);
  let annualLeavePay = $state(0);
  let ready = $state(false);
  let copied = $state(false);

  const input = $derived({
    startDate,
    lastWorkDate,
    monthlyBasePay,
    monthlyAllowance,
    annualBonus,
    annualLeavePay,
  });

  const result = $derived(calculateSeverance(input));

  const wageRows = $derived([
    ['기본급 3개월분', result.averageWage.basePayTotal],
    ['고정수당 3개월분', result.averageWage.allowanceTotal],
    ['연간 상여금 × 3/12', result.averageWage.bonusPortion],
    ['연차수당 × 3/12', result.averageWage.leavePayPortion],
  ] as const);

  const taxSteps = $derived([
    ['01', '퇴직소득금액', `${won(result.tax.income)}원`],
    [
      '02',
      `− 근속연수공제 (${result.tax.serviceYears}년)`,
      `${won(result.tax.serviceYearDeduction)}원`,
    ],
    [
      '03',
      `÷ ${result.tax.serviceYears}년 × 12 = 환산급여`,
      `${won(result.tax.converted)}원`,
    ],
    ['04', '− 환산급여공제', `${won(result.tax.convertedDeduction)}원`],
    [
      '05',
      `= 과세표준 (${pct(result.tax.bracket.rate * 100, 0)} 구간)`,
      `${won(result.tax.taxBase)}원`,
    ],
    ['06', '환산산출세액', `${won(result.tax.convertedTax)}원`],
    [
      '07',
      `÷ 12 × ${result.tax.serviceYears}년 = 퇴직소득세`,
      `${won(result.tax.incomeTax)}원`,
    ],
    ['08', '+ 지방소득세 (10%)', `${won(result.tax.localTax)}원`],
  ]);

  const query = $derived(
    `?start=${startDate}&end=${lastWorkDate}&base=${monthlyBasePay}` +
      `&allowance=${monthlyAllowance}&bonus=${annualBonus}&leave=${annualLeavePay}`,
  );
  const shareUrl = $derived(ready ? `${location.origin}${location.pathname}${query}` : '');

  onMount(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('start')) {
      startDate = params.get('start') ?? startDate;
      lastWorkDate = params.get('end') ?? lastWorkDate;
      monthlyBasePay = Number(params.get('base')) || monthlyBasePay;
      monthlyAllowance = Number(params.get('allowance')) || 0;
      annualBonus = Number(params.get('bonus')) || 0;
      annualLeavePay = Number(params.get('leave')) || 0;
    } else {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const p = JSON.parse(saved);
          if (typeof p.startDate === 'string') startDate = p.startDate;
          if (typeof p.lastWorkDate === 'string') lastWorkDate = p.lastWorkDate;
          if (typeof p.monthlyBasePay === 'number') monthlyBasePay = p.monthlyBasePay;
          if (typeof p.monthlyAllowance === 'number') monthlyAllowance = p.monthlyAllowance;
          if (typeof p.annualBonus === 'number') annualBonus = p.annualBonus;
          if (typeof p.annualLeavePay === 'number') annualLeavePay = p.annualLeavePay;
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
          <label class="field-label" for="sev-start">입사일</label>
          <input id="sev-start" type="date" bind:value={startDate} />
        </div>

        <div class="field">
          <label class="field-label" for="sev-end">마지막 근무일</label>
          <input id="sev-end" type="date" bind:value={lastWorkDate} />
          <p class="field-note">
            퇴직일은 그 다음 날로 잡힙니다{#if result.retireDate} — {result.retireDate}{/if}
          </p>
        </div>

        <NumberField
          id="sev-base"
          label="월 기본급"
          unit="원"
          bind:value={monthlyBasePay}
          min={0}
          max={100_000_000}
          hint={`${koreanWon(monthlyBasePay)}원`}
          sliderMin={1_000_000}
          sliderMax={15_000_000}
          sliderStep={100_000}
        />

        <NumberField
          id="sev-allowance"
          label="월 고정수당"
          unit="원"
          bind:value={monthlyAllowance}
          min={0}
          max={50_000_000}
          hint="매달 일정하게 받는 수당"
          sliderMin={0}
          sliderMax={3_000_000}
          sliderStep={50_000}
        />

        <NumberField
          id="sev-bonus"
          label="연간 상여금"
          unit="원"
          bind:value={annualBonus}
          min={0}
          max={500_000_000}
          hint="1년치 총액 · 3/12만 반영"
          sliderMin={0}
          sliderMax={50_000_000}
          sliderStep={1_000_000}
        />

        <NumberField
          id="sev-leave"
          label="연차수당"
          unit="원"
          bind:value={annualLeavePay}
          min={0}
          max={100_000_000}
          hint="전년도 미사용분 · 3/12만 반영"
          sliderMin={0}
          sliderMax={10_000_000}
          sliderStep={100_000}
        />
      </form>
    </div>
  </div>

  <!-- ===== 결과 ===== -->
  <div class="results">
    {#if !result.eligible}
      <div class="card notice">
        <p class="notice-title">{result.reason}</p>
        {#if result.serviceDays > 0}
          <p class="notice-sub">
            현재 재직기간은 {result.serviceLabel} ({won(result.serviceDays)}일)입니다.
            퇴직금은 계속근로기간이 1년 이상일 때 발생합니다.
          </p>
        {:else}
          <p class="notice-sub">날짜를 확인해주세요.</p>
        {/if}
      </div>
    {:else}
      <div class="card">
        <div class="headline">
          <p class="k">세전 퇴직금</p>
          <p class="v num">{won(result.gross)}<small>원</small></p>
          <p class="sub">
            근속 {result.serviceLabel} · {won(result.serviceDays)}일 · 1일 평균임금 {won(
              result.appliedDaily,
            )}원
          </p>
        </div>

        <div class="figs">
          <div class="fig">
            <p class="k"><span class="dot dot--interest"></span>퇴직소득세</p>
            <p class="v num">{won(result.tax.incomeTax)}<small>원</small></p>
          </div>
          <div class="fig">
            <p class="k"><span class="dot dot--interest"></span>지방소득세</p>
            <p class="v num">{won(result.tax.localTax)}<small>원</small></p>
          </div>
          <div class="fig">
            <p class="k">실효세율</p>
            <p class="v num">{pct(result.tax.effectiveRate, 2)}</p>
          </div>
        </div>

        <div class="ratio">
          <div class="ratio-bar">
            <span class="p" style={`width:${100 - result.tax.effectiveRate}%`}></span>
            <span class="i" style={`width:${result.tax.effectiveRate}%`}></span>
          </div>
          <div class="ratio-legend num">
            <span>실수령 {pct(100 - result.tax.effectiveRate, 2)}</span>
            <span>세금 {pct(result.tax.effectiveRate, 2)}</span>
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

      <!-- 실수령액 -->
      <div class="card">
        <div class="card-head"><p class="card-title">실제로 받는 금액</p></div>
        <div class="net-body">
          <p class="net-v num">{won(result.net)}<small>원</small></p>
          <p class="net-sub">
            세전 {won(result.gross)}원 − 세금 {won(result.tax.total)}원
          </p>
          <p class="net-note">
            퇴직소득세는 근속연수가 길수록 크게 낮아집니다. 이 경우 근속 {result.tax
              .serviceYears}년으로 계산되어 실효세율이 {pct(result.tax.effectiveRate, 2)}입니다.
          </p>
        </div>
      </div>
    {/if}
  </div>
</div>

{#if result.eligible}
  <!-- ===== 계산 근거 ===== -->
  <section class="block grid-two">
    <div class="card">
      <div class="card-head"><p class="card-title">평균임금 산정</p></div>
      <div class="detail">
        <p class="period">
          산정기간 {result.averageWage.periodStart} ~ {result.averageWage.periodEnd}
          <span class="days num">{result.averageWage.days}일</span>
        </p>
        <ul class="lines">
          {#each wageRows as [label, amount] (label)}
            <li>
              <span class="l">{label}</span>
              <span class="a num">{won(amount)}</span>
            </li>
          {/each}
        </ul>
        <p class="sum">
          임금총액
          <span class="num">{won(result.averageWage.total)}원</span>
        </p>
        <p class="sum final">
          ÷ {result.averageWage.days}일 = 1일 평균임금
          <span class="num">{won(result.averageWage.daily)}원</span>
        </p>

        <div class="ordinary">
          <p class="ordinary-head">참고 · 통상임금</p>
          <ul class="lines">
            <li>
              <span class="l">시간급</span>
              <span class="a num">{won(result.ordinaryWage.hourly)}원</span>
            </li>
            <li>
              <span class="l">1일 (8시간)</span>
              <span class="a num">{won(result.ordinaryWage.daily)}원</span>
            </li>
          </ul>
          {#if result.ordinaryExceedsAverage}
            <p class="ordinary-note">
              1일 통상임금이 평균임금보다 높습니다. 결근이나 휴업으로 평균임금이 낮아진 경우라면
              통상임금을 기준으로 계산해야 할 수 있으니 확인해보세요.
            </p>
          {/if}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><p class="card-title">퇴직소득세 계산</p></div>
      <div class="detail">
        <ul class="steps">
          {#each taxSteps as [n, desc, value] (n)}
            <li>
              <span class="n num">{n}</span>
              <span class="d">{desc}</span>
              <span class="r num">{value}</span>
            </li>
          {/each}
        </ul>
        <p class="sum final">
          세금 합계
          <span class="num">{won(result.tax.total)}원</span>
        </p>
      </div>
    </div>
  </section>
{/if}

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

  .grid-two {
    display: grid;
    gap: 20px;
    align-items: start;
  }

  @media (min-width: 860px) {
    .grid-two {
      grid-template-columns: 1fr 1fr;
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
  }

  input[type='date'] {
    font-family: var(--f-mono);
    font-size: 15px;
    color: var(--ink);
    background: var(--ground);
    border: 1px solid var(--line-strong);
    border-radius: 9px;
    padding: 11px 12px;
    width: 100%;
  }

  input[type='date']:focus {
    outline: none;
    border-color: var(--focus);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  /* 다크 모드에서 달력 아이콘이 배경에 묻히지 않게 */
  :global(:root[data-theme='dark']) input[type='date']::-webkit-calendar-picker-indicator {
    filter: invert(0.8);
  }

  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme='light'])) input[type='date']::-webkit-calendar-picker-indicator {
      filter: invert(0.8);
    }
  }

  .results {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .notice {
    padding: 24px;
  }

  .notice-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--ink);
    margin: 0 0 8px;
  }

  .notice-sub {
    font-size: 14px;
    color: var(--ink-2);
    margin: 0;
    line-height: 1.6;
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

  /* ---- 실수령액 ---- */
  .net-body {
    padding: 14px 24px 22px;
  }

  .net-v {
    font-size: 30px;
    font-weight: 600;
    letter-spacing: -0.02em;
    margin: 0;
    color: var(--principal);
  }

  .net-v small {
    font-size: 0.45em;
    font-weight: 500;
    color: var(--ink-3);
    margin-left: 5px;
  }

  .net-sub {
    font-size: 13px;
    color: var(--ink-3);
    margin: 5px 0 0;
  }

  .net-note {
    font-size: 12.5px;
    color: var(--ink-3);
    margin: 14px 0 0;
    padding-left: 12px;
    border-left: 2px solid var(--line-strong);
    line-height: 1.6;
  }

  /* ---- 계산 근거 ---- */
  .detail {
    padding: 12px 22px 20px;
  }

  .period {
    font-size: 13px;
    color: var(--ink-2);
    margin: 0 0 12px;
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
  }

  .period .days {
    margin-left: auto;
    font-weight: 600;
    color: var(--ink);
  }

  .lines {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .lines li {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    padding: 7px 0;
    font-size: 13.5px;
    border-bottom: 1px dashed var(--line);
  }

  .lines li:last-child {
    border-bottom: 0;
  }

  .lines .l {
    color: var(--ink-2);
  }

  .lines .a {
    font-weight: 500;
    white-space: nowrap;
  }

  .sum {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    margin: 10px 0 0;
    padding-top: 10px;
    border-top: 1px solid var(--line);
    font-size: 13.5px;
    font-weight: 600;
  }

  .sum.final {
    border-top: 2px solid var(--line-strong);
    font-size: 14.5px;
  }

  .ordinary {
    margin-top: 18px;
    padding-top: 14px;
    border-top: 1px solid var(--line);
  }

  .ordinary-head {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin: 0 0 4px;
  }

  .ordinary-note {
    font-size: 12.5px;
    color: var(--ink-2);
    margin: 12px 0 0;
    padding: 10px 12px;
    background: var(--interest-soft);
    border-radius: 8px;
    line-height: 1.6;
  }

  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .steps li {
    display: grid;
    grid-template-columns: 26px 1fr auto;
    gap: 10px;
    align-items: baseline;
    padding: 9px 0;
    border-bottom: 1px dashed var(--line);
    font-size: 13.5px;
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
    white-space: nowrap;
  }
</style>
