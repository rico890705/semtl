<script lang="ts">
  /**
   * 중도상환수수료 계산기 위젯.
   *
   * 사람들이 정말 알고 싶은 건 수수료 액수가 아니라 판단이다.
   *   "지금 갚을까, 조금 더 기다릴까?"
   *   "수수료를 내고서라도 갚는 게 이득인가?"
   *
   * 그래서 두 가지를 함께 낸다.
   *   시간표   — 6개월 간격으로 언제 갚으면 얼마인지
   *   회수 기간 — 아끼는 이자로 수수료를 몇 개월이면 만회하는지
   */
  import { onMount } from 'svelte';
  import NumberField from './NumberField.svelte';
  import { calculatePrepaymentFee, feeTimeline } from '../lib/calc/prepayment';
  import { PREPAYMENT, defaultFeeRate, type LoanType, type RateType } from '../lib/rates/prepayment';
  import { won, koreanWon, pct } from '../lib/format';

  interface Props {
    defaultStartDate: string;
    defaultRepayDate: string;
  }

  let { defaultStartDate, defaultRepayDate }: Props = $props();

  const STORAGE_KEY = 'semtl:prepayment';

  let loanType = $state<LoanType>('mortgage');
  let rateType = $state<RateType>('variable');
  let feeRate = $state(defaultFeeRate('mortgage', 'variable'));
  let originalPrincipal = $state(300_000_000);
  let repayAmount = $state(50_000_000);
  let startDate = $state(defaultStartDate);
  let repayDate = $state(defaultRepayDate);
  let loanYears = $state(30);
  let annualRate = $state(4);
  let useFreeAllowance = $state(true);
  let ready = $state(false);
  let copied = $state(false);

  const input = $derived({
    loanType,
    originalPrincipal,
    repayAmount,
    feeRate,
    startDate,
    repayDate,
    loanYears,
    annualRate,
    useFreeAllowance,
  });

  const result = $derived(calculatePrepaymentFee(input));
  const timeline = $derived(result.valid ? feeTimeline(input) : []);
  const maxFee = $derived(Math.max(1, ...timeline.map((t) => t.fee)));

  const isMortgage = $derived(loanType === 'mortgage');
  /** 아끼는 이자가 수수료보다 훨씬 크면 갚는 쪽이 유리하다 */
  const worthIt = $derived(result.fee > 0 && result.breakEvenMonths < 12);

  /** 종류나 금리 유형을 바꾸면 기본 요율로 맞춘다 */
  function pickLoanType(next: LoanType) {
    loanType = next;
    feeRate = defaultFeeRate(next, rateType);
  }
  function pickRateType(next: RateType) {
    rateType = next;
    feeRate = defaultFeeRate(loanType, next);
  }

  const query = $derived(
    `?type=${loanType}&rate=${rateType}&fee=${feeRate}&principal=${originalPrincipal}` +
      `&repay=${repayAmount}&start=${startDate}&on=${repayDate}&years=${loanYears}` +
      `&loanrate=${annualRate}${useFreeAllowance ? '' : '&nofree=1'}`,
  );
  const shareUrl = $derived(ready ? `${location.origin}${location.pathname}${query}` : '');

  onMount(() => {
    const p = new URLSearchParams(location.search);
    if (p.has('principal')) {
      const t = p.get('type');
      if (t === 'mortgage' || t === 'credit') loanType = t;
      const rt = p.get('rate');
      if (rt === 'variable' || rt === 'fixed') rateType = rt;
      feeRate = Number(p.get('fee')) || feeRate;
      originalPrincipal = Number(p.get('principal')) || originalPrincipal;
      repayAmount = Number(p.get('repay')) || repayAmount;
      startDate = p.get('start') ?? startDate;
      repayDate = p.get('on') ?? repayDate;
      loanYears = Number(p.get('years')) || loanYears;
      annualRate = Number(p.get('loanrate')) || annualRate;
      useFreeAllowance = p.get('nofree') !== '1';
    } else {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const s = JSON.parse(saved);
          if (s.loanType === 'mortgage' || s.loanType === 'credit') loanType = s.loanType;
          if (s.rateType === 'variable' || s.rateType === 'fixed') rateType = s.rateType;
          if (typeof s.feeRate === 'number') feeRate = s.feeRate;
          if (typeof s.originalPrincipal === 'number') originalPrincipal = s.originalPrincipal;
          if (typeof s.repayAmount === 'number') repayAmount = s.repayAmount;
          if (typeof s.startDate === 'string') startDate = s.startDate;
          if (typeof s.repayDate === 'string') repayDate = s.repayDate;
          if (typeof s.loanYears === 'number') loanYears = s.loanYears;
          if (typeof s.annualRate === 'number') annualRate = s.annualRate;
          if (typeof s.useFreeAllowance === 'boolean') useFreeAllowance = s.useFreeAllowance;
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
          <span class="field-label">대출 종류</span>
          <div class="seg two" role="group" aria-label="대출 종류">
            <button type="button" aria-pressed={isMortgage} onclick={() => pickLoanType('mortgage')}>
              주택담보대출
            </button>
            <button type="button" aria-pressed={!isMortgage} onclick={() => pickLoanType('credit')}>
              신용대출
            </button>
          </div>
        </div>

        <div class="field">
          <span class="field-label">금리 유형</span>
          <div class="seg two" role="group" aria-label="금리 유형">
            <button
              type="button"
              aria-pressed={rateType === 'variable'}
              onclick={() => pickRateType('variable')}>변동</button
            >
            <button
              type="button"
              aria-pressed={rateType === 'fixed'}
              onclick={() => pickRateType('fixed')}>고정·혼합</button
            >
          </div>
        </div>

        <NumberField
          id="pp-feerate"
          label="중도상환수수료율"
          unit="%"
          bind:value={feeRate}
          min={0}
          max={5}
          decimals={2}
          hint="약정서 기준으로 고치세요"
          sliderMin={0}
          sliderMax={2}
          sliderStep={0.01}
        />
        <p class="field-note tight">
          {PREPAYMENT.loanTypeLabels[loanType]} · {PREPAYMENT.rateTypeLabels[rateType]} 기본값
          {defaultFeeRate(loanType, rateType)}%. 금융사마다 다릅니다.
        </p>

        <NumberField
          id="pp-principal"
          label="최초 대출금액"
          unit="원"
          bind:value={originalPrincipal}
          min={0}
          max={10_000_000_000}
          hint={`${koreanWon(originalPrincipal)}원`}
          sliderMin={10_000_000}
          sliderMax={1_000_000_000}
          sliderStep={10_000_000}
        />

        <NumberField
          id="pp-repay"
          label="중도상환 금액"
          unit="원"
          bind:value={repayAmount}
          min={0}
          max={10_000_000_000}
          hint={`${koreanWon(repayAmount)}원`}
          sliderMin={0}
          sliderMax={Math.max(10_000_000, originalPrincipal)}
          sliderStep={5_000_000}
        />

        <div class="field">
          <label class="field-label" for="pp-start">대출 실행일</label>
          <input id="pp-start" type="date" bind:value={startDate} />
        </div>

        <div class="field">
          <label class="field-label" for="pp-on">상환 예정일</label>
          <input id="pp-on" type="date" bind:value={repayDate} />
          {#if result.valid}
            <p class="field-note">
              수수료 부과는 {result.feeEndDate}까지입니다
            </p>
          {/if}
        </div>

        <NumberField
          id="pp-years"
          label="대출 기간"
          unit="년"
          bind:value={loanYears}
          min={1}
          max={50}
          hint={loanYears > PREPAYMENT.feePeriodYears ? '3년까지만 수수료 부과' : '만기까지 부과'}
          sliderMin={1}
          sliderMax={40}
        />

        <NumberField
          id="pp-loanrate"
          label="대출금리"
          unit="%"
          bind:value={annualRate}
          min={0}
          max={20}
          decimals={2}
          hint="회수 기간 판단용"
          sliderMin={1}
          sliderMax={12}
          sliderStep={0.05}
        />

        {#if isMortgage}
          <div class="field">
            <span class="field-label">매년 10% 면제</span>
            <div class="seg two" role="group" aria-label="10% 면제 적용 여부">
              <button
                type="button"
                aria-pressed={useFreeAllowance}
                onclick={() => (useFreeAllowance = true)}>적용</button
              >
              <button
                type="button"
                aria-pressed={!useFreeAllowance}
                onclick={() => (useFreeAllowance = false)}>미적용</button
              >
            </div>
            <p class="field-note">
              부동산담보대출은 해마다 최초 대출금액의 10%까지 수수료가 없습니다. 올해 이미 썼다면
              미적용으로 두세요.
            </p>
          </div>
        {/if}
      </form>
    </div>
  </div>

  <!-- ===== 결과 ===== -->
  <div class="results">
    {#if !result.valid}
      <div class="card notice">
        <p class="notice-title">{result.reason}</p>
      </div>
    {:else}
      <div class="card">
        <div class="headline" class:free={result.fee === 0}>
          <p class="k">중도상환수수료</p>
          <p class="v num">{won(result.fee)}<small>원</small></p>
          <p class="sub">
            {#if result.feeExempt}
              수수료 부과 기간이 지나 면제됩니다
            {:else}
              잔존 {won(result.remainingDays)}일 / {won(result.feePeriodDays)}일 ·
              요율의 {pct(result.remainingRatio, 1)} 적용
            {/if}
          </p>
        </div>

        {#if result.fee > 0}
          <div class="verdict" class:good={worthIt}>
            <p class="verdict-title">
              {#if worthIt}
                이자 {result.breakEvenMonths.toFixed(1)}개월치면 수수료를 만회합니다
              {:else}
                수수료를 만회하려면 이자 {result.breakEvenMonths.toFixed(1)}개월치가 필요합니다
              {/if}
            </p>
            <p class="verdict-body">
              {won(repayAmount)}원을 갚으면 연 {won(result.annualInterestSaved)}원의 이자를
              아낍니다. 수수료 {won(result.fee)}원은 그중
              <strong>{result.breakEvenMonths.toFixed(1)}개월치</strong>에 해당합니다.
              {#if worthIt}
                남은 기간이 그보다 길다면 갚는 편이 이득입니다.
              {/if}
            </p>
          </div>
        {/if}

        <div class="figs">
          <div class="fig">
            <p class="k">경과 일수</p>
            <p class="v num">{won(result.elapsedDays)}<small>일</small></p>
          </div>
          <div class="fig">
            <p class="k">수수료 대상금액</p>
            <p class="v num">{koreanWon(result.chargeableAmount)}<small>원</small></p>
          </div>
          <div class="fig">
            <p class="k">실효 수수료율</p>
            <p class="v num">{pct(result.effectiveRate, 3)}</p>
          </div>
        </div>

        {#if result.freeAllowance > 0}
          <div class="free">
            <p class="free-head">매년 10% 면제로 빠진 금액</p>
            <p class="free-body">
              <strong class="num">{won(result.freeAllowance)}원</strong>이 수수료 대상에서
              제외됐습니다. 최초 대출금액 {koreanWon(originalPrincipal)}원의 10%까지는 해마다
              수수료 없이 갚을 수 있습니다.
            </p>
          </div>
        {/if}

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
    {/if}
  </div>
</div>

<!-- ===== 시간표 ===== -->
{#if result.valid && timeline.length > 0}
  <section class="block">
    <h2>언제 갚으면 얼마인가</h2>
    <p class="block-sub">
      대출 실행일부터 6개월 간격입니다. 같은 금액을 갚아도 시점에 따라 수수료가 달라집니다.
    </p>

    <div class="timeline">
      {#each timeline as row (row.months)}
        <div class="tl-row" class:current={row.current}>
          <span class="tl-when">
            {row.months === 0 ? '실행 직후' : `${row.months}개월 후`}
            <span class="tl-date num">{row.date}</span>
          </span>
          <span class="tl-bar">
            <span class="tl-fill" style={`width:${(row.fee / maxFee) * 100}%`}></span>
          </span>
          <span class="tl-fee num">{row.fee === 0 ? '없음' : `${won(row.fee)}원`}</span>
        </div>
      {/each}
    </div>

    <p class="table-note">
      {PREPAYMENT.feePeriodYears}년이 지나면 수수료가 사라집니다. 만기가 얼마 안 남았다면
      기다렸다 갚는 것도 방법이지만, 그 사이 내는 이자와 견줘보세요.
    </p>
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

  :global(:root[data-theme='dark']) input[type='date']::-webkit-calendar-picker-indicator {
    filter: invert(0.8);
  }

  @media (prefers-color-scheme: dark) {
    :global(:root:not([data-theme='light'])) input[type='date']::-webkit-calendar-picker-indicator {
      filter: invert(0.8);
    }
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

  .notice {
    padding: 24px;
  }

  .notice-title {
    font-size: 15.5px;
    font-weight: 600;
    color: var(--ink);
    margin: 0;
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
    color: var(--interest);
    margin: 0;
  }

  .headline.free .v {
    color: var(--principal);
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

  /* ---- 판단 ---- */
  .verdict {
    margin: 0 24px 18px;
    padding: 14px 16px;
    background: var(--surface-2);
    border-radius: 10px;
  }

  .verdict.good {
    background: var(--accent-soft);
  }

  .verdict-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
    margin: 0 0 5px;
  }

  .verdict.good .verdict-title {
    color: var(--accent-ink);
  }

  .verdict-body {
    font-size: 13px;
    color: var(--ink-2);
    margin: 0;
    line-height: 1.65;
  }

  .verdict-body strong {
    color: var(--ink);
    font-weight: 600;
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

  .free {
    padding: 16px 24px;
    border-top: 1px solid var(--line);
  }

  .free-head {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin: 0 0 6px;
  }

  .free-body {
    font-size: 13px;
    color: var(--ink-2);
    margin: 0;
    line-height: 1.65;
  }

  .free-body strong {
    color: var(--principal);
    font-weight: 700;
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

  /* ---- 시간표 ---- */
  .timeline {
    border: 1px solid var(--line);
    border-radius: 11px;
    background: var(--surface);
    overflow: hidden;
  }

  .tl-row {
    display: grid;
    grid-template-columns: 150px 1fr 110px;
    gap: 14px;
    align-items: center;
    padding: 11px 16px;
    border-bottom: 1px solid var(--line);
    font-size: 13.5px;
  }

  .tl-row:last-child {
    border-bottom: 0;
  }

  .tl-row.current {
    background: var(--accent-soft);
  }

  .tl-when {
    color: var(--ink-2);
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .tl-row.current .tl-when {
    color: var(--accent-ink);
    font-weight: 600;
  }

  .tl-date {
    font-size: 11px;
    color: var(--ink-3);
  }

  .tl-bar {
    height: 10px;
    background: var(--surface-2);
    border-radius: 3px;
    overflow: hidden;
  }

  .tl-fill {
    display: block;
    height: 100%;
    background: var(--interest);
    transition: width 0.3s;
  }

  .tl-row.current .tl-fill {
    background: var(--accent);
  }

  .tl-fee {
    text-align: right;
    font-weight: 600;
    color: var(--ink);
  }

  @media (max-width: 620px) {
    .tl-row {
      grid-template-columns: 1fr auto;
      gap: 8px;
    }

    .tl-bar {
      display: none;
    }
  }

  .table-note {
    font-size: 12.5px;
    color: var(--ink-3);
    margin: 13px 0 0;
    line-height: 1.65;
    max-width: 65ch;
  }
</style>
