<script lang="ts">
  /**
   * 연봉 실수령액 계산기 위젯.
   *
   * 계산은 src/lib/calc/salary.ts 의 순수 함수가 맡는다.
   * 여기서는 입력 상태, URL 동기화, localStorage 기억만 다룬다.
   */
  import { onMount } from 'svelte';
  import NumberField from './NumberField.svelte';
  import { calculateSalary, salaryTable, type DeductionKey } from '../lib/calc/salary';
  import { won, koreanWon, pct } from '../lib/format';

  interface Props {
    initialSalary?: number;
  }

  let { initialSalary = 50_000_000 }: Props = $props();

  const STORAGE_KEY = 'semtl:salary';

  let annualSalary = $state(initialSalary);
  let severanceIncluded = $state(false);
  let dependents = $state(1);
  let children = $state(0);
  let monthlyNonTaxable = $state(200_000);
  let ready = $state(false);
  let copied = $state(false);

  const input = $derived({
    annualSalary,
    severanceIncluded,
    dependents,
    children,
    monthlyNonTaxable,
  });

  const result = $derived(calculateSalary(input));

  const INSURANCE_KEYS: DeductionKey[] = ['pension', 'health', 'longTermCare', 'employment'];
  const TAX_KEYS: DeductionKey[] = ['incomeTax', 'localTax'];

  const pick = (keys: DeductionKey[]) => result.deductions.filter((d) => keys.includes(d.key));
  const sum = (keys: DeductionKey[]) =>
    result.deductions.reduce((acc, d) => (keys.includes(d.key) ? acc + d.monthly : acc), 0);

  const insuranceLines = $derived(pick(INSURANCE_KEYS));
  const taxLines = $derived(pick(TAX_KEYS));
  const insuranceTotal = $derived(sum(INSURANCE_KEYS));
  const taxTotal = $derived(sum(TAX_KEYS));

  // 연봉 구간별 표 — "연봉 5000 실수령액" 형태의 검색이 실제로 가장 많다
  const table = $derived(
    salaryTable(20_000_000, 100_000_000, 5_000_000, {
      severanceIncluded,
      dependents,
      children,
      monthlyNonTaxable,
    }),
  );
  const nearestRow = $derived(
    table.reduce(
      (best, row) =>
        Math.abs(row.annualSalary - annualSalary) < Math.abs(best - annualSalary)
          ? row.annualSalary
          : best,
      table[0]?.annualSalary ?? 0,
    ),
  );

  const query = $derived(
    `?salary=${annualSalary}&dependents=${dependents}&children=${children}` +
      `&nontax=${monthlyNonTaxable}${severanceIncluded ? '&severance=1' : ''}`,
  );
  const shareUrl = $derived(ready ? `${location.origin}${location.pathname}${query}` : '');

  const steps = $derived([
    ['01', '연간 총급여 (비과세 제외)', `${won(result.tax.grossPay)}원`],
    ['02', '− 근로소득공제', `${won(result.tax.earnedIncomeDeduction)}원`],
    ['03', `− 인적공제 (${dependents}명 × 150만원)`, `${won(result.tax.personalDeduction)}원`],
    ['04', '− 연금보험료공제 (국민연금)', `${won(result.tax.pensionDeduction)}원`],
    result.tax.usedStandardCredit
      ? ['05', '보험료공제 대신 표준세액공제 적용', `${won(result.tax.standardCredit)}원`]
      : ['05', '− 보험료공제 (건강·장기요양·고용)', `${won(result.tax.insuranceDeduction)}원`],
    ['06', `= 과세표준 (${pct(result.tax.bracket.rate * 100, 0)} 구간)`, `${won(result.tax.taxBase)}원`],
    ['07', '산출세액', `${won(result.tax.computedTax)}원`],
    ['08', '− 근로소득세액공제', `${won(result.tax.earnedIncomeCredit)}원`],
    ...(result.tax.childCredit > 0
      ? [['09', `− 자녀세액공제 (${children}명)`, `${won(result.tax.childCredit)}원`]]
      : []),
    ['10', '= 연간 결정세액', `${won(result.tax.finalTax)}원`],
  ]);

  onMount(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('salary')) {
      annualSalary = Number(params.get('salary')) || annualSalary;
      dependents = Number(params.get('dependents')) || 1;
      children = Number(params.get('children')) || 0;
      monthlyNonTaxable = Number(params.get('nontax')) || 0;
      severanceIncluded = params.get('severance') === '1';
    } else {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (typeof parsed.annualSalary === 'number') annualSalary = parsed.annualSalary;
          if (typeof parsed.dependents === 'number') dependents = parsed.dependents;
          if (typeof parsed.children === 'number') children = parsed.children;
          if (typeof parsed.monthlyNonTaxable === 'number')
            monthlyNonTaxable = parsed.monthlyNonTaxable;
          if (typeof parsed.severanceIncluded === 'boolean')
            severanceIncluded = parsed.severanceIncluded;
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

  function downloadCsv() {
    const header = '연봉,세전월급,공제합계,월실수령액,공제율\n';
    const body = table
      .map((r) =>
        [r.annualSalary, r.monthlyGross, r.totalDeduction, r.monthlyNet, r.deductionRate.toFixed(2)].join(','),
      )
      .join('\n');
    const blob = new Blob(['﻿' + header + body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `연봉별_실수령액표_${result.year}.csv`;
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
          id="salary-annual"
          label="연봉"
          unit="원"
          bind:value={annualSalary}
          min={0}
          max={10_000_000_000}
          hint={`${koreanWon(annualSalary)}원`}
          sliderMin={20_000_000}
          sliderMax={200_000_000}
          sliderStep={1_000_000}
          chips={[
            { label: '3천만', value: 30_000_000 },
            { label: '4천만', value: 40_000_000 },
            { label: '5천만', value: 50_000_000 },
            { label: '7천만', value: 70_000_000 },
          ]}
        />

        <div class="field">
          <span class="field-label">퇴직금</span>
          <div class="seg two" role="group" aria-label="퇴직금 포함 여부">
            <button
              type="button"
              aria-pressed={!severanceIncluded}
              onclick={() => (severanceIncluded = false)}>별도</button
            >
            <button
              type="button"
              aria-pressed={severanceIncluded}
              onclick={() => (severanceIncluded = true)}>연봉에 포함</button
            >
          </div>
          <p class="seg-blurb">
            {severanceIncluded
              ? '연봉을 13으로 나눕니다. 실제 월급이 그만큼 줄어듭니다.'
              : '연봉을 12로 나눕니다. 퇴직금은 별도로 적립됩니다.'}
          </p>
        </div>

        <NumberField
          id="salary-dependents"
          label="부양가족 수"
          unit="명"
          bind:value={dependents}
          min={1}
          max={15}
          hint="본인 포함"
          sliderMin={1}
          sliderMax={8}
        />

        <NumberField
          id="salary-children"
          label="자녀 수"
          unit="명"
          bind:value={children}
          min={0}
          max={10}
          hint="8세 이상 20세 이하"
          sliderMin={0}
          sliderMax={5}
        />

        <NumberField
          id="salary-nontax"
          label="월 비과세액"
          unit="원"
          bind:value={monthlyNonTaxable}
          min={0}
          max={2_000_000}
          hint="식대 등"
          sliderMin={0}
          sliderMax={500_000}
          sliderStep={10_000}
          chips={[
            { label: '없음', value: 0 },
            { label: '식대 20만', value: 200_000 },
          ]}
        />
      </form>
    </div>
  </div>

  <!-- ===== 결과 ===== -->
  <div class="results">
    <div class="card">
      <div class="headline">
        <p class="k">월 실수령액</p>
        <p class="v num">{won(result.monthlyNet)}<small>원</small></p>
        <p class="sub">
          세전 {won(result.monthlyGross)}원에서 {won(result.totalDeduction)}원이 공제됩니다
        </p>
      </div>

      <div class="figs">
        <div class="fig">
          <p class="k"><span class="dot dot--principal"></span>연 실수령액</p>
          <p class="v num">{koreanWon(result.annualNet)}<small>원</small></p>
        </div>
        <div class="fig">
          <p class="k"><span class="dot dot--interest"></span>연 공제액</p>
          <p class="v num">{koreanWon(result.totalDeduction * 12)}<small>원</small></p>
        </div>
        <div class="fig">
          <p class="k">공제율</p>
          <p class="v num">{pct(result.deductionRate)}</p>
        </div>
      </div>

      <div class="ratio">
        <div class="ratio-bar">
          <span class="p" style={`width:${100 - result.deductionRate}%`}></span>
          <span class="i" style={`width:${result.deductionRate}%`}></span>
        </div>
        <div class="ratio-legend num">
          <span>실수령 {pct(100 - result.deductionRate)}</span>
          <span>공제 {pct(result.deductionRate)}</span>
        </div>
      </div>

      <details class="why">
        <summary>세액 계산 근거 보기</summary>
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
          {#if result.tax.usedStandardCredit}
            <p class="why-note">
              이 소득 구간에서는 보험료공제보다 표준세액공제가 유리해 그쪽으로 계산했습니다.
            </p>
          {/if}
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

    <!-- 공제 내역 -->
    <div class="card">
      <div class="card-head"><p class="card-title">월 공제 내역</p></div>
      <div class="ded">
        <p class="group-head">
          <span class="dot dot--interest"></span>4대보험
          <span class="group-sum num">{won(insuranceTotal)}원</span>
        </p>
        <ul class="lines">
          {#each insuranceLines as line (line.key)}
            <li>
              <span class="l">{line.label}</span>
              <span class="note">{line.note}</span>
              <span class="a num">{won(line.monthly)}</span>
            </li>
          {/each}
        </ul>

        <p class="group-head">
          <span class="dot dot--interest"></span>세금
          <span class="group-sum num">{won(taxTotal)}원</span>
        </p>
        <ul class="lines">
          {#each taxLines as line (line.key)}
            <li>
              <span class="l">{line.label}</span>
              <span class="note">{line.note}</span>
              <span class="a num">{won(line.monthly)}</span>
            </li>
          {/each}
        </ul>

        <p class="total">
          공제 합계
          <span class="num">{won(result.totalDeduction)}원</span>
        </p>
      </div>
    </div>
  </div>
</div>

<!-- ===== 연봉 구간별 표 ===== -->
<section class="block">
  <div class="sched-head">
    <div>
      <h2>연봉별 실수령액표</h2>
      <p class="block-sub">
        현재 조건(부양가족 {dependents}명 · 비과세 {won(monthlyNonTaxable)}원) 기준입니다.
      </p>
    </div>
    <button type="button" class="btn btn--ghost" onclick={downloadCsv}>CSV 내려받기</button>
  </div>

  <div class="table-scroll">
    <table>
      <thead>
        <tr>
          <th scope="col">연봉</th>
          <th scope="col">세전 월급</th>
          <th scope="col">공제 합계</th>
          <th scope="col">월 실수령액</th>
          <th scope="col">공제율</th>
        </tr>
      </thead>
      <tbody>
        {#each table as row (row.annualSalary)}
          <tr class:here={row.annualSalary === nearestRow}>
            <td>{koreanWon(row.annualSalary)}원</td>
            <td>{won(row.monthlyGross)}</td>
            <td class="i-col">{won(row.totalDeduction)}</td>
            <td class="p-col">{won(row.monthlyNet)}</td>
            <td>{pct(row.deductionRate)}</td>
          </tr>
        {/each}
      </tbody>
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

  .seg {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    padding: 4px;
    background: var(--surface-2);
    border-radius: 9px;
  }

  .seg.two {
    grid-template-columns: repeat(2, 1fr);
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

  .why-note {
    font-size: 12.5px;
    color: var(--ink-3);
    margin: 12px 0 0;
    padding-left: 12px;
    border-left: 2px solid var(--line-strong);
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

  /* ---- 공제 내역 ---- */
  .ded {
    padding: 8px 24px 20px;
  }

  .group-head {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
    margin: 14px 0 6px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }

  .group-head:first-child {
    border-top: 0;
    padding-top: 0;
    margin-top: 4px;
  }

  .group-sum {
    margin-left: auto;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--ink);
  }

  .lines {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .lines li {
    display: grid;
    grid-template-columns: 88px 1fr auto;
    gap: 10px;
    align-items: baseline;
    padding: 6px 0;
    font-size: 13.5px;
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
    margin: 14px 0 0;
    padding-top: 13px;
    border-top: 2px solid var(--line-strong);
    font-size: 14px;
    font-weight: 600;
  }

  @media (max-width: 520px) {
    .lines li {
      grid-template-columns: 1fr auto;
    }

    .lines .note {
      display: none;
    }
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
    font-weight: 600;
  }

  .i-col {
    color: var(--interest);
    font-weight: 500;
  }

  tbody tr.here td {
    background: var(--accent-soft);
  }

  tbody tr.here td:first-child {
    font-weight: 600;
    color: var(--accent-ink);
  }
</style>
