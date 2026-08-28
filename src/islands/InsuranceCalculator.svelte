<script lang="ts">
  /**
   * 4대보험 계산기 위젯.
   *
   * 실수령액 계산기와 달리 사업주 부담까지 보여준다.
   * "직원 한 명 쓰면 회사가 총 얼마 쓰나"를 알고 싶어 오는 사람이 절반이다.
   */
  import { onMount } from 'svelte';
  import NumberField from './NumberField.svelte';
  import { calculateInsurance, ratePct } from '../lib/calc/insurance';
  import { ratesFor } from '../lib/rates';
  import { won, koreanWon, pct } from '../lib/format';

  const rates = ratesFor();
  const STORAGE_KEY = 'semtl:insurance';

  let basis = $state<'monthly' | 'annual'>('monthly');
  let payInput = $state(3_500_000);
  let monthlyNonTaxable = $state(200_000);
  let companySize = $state(rates.employment.stabilityTiers[0].id);
  let industrialPercent = $state(rates.industrial.averageRate * 100);
  let ready = $state(false);
  let copied = $state(false);

  const monthlyGross = $derived(basis === 'annual' ? Math.round(payInput / 12) : payInput);

  const result = $derived(
    calculateInsurance({
      monthlyGross,
      monthlyNonTaxable,
      companySize,
      industrialRate: industrialPercent / 100,
    }),
  );

  const employeeShare = $derived(
    result.grandTotal > 0 ? (result.employeeTotal / result.grandTotal) * 100 : 50,
  );
  const costRatio = $derived(monthlyGross > 0 ? (result.employerCost / monthlyGross) * 100 : 100);

  const query = $derived(
    `?basis=${basis}&pay=${payInput}&nontax=${monthlyNonTaxable}` +
      `&size=${companySize}&industrial=${industrialPercent}`,
  );
  const shareUrl = $derived(ready ? `${location.origin}${location.pathname}${query}` : '');

  onMount(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('pay')) {
      basis = params.get('basis') === 'annual' ? 'annual' : 'monthly';
      payInput = Number(params.get('pay')) || payInput;
      monthlyNonTaxable = Number(params.get('nontax')) || 0;
      const size = params.get('size');
      if (size && rates.employment.stabilityTiers.some((t) => t.id === size)) companySize = size;
      industrialPercent = Number(params.get('industrial')) || industrialPercent;
    } else {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const p = JSON.parse(saved);
          if (p.basis === 'monthly' || p.basis === 'annual') basis = p.basis;
          if (typeof p.payInput === 'number') payInput = p.payInput;
          if (typeof p.monthlyNonTaxable === 'number') monthlyNonTaxable = p.monthlyNonTaxable;
          if (rates.employment.stabilityTiers.some((t) => t.id === p.companySize))
            companySize = p.companySize;
          if (typeof p.industrialPercent === 'number') industrialPercent = p.industrialPercent;
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
        JSON.stringify({ basis, payInput, monthlyNonTaxable, companySize, industrialPercent }),
      );
    } catch {
      /* 저장 불가여도 계산에는 영향이 없다 */
    }
  });

  function switchBasis(next: 'monthly' | 'annual') {
    if (next === basis) return;
    // 기준을 바꿔도 같은 급여를 가리키도록 값을 환산해준다
    payInput = next === 'annual' ? payInput * 12 : Math.round(payInput / 12);
    basis = next;
  }

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
          <span class="field-label">급여 기준</span>
          <div class="seg two" role="group" aria-label="급여 기준">
            <button
              type="button"
              aria-pressed={basis === 'monthly'}
              onclick={() => switchBasis('monthly')}>월급</button
            >
            <button
              type="button"
              aria-pressed={basis === 'annual'}
              onclick={() => switchBasis('annual')}>연봉</button
            >
          </div>
        </div>

        <NumberField
          id="ins-pay"
          label={basis === 'annual' ? '연봉' : '월 급여'}
          unit="원"
          bind:value={payInput}
          min={0}
          max={10_000_000_000}
          hint={basis === 'annual'
            ? `월 ${won(monthlyGross)}원`
            : `${koreanWon(payInput)}원`}
          sliderMin={basis === 'annual' ? 20_000_000 : 2_000_000}
          sliderMax={basis === 'annual' ? 200_000_000 : 15_000_000}
          sliderStep={basis === 'annual' ? 1_000_000 : 100_000}
        />

        <NumberField
          id="ins-nontax"
          label="월 비과세액"
          unit="원"
          bind:value={monthlyNonTaxable}
          min={0}
          max={2_000_000}
          hint="보험료 산정에서 제외"
          sliderMin={0}
          sliderMax={500_000}
          sliderStep={10_000}
          chips={[
            { label: '없음', value: 0 },
            { label: '식대 20만', value: 200_000 },
          ]}
        />

        <div class="field">
          <label class="field-label" for="ins-size">기업 규모</label>
          <select id="ins-size" bind:value={companySize}>
            {#each rates.employment.stabilityTiers as tier (tier.id)}
              <option value={tier.id}>{tier.label}</option>
            {/each}
          </select>
          <p class="field-note">
            고용안정·직업능력개발사업 요율을 정합니다. 근로자 부담에는 영향이 없습니다.
          </p>
        </div>

        <NumberField
          id="ins-industrial"
          label="산재보험 업종 요율"
          unit="%"
          bind:value={industrialPercent}
          min={0}
          max={30}
          decimals={2}
          hint="사업주 전액 부담"
          sliderMin={0}
          sliderMax={10}
          sliderStep={0.01}
        />
        <p class="field-note tight">
          업종별로 크게 다릅니다. 기본값 {ratePct(rates.industrial.averageRate)}는 전 업종 평균이며,
          정확한 요율은 근로복지공단 고시를 확인하세요.
        </p>
      </form>
    </div>
  </div>

  <!-- ===== 결과 ===== -->
  <div class="results">
    <div class="card">
      <div class="headline">
        <p class="k">근로자 부담 (월)</p>
        <p class="v num">{won(result.employeeTotal)}<small>원</small></p>
        <p class="sub">
          과세대상 급여 {won(result.monthlyTaxable)}원 기준
          {#if result.pensionCapped}· 국민연금 상한 적용{/if}
          {#if result.pensionFloored}· 국민연금 하한 적용{/if}
        </p>
      </div>

      <div class="figs">
        <div class="fig">
          <p class="k"><span class="dot dot--interest"></span>사업주 부담</p>
          <p class="v num">{won(result.employerTotal)}<small>원</small></p>
        </div>
        <div class="fig">
          <p class="k">총 보험료</p>
          <p class="v num">{won(result.grandTotal)}<small>원</small></p>
        </div>
        <div class="fig">
          <p class="k">연 총 보험료</p>
          <p class="v num">{koreanWon(result.grandTotal * 12)}<small>원</small></p>
        </div>
      </div>

      <div class="ratio">
        <div class="ratio-bar">
          <span class="p" style={`width:${employeeShare}%`}></span>
          <span class="i" style={`width:${100 - employeeShare}%`}></span>
        </div>
        <div class="ratio-legend num">
          <span>근로자 {pct(employeeShare)}</span>
          <span>사업주 {pct(100 - employeeShare)}</span>
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

    <!-- 실질 인건비 -->
    <div class="card cost">
      <div class="card-head"><p class="card-title">회사가 실제로 쓰는 돈</p></div>
      <div class="cost-body">
        <p class="cost-v num">{won(result.employerCost)}<small>원 / 월</small></p>
        <p class="cost-sub">
          월급 {won(monthlyGross)}원 + 사업주 부담 {won(result.employerTotal)}원
        </p>
        <div class="cost-bar">
          <span class="base" style={`width:${(100 / costRatio) * 100}%`}>월급</span>
          <span class="extra">+{pct(costRatio - 100)}</span>
        </div>
        <p class="cost-note">
          연간으로는 {koreanWon(result.employerCost * 12)}원입니다. 퇴직급여 적립분은 별도입니다.
        </p>
      </div>
    </div>
  </div>
</div>

<!-- ===== 항목별 부담 매트릭스 ===== -->
<section class="block">
  <h2>항목별 부담 내역</h2>
  <p class="block-sub">누가 얼마를 내는지 항목별로 나눠 보여줍니다.</p>

  <div class="table-scroll">
    <table>
      <thead>
        <tr>
          <th scope="col">항목</th>
          <th scope="col">근로자</th>
          <th scope="col">사업주</th>
          <th scope="col">합계</th>
          <th scope="col" class="note-col">요율</th>
        </tr>
      </thead>
      <tbody>
        {#each result.lines as line (line.key)}
          <tr>
            <td>{line.label}</td>
            <td class="p-col">{line.employee > 0 ? won(line.employee) : '−'}</td>
            <td class="i-col">{won(line.employer)}</td>
            <td>{won(line.total)}</td>
            <td class="note-col">{line.note}</td>
          </tr>
        {/each}
      </tbody>
      <tfoot>
        <tr>
          <td>합계</td>
          <td class="p-col">{won(result.employeeTotal)}</td>
          <td class="i-col">{won(result.employerTotal)}</td>
          <td>{won(result.grandTotal)}</td>
          <td class="note-col"></td>
        </tr>
      </tfoot>
    </table>
  </div>
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

  .field-note.tight {
    margin-top: -14px;
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

  /* ---- 실질 인건비 ---- */
  .cost-body {
    padding: 14px 24px 22px;
  }

  .cost-v {
    font-family: var(--f-mono);
    font-variant-numeric: tabular-nums;
    font-size: 30px;
    font-weight: 600;
    letter-spacing: -0.02em;
    margin: 0;
    color: var(--ink);
  }

  .cost-v small {
    font-size: 0.45em;
    font-weight: 500;
    color: var(--ink-3);
    margin-left: 5px;
  }

  .cost-sub {
    font-size: 13px;
    color: var(--ink-3);
    margin: 5px 0 14px;
  }

  .cost-bar {
    display: flex;
    align-items: stretch;
    height: 30px;
    border-radius: 6px;
    overflow: hidden;
    background: var(--interest);
    font-size: 12px;
    font-weight: 600;
  }

  .cost-bar .base {
    background: var(--principal);
    color: var(--surface);
    display: grid;
    place-items: center;
    min-width: 60px;
  }

  .cost-bar .extra {
    flex: 1;
    color: var(--surface);
    display: grid;
    place-items: center;
    font-family: var(--f-mono);
    min-width: 52px;
  }

  .cost-note {
    font-size: 12.5px;
    color: var(--ink-3);
    margin: 12px 0 0;
  }

  /* ---- 매트릭스 표 ---- */
  .p-col {
    color: var(--principal);
    font-weight: 500;
  }

  .i-col {
    color: var(--interest);
    font-weight: 500;
  }

  .note-col {
    text-align: left;
    font-family: var(--f-body);
    font-size: 12px;
    color: var(--ink-3);
    white-space: normal;
    min-width: 190px;
  }

  tfoot td {
    border-top: 2px solid var(--line-strong);
    font-weight: 700;
    background: var(--surface-2);
  }

  @media (max-width: 720px) {
    .note-col {
      display: none;
    }
  }
</style>
