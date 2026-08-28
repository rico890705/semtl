<script lang="ts">
  /**
   * DSR 계산기 위젯.
   *
   * 답하려는 질문은 "주담대 얼마까지 받을 수 있나"다.
   * 그래서 헤드라인은 DSR 비율이 아니라 신규 대출 한도 금액이다.
   *
   * 화면에서 꼭 보여줘야 하는 것이 하나 더 있다 — 스트레스 금리 때문에
   * 한도가 얼마나 깎였는지. 금리 4%로 빌리는데 한도는 5.5%로 계산되니
   * "은행에서 말한 금액이 왜 내 계산과 다르지"의 답이 대부분 여기에 있다.
   */
  import { onMount } from 'svelte';
  import NumberField from './NumberField.svelte';
  import { calculateDsr, type ExistingLoan } from '../lib/calc/dsr';
  import { DSR, LOAN_KINDS, loanKindById, type LoanKind } from '../lib/rates/dsr';
  import { won, koreanWon, pct } from '../lib/format';

  const STORAGE_KEY = 'semtl:dsr';

  let annualIncome = $state(60_000_000);
  let limitRate = $state(40);
  let newRate = $state(4);
  let newYears = $state(30);
  let applyStress = $state(true);
  let loans = $state<ExistingLoan[]>([]);
  let ready = $state(false);
  let copied = $state(false);
  let seq = 0;

  const result = $derived(
    calculateDsr({
      annualIncome,
      limitRate,
      existingLoans: loans,
      newLoan: { annualRate: newRate, years: newYears, applyStress },
    }),
  );

  /** DSR 막대 — 한도를 100%로 두고 기존/신규가 차지하는 몫 */
  const existingShare = $derived(
    result.limitRate > 0 ? Math.min(100, (result.currentDsr / result.limitRate) * 100) : 0,
  );
  const newShare = $derived(
    result.limitRate > 0
      ? Math.max(0, Math.min(100 - existingShare, ((result.projectedDsr - result.currentDsr) / result.limitRate) * 100))
      : 0,
  );

  function addLoan() {
    loans = [
      ...loans,
      {
        id: `l${++seq}`,
        kind: 'credit',
        balance: 30_000_000,
        annualRate: 6,
        termYears: loanKindById('credit').defaultTermYears ?? 5,
      },
    ];
  }

  function removeLoan(id: string) {
    loans = loans.filter((l) => l.id !== id);
  }

  /** 종류를 바꾸면 그 종류의 기본 산정만기로 맞춰준다 */
  function changeKind(id: string, kind: LoanKind) {
    const spec = loanKindById(kind);
    loans = loans.map((l) =>
      l.id === id ? { ...l, kind, termYears: spec.defaultTermYears ?? l.termYears } : l,
    );
  }

  function setField(id: string, field: 'balance' | 'annualRate' | 'termYears', raw: string) {
    const cleaned = raw.replace(/[^0-9.]/g, '');
    const value = Number.parseFloat(cleaned);
    loans = loans.map((l) => (l.id === id ? { ...l, [field]: Number.isFinite(value) ? value : 0 } : l));
  }

  const query = $derived(
    `?income=${annualIncome}&limit=${limitRate}&rate=${newRate}&years=${newYears}` +
      `${applyStress ? '' : '&nostress=1'}` +
      loans.map((l) => `&l=${l.kind}:${l.balance}:${l.annualRate}:${l.termYears}`).join(''),
  );
  const shareUrl = $derived(ready ? `${location.origin}${location.pathname}${query}` : '');

  onMount(() => {
    const p = new URLSearchParams(location.search);
    if (p.has('income')) {
      annualIncome = Number(p.get('income')) || annualIncome;
      limitRate = Number(p.get('limit')) || limitRate;
      newRate = Number(p.get('rate')) || newRate;
      newYears = Number(p.get('years')) || newYears;
      applyStress = p.get('nostress') !== '1';
      loans = p.getAll('l').map((raw) => {
        const [kind, balance, rate, term] = raw.split(':');
        return {
          id: `l${++seq}`,
          kind: (LOAN_KINDS.some((k) => k.id === kind) ? kind : 'credit') as LoanKind,
          balance: Number(balance) || 0,
          annualRate: Number(rate) || 0,
          termYears: Number(term) || 5,
        };
      });
    } else {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const s = JSON.parse(saved);
          if (typeof s.annualIncome === 'number') annualIncome = s.annualIncome;
          if (typeof s.limitRate === 'number') limitRate = s.limitRate;
          if (typeof s.newRate === 'number') newRate = s.newRate;
          if (typeof s.newYears === 'number') newYears = s.newYears;
          if (typeof s.applyStress === 'boolean') applyStress = s.applyStress;
          if (Array.isArray(s.loans)) {
            loans = s.loans
              .filter((l: ExistingLoan) => LOAN_KINDS.some((k) => k.id === l.kind))
              .map((l: ExistingLoan) => ({ ...l, id: `l${++seq}` }));
          }
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
        JSON.stringify({ annualIncome, limitRate, newRate, newYears, applyStress, loans }),
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
</script>

<div class="split">
  <!-- ===== 입력 ===== -->
  <div class="inputs">
    <div class="card">
      <div class="card-head"><p class="card-title">조건 입력</p></div>

      <form class="form" autocomplete="off" onsubmit={(e) => e.preventDefault()}>
        <NumberField
          id="dsr-income"
          label="연소득"
          unit="원"
          bind:value={annualIncome}
          min={0}
          max={10_000_000_000}
          hint={`${koreanWon(annualIncome)}원 · 세전`}
          sliderMin={20_000_000}
          sliderMax={300_000_000}
          sliderStep={1_000_000}
          chips={[
            { label: '4천만', value: 40_000_000 },
            { label: '6천만', value: 60_000_000 },
            { label: '1억', value: 100_000_000 },
          ]}
        />

        <div class="field">
          <span class="field-label">업권</span>
          <div class="seg two" role="group" aria-label="업권">
            {#each DSR.limits as limit (limit.id)}
              <button
                type="button"
                aria-pressed={limitRate === limit.rate}
                onclick={() => (limitRate = limit.rate)}
              >
                {limit.label} {limit.rate}%
              </button>
            {/each}
          </div>
          <p class="field-note">
            {DSR.limits.find((l) => l.rate === limitRate)?.hint}
          </p>
        </div>

        <NumberField
          id="dsr-rate"
          label="신규 대출 금리"
          unit="%"
          bind:value={newRate}
          min={0}
          max={20}
          decimals={2}
          hint={applyStress ? `한도 산정 ${result.stressedRate}%` : '스트레스 금리 미적용'}
          sliderMin={2}
          sliderMax={10}
          sliderStep={0.05}
        />

        <NumberField
          id="dsr-years"
          label="신규 대출 기간"
          unit="년"
          bind:value={newYears}
          min={1}
          max={50}
          hint={`${newYears * 12}회 상환`}
          sliderMin={5}
          sliderMax={40}
          chips={[
            { label: '20년', value: 20 },
            { label: '30년', value: 30 },
            { label: '40년', value: 40 },
          ]}
        />

        <div class="field">
          <span class="field-label">스트레스 금리</span>
          <div class="seg two" role="group" aria-label="스트레스 금리 적용 여부">
            <button type="button" aria-pressed={applyStress} onclick={() => (applyStress = true)}>
              적용 ({DSR.stress.rate}%)
            </button>
            <button type="button" aria-pressed={!applyStress} onclick={() => (applyStress = false)}>
              미적용
            </button>
          </div>
          <p class="field-note">
            {DSR.stress.since} {DSR.stress.phase} 시행. 실제 금리에 더해 한도를 계산합니다.
          </p>
        </div>
      </form>
    </div>

    <!-- 기존 대출 목록 -->
    <div class="card">
      <div class="card-head loans-head">
        <p class="card-title">기존 대출</p>
        <button type="button" class="add" onclick={addLoan}>+ 추가</button>
      </div>

      <div class="loans">
        {#if loans.length === 0}
          <p class="empty">기존 대출이 없으면 비워두세요.</p>
        {:else}
          {#each loans as l (l.id)}
            <div class="loan-row">
              <div class="loan-top">
                <select
                  aria-label="대출 종류"
                  value={l.kind}
                  onchange={(e) => changeKind(l.id, e.currentTarget.value as LoanKind)}
                >
                  {#each LOAN_KINDS as kind (kind.id)}
                    <option value={kind.id}>{kind.label}</option>
                  {/each}
                </select>
                <button
                  type="button"
                  class="remove"
                  aria-label="이 대출 삭제"
                  onclick={() => removeLoan(l.id)}>✕</button
                >
              </div>

              <div class="loan-fields">
                <label>
                  <span>{l.kind === 'negative' ? '약정 한도' : '잔액'}</span>
                  <input
                    type="text"
                    inputmode="numeric"
                    value={won(l.balance)}
                    oninput={(e) => setField(l.id, 'balance', e.currentTarget.value)}
                  />
                </label>
                <label>
                  <span>금리 %</span>
                  <input
                    type="text"
                    inputmode="decimal"
                    value={String(l.annualRate)}
                    oninput={(e) => setField(l.id, 'annualRate', e.currentTarget.value)}
                  />
                </label>
                <label>
                  <span>{loanKindById(l.kind).method === 'split' ? '산정만기' : '만기'} 년</span>
                  <input
                    type="text"
                    inputmode="numeric"
                    value={String(l.termYears)}
                    oninput={(e) => setField(l.id, 'termYears', e.currentTarget.value)}
                  />
                </label>
              </div>

              <p class="loan-hint">{loanKindById(l.kind).hint}</p>
            </div>
          {/each}
        {/if}
      </div>
    </div>
  </div>

  <!-- ===== 결과 ===== -->
  <div class="results">
    <div class="card">
      <div class="headline">
        <p class="k">신규 대출 가능 한도</p>
        <p class="v num">{won(result.newLoanLimit)}<small>원</small></p>
        <p class="sub">
          {#if result.overLimit}
            이미 DSR 한도를 넘어 추가 대출이 어렵습니다
          {:else}
            연 {won(result.availableAnnualPayment)}원까지 상환 여력 · 금리
            {applyStress ? `${result.stressedRate}%` : `${newRate}%`} · {newYears}년 기준
          {/if}
        </p>
      </div>

      {#if applyStress && result.stressReduction > 0}
        <div class="stress">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M12 3 2 20h20L12 3z"></path>
            <path d="M12 10v4M12 17h.01"></path>
          </svg>
          <div>
            <p class="stress-title">
              스트레스 금리로 한도가 {won(result.stressReduction)}원 줄었습니다
            </p>
            <p class="stress-body">
              금리 {newRate}%로 빌리지만 한도는 <strong>{result.stressedRate}%</strong>로 계산합니다.
              스트레스 금리가 없다면 {won(result.limitWithoutStress)}원까지 가능했을 금액입니다.
              실제로 내는 이자는 원래 금리 기준이라 <strong>한도만 깎이고 상환액은 그대로</strong>입니다.
            </p>
          </div>
        </div>
      {/if}

      <div class="figs">
        <div class="fig">
          <p class="k">현재 DSR</p>
          <p class="v num" class:over={result.overLimit}>{pct(result.currentDsr, 1)}</p>
        </div>
        <div class="fig">
          <p class="k">대출 후 DSR</p>
          <p class="v num">{pct(result.projectedDsr, 1)}</p>
        </div>
        <div class="fig">
          <p class="k">실제 월 상환액</p>
          <p class="v num">{won(result.actualMonthlyPayment)}<small>원</small></p>
        </div>
      </div>

      <div class="gauge">
        <div class="gauge-bar">
          <span class="existing" style={`width:${existingShare}%`}></span>
          <span class="new" style={`width:${newShare}%`}></span>
        </div>
        <div class="gauge-legend">
          <span><span class="dot dot--interest"></span>기존 {pct(result.currentDsr, 1)}</span>
          <span><span class="dot dot--principal"></span>신규 {pct(result.projectedDsr - result.currentDsr, 1)}</span>
          <span class="limit num">한도 {limitRate}%</span>
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

    {#if result.burdens.length > 0}
      <div class="card">
        <div class="card-head"><p class="card-title">기존 대출 부담</p></div>
        <div class="burden">
          <ul class="lines">
            {#each result.burdens as b (b.loan.id)}
              <li class:excluded={b.excluded}>
                <span class="l">{b.label}</span>
                <span class="note">{b.note}</span>
                <span class="a num">{b.excluded ? '제외' : `${won(b.annualPayment)}원`}</span>
              </li>
            {/each}
          </ul>
          <p class="total">
            연간 원리금 합계
            <span class="num">{won(result.existingAnnualPayment)}원</span>
          </p>
        </div>
      </div>
    {/if}
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
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
  }

  .inputs {
    display: flex;
    flex-direction: column;
    gap: 20px;
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

  /* ---- 기존 대출 목록 ---- */
  .loans-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 14px;
  }

  .add {
    font-family: var(--f-body);
    font-size: 12.5px;
    font-weight: 600;
    padding: 5px 11px;
    border-radius: 7px;
    border: 1px solid var(--accent);
    background: var(--accent-soft);
    color: var(--accent-ink);
    cursor: pointer;
  }

  .loans {
    padding: 0 20px 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .empty {
    font-size: 13px;
    color: var(--ink-3);
    margin: 0;
    padding: 10px 0;
  }

  .loan-row {
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 12px 13px;
    background: var(--ground);
  }

  .loan-top {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 10px;
  }

  .loan-top select {
    flex: 1;
    font-family: var(--f-body);
    font-size: 13.5px;
    font-weight: 600;
    color: var(--ink);
    background: var(--surface);
    border: 1px solid var(--line-strong);
    border-radius: 7px;
    padding: 7px 9px;
    cursor: pointer;
  }

  .remove {
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink-3);
    border-radius: 7px;
    width: 30px;
    height: 30px;
    cursor: pointer;
    flex: none;
    font-size: 12px;
  }

  .remove:hover {
    color: var(--interest);
    border-color: var(--interest);
  }

  .loan-fields {
    display: grid;
    grid-template-columns: 1.5fr 1fr 1fr;
    gap: 7px;
  }

  .loan-fields label {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .loan-fields span {
    font-size: 11px;
    color: var(--ink-3);
  }

  .loan-fields input {
    width: 100%;
    min-width: 0;
    font-family: var(--f-mono);
    font-variant-numeric: tabular-nums;
    font-size: 13px;
    color: var(--ink);
    background: var(--surface);
    border: 1px solid var(--line-strong);
    border-radius: 6px;
    padding: 6px 8px;
    text-align: right;
  }

  .loan-fields input:focus {
    outline: none;
    border-color: var(--focus);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }

  .loan-hint {
    font-size: 11.5px;
    color: var(--ink-3);
    margin: 8px 0 0;
    line-height: 1.5;
  }

  /* ---- 결과 ---- */
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
    font-size: clamp(32px, 5.6vw, 44px);
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

  .stress {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    margin: 0 24px 18px;
    padding: 14px 16px;
    background: var(--interest-soft);
    border-radius: 10px;
  }

  .stress svg {
    width: 19px;
    height: 19px;
    color: var(--interest);
    flex: none;
    margin-top: 2px;
  }

  .stress-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
    margin: 0 0 5px;
  }

  .stress-body {
    font-size: 13px;
    color: var(--ink-2);
    margin: 0;
    line-height: 1.65;
  }

  .stress-body strong {
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

  .fig .v.over {
    color: var(--interest);
  }

  .fig .v small {
    font-size: 0.62em;
    font-weight: 500;
    color: var(--ink-3);
    margin-left: 3px;
  }

  /* ---- DSR 게이지 ---- */
  .gauge {
    padding: 18px 24px 22px;
    border-top: 1px solid var(--line);
  }

  .gauge-bar {
    display: flex;
    height: 14px;
    border-radius: 4px;
    overflow: hidden;
    background: var(--surface-2);
    margin-bottom: 9px;
  }

  .gauge-bar span {
    display: block;
    transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .gauge-bar .existing {
    background: var(--interest);
  }

  .gauge-bar .new {
    background: var(--principal);
  }

  .gauge-legend {
    display: flex;
    gap: 14px;
    font-size: 12.5px;
    color: var(--ink-2);
    flex-wrap: wrap;
    align-items: center;
  }

  .gauge-legend span {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .gauge-legend .limit {
    margin-left: auto;
    color: var(--ink-3);
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

  /* ---- 기존 대출 부담 ---- */
  .burden {
    padding: 8px 24px 20px;
  }

  .lines {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .lines li {
    display: grid;
    grid-template-columns: 110px 1fr auto;
    gap: 10px;
    align-items: baseline;
    padding: 8px 0;
    font-size: 13.5px;
    border-bottom: 1px dashed var(--line);
  }

  .lines li:last-child {
    border-bottom: 0;
  }

  .lines li.excluded {
    opacity: 0.6;
  }

  .lines .l {
    color: var(--ink-2);
  }

  .lines .note {
    font-size: 12px;
    color: var(--ink-3);
  }

  .lines .a {
    font-weight: 500;
    white-space: nowrap;
  }

  .total {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin: 12px 0 0;
    padding-top: 12px;
    border-top: 2px solid var(--line-strong);
    font-size: 14px;
    font-weight: 600;
  }

  @media (max-width: 560px) {
    .lines li {
      grid-template-columns: 1fr auto;
    }

    .lines .note {
      display: none;
    }
  }
</style>
