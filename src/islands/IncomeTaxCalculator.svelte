<script lang="ts">
  /**
   * 종합소득세 계산기 위젯.
   *
   * 프리랜서가 이 계산기에 오는 이유는 하나다 — "5월에 더 내나, 돌려받나".
   * 그래서 헤드라인은 결정세액이 아니라 기납부세액과의 차액이다.
   * 환급이면 초록(들어오는 돈), 추가 납부면 벽돌색(나가는 돈)으로 표시해
   * 사이트의 색 체계와 뜻이 맞아떨어지게 했다.
   */
  import { onMount } from 'svelte';
  import NumberField from './NumberField.svelte';
  import { calculateIncomeTax, businessWithholding } from '../lib/calc/incomeTax';
  import { ratesFor } from '../lib/rates';
  import { won, koreanWon, pct } from '../lib/format';

  const STORAGE_KEY = 'semtl:incometax';
  const rates = ratesFor();

  let revenue = $state(30_000_000);
  /** 필요경비를 경비율로 넣을지 금액으로 넣을지 */
  let expenseMode = $state<'rate' | 'amount'>('rate');
  let expenseRate = $state(60);
  let expenseAmount = $state(18_000_000);
  let earnedIncome = $state(0);
  let otherIncome = $state(0);
  let dependents = $state(1);
  let children = $state(0);
  let otherDeduction = $state(0);
  /** 기납부세액을 원천징수 3%로 자동 계산할지 */
  let prepaidAuto = $state(true);
  let prepaidManual = $state(900_000);
  let ready = $state(false);
  let copied = $state(false);

  const expense = $derived(
    expenseMode === 'rate' ? Math.round((revenue * expenseRate) / 100) : expenseAmount,
  );
  const prepaidTax = $derived(
    prepaidAuto ? businessWithholding(revenue, rates) : prepaidManual,
  );

  const input = $derived({
    businessRevenue: revenue,
    businessExpense: expense,
    earnedIncome,
    otherIncome,
    dependents,
    children,
    otherDeduction,
    prepaidTax,
  });

  const result = $derived(calculateIncomeTax(input));
  const isRefund = $derived(result.totalBalance < 0);
  const settleAmount = $derived(Math.abs(result.totalBalance));

  const steps = $derived([
    ['01', '사업소득 수입금액', `${won(revenue)}원`],
    ['02', `− 필요경비${expenseMode === 'rate' ? ` (${expenseRate}%)` : ''}`, `${won(expense)}원`],
    ...(earnedIncome > 0
      ? ([
          ['03', '+ 근로소득금액 (총급여 − 근로소득공제)', `${won(result.earnedIncomeAmount)}원`],
        ] as string[][])
      : []),
    ...(otherIncome > 0 ? ([['04', '+ 그 밖의 종합소득금액', `${won(otherIncome)}원`]] as string[][]) : []),
    ['05', '= 종합소득금액', `${won(result.totalIncome)}원`],
    ['06', `− 인적공제 (${dependents}명 × 150만원)`, `${won(result.personalDeduction)}원`],
    ...(otherDeduction > 0 ? ([['07', '− 그 밖의 소득공제', `${won(otherDeduction)}원`]] as string[][]) : []),
    ['08', `= 과세표준 (${pct(result.bracket.rate * 100, 0)} 구간)`, `${won(result.taxBase)}원`],
    ['09', '산출세액', `${won(result.computedTax)}원`],
    ...(result.earnedCredit > 0
      ? ([['10', '− 근로소득세액공제 (근로소득 몫)', `${won(result.earnedCredit)}원`]] as string[][])
      : []),
    ...(result.childCredit > 0
      ? ([['11', `− 자녀세액공제 (${children}명)`, `${won(result.childCredit)}원`]] as string[][])
      : []),
    [
      '12',
      `− 표준세액공제 (${result.hasEarnedIncome ? '근로소득 있음' : '근로소득 없음'})`,
      `${won(result.standardCredit)}원`,
    ],
    ['13', '= 결정세액', `${won(result.finalTax)}원`],
  ]);

  const query = $derived(
    `?revenue=${revenue}&emode=${expenseMode}&erate=${expenseRate}&eamount=${expenseAmount}` +
      `&earned=${earnedIncome}&other=${otherIncome}&dep=${dependents}&child=${children}` +
      `&deduct=${otherDeduction}${prepaidAuto ? '' : `&prepaid=${prepaidManual}`}`,
  );
  const shareUrl = $derived(ready ? `${location.origin}${location.pathname}${query}` : '');

  onMount(() => {
    const p = new URLSearchParams(location.search);
    if (p.has('revenue')) {
      revenue = Number(p.get('revenue')) || revenue;
      const m = p.get('emode');
      if (m === 'rate' || m === 'amount') expenseMode = m;
      expenseRate = Number(p.get('erate')) || expenseRate;
      expenseAmount = Number(p.get('eamount')) || expenseAmount;
      earnedIncome = Number(p.get('earned')) || 0;
      otherIncome = Number(p.get('other')) || 0;
      dependents = Number(p.get('dep')) || 1;
      children = Number(p.get('child')) || 0;
      otherDeduction = Number(p.get('deduct')) || 0;
      if (p.has('prepaid')) {
        prepaidAuto = false;
        prepaidManual = Number(p.get('prepaid')) || 0;
      }
    } else {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const s = JSON.parse(saved);
          if (typeof s.revenue === 'number') revenue = s.revenue;
          if (s.expenseMode === 'rate' || s.expenseMode === 'amount') expenseMode = s.expenseMode;
          if (typeof s.expenseRate === 'number') expenseRate = s.expenseRate;
          if (typeof s.expenseAmount === 'number') expenseAmount = s.expenseAmount;
          if (typeof s.earnedIncome === 'number') earnedIncome = s.earnedIncome;
          if (typeof s.otherIncome === 'number') otherIncome = s.otherIncome;
          if (typeof s.dependents === 'number') dependents = s.dependents;
          if (typeof s.children === 'number') children = s.children;
          if (typeof s.otherDeduction === 'number') otherDeduction = s.otherDeduction;
          if (typeof s.prepaidAuto === 'boolean') prepaidAuto = s.prepaidAuto;
          if (typeof s.prepaidManual === 'number') prepaidManual = s.prepaidManual;
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
        JSON.stringify({
          revenue, expenseMode, expenseRate, expenseAmount,
          earnedIncome, otherIncome, dependents, children, otherDeduction,
          prepaidAuto, prepaidManual,
        }),
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
          id="it-revenue"
          label="사업 수입금액"
          unit="원"
          bind:value={revenue}
          min={0}
          max={10_000_000_000}
          hint={`${koreanWon(revenue)}원 · 원천징수 전`}
          sliderMin={0}
          sliderMax={200_000_000}
          sliderStep={1_000_000}
          chips={[
            { label: '2천만', value: 20_000_000 },
            { label: '3천만', value: 30_000_000 },
            { label: '5천만', value: 50_000_000 },
            { label: '1억', value: 100_000_000 },
          ]}
        />

        <div class="field">
          <span class="field-label">필요경비</span>
          <div class="seg two" role="group" aria-label="필요경비 입력 방식">
            <button
              type="button"
              aria-pressed={expenseMode === 'rate'}
              onclick={() => (expenseMode = 'rate')}>경비율</button
            >
            <button
              type="button"
              aria-pressed={expenseMode === 'amount'}
              onclick={() => (expenseMode = 'amount')}>금액 직접</button
            >
          </div>
        </div>

        {#if expenseMode === 'rate'}
          <NumberField
            id="it-erate"
            label="단순경비율"
            unit="%"
            bind:value={expenseRate}
            min={0}
            max={100}
            decimals={1}
            hint={`필요경비 ${won(expense)}원`}
            sliderMin={0}
            sliderMax={90}
            sliderStep={0.1}
          />
          <p class="field-note tight">
            업종코드마다 다릅니다. 홈택스에서 내 업종의 경비율을 확인해 넣으세요.
          </p>
        {:else}
          <NumberField
            id="it-eamount"
            label="필요경비"
            unit="원"
            bind:value={expenseAmount}
            min={0}
            max={10_000_000_000}
            hint={revenue > 0 ? `수입의 ${((expense / revenue) * 100).toFixed(1)}%` : '장부 기준'}
            sliderMin={0}
            sliderMax={Math.max(1_000_000, revenue)}
            sliderStep={500_000}
          />
        {/if}

        <NumberField
          id="it-dependents"
          label="부양가족 수"
          unit="명"
          bind:value={dependents}
          min={1}
          max={15}
          hint="본인 포함"
          sliderMin={1}
          sliderMax={8}
        />

        <div class="field">
          <span class="field-label">기납부세액</span>
          <div class="seg two" role="group" aria-label="기납부세액 입력 방식">
            <button type="button" aria-pressed={prepaidAuto} onclick={() => (prepaidAuto = true)}>
              수입의 3%
            </button>
            <button type="button" aria-pressed={!prepaidAuto} onclick={() => (prepaidAuto = false)}>
              직접 입력
            </button>
          </div>
          <p class="field-note">
            {prepaidAuto
              ? `원천징수된 소득세 ${won(prepaidTax)}원 (3.3% 중 소득세분)`
              : '원천징수영수증의 소득세 합계를 넣으세요'}
          </p>
        </div>

        {#if !prepaidAuto}
          <NumberField
            id="it-prepaid"
            label="기납부 소득세"
            unit="원"
            bind:value={prepaidManual}
            min={0}
            max={1_000_000_000}
            hint="지방소득세 제외"
            sliderMin={0}
            sliderMax={20_000_000}
            sliderStep={100_000}
          />
        {/if}

        <details class="more">
          <summary>근로소득·기타소득 추가</summary>
          <div class="more-body">
            <NumberField
              id="it-earned"
              label="근로소득 총급여"
              unit="원"
              bind:value={earnedIncome}
              min={0}
              max={10_000_000_000}
              hint={earnedIncome > 0 ? `${koreanWon(earnedIncome)}원` : '없으면 0'}
              sliderMin={0}
              sliderMax={150_000_000}
              sliderStep={1_000_000}
            />

            <NumberField
              id="it-other"
              label="그 밖의 종합소득금액"
              unit="원"
              bind:value={otherIncome}
              min={0}
              max={10_000_000_000}
              hint="이자·배당·연금·기타"
              sliderMin={0}
              sliderMax={100_000_000}
              sliderStep={1_000_000}
            />

            <NumberField
              id="it-children"
              label="자녀 수"
              unit="명"
              bind:value={children}
              min={0}
              max={10}
              hint="8세 이상"
              sliderMin={0}
              sliderMax={5}
            />

            <NumberField
              id="it-deduct"
              label="그 밖의 소득공제"
              unit="원"
              bind:value={otherDeduction}
              min={0}
              max={1_000_000_000}
              hint="연금보험료·노란우산 등"
              sliderMin={0}
              sliderMax={20_000_000}
              sliderStep={100_000}
            />
          </div>
        </details>
      </form>
    </div>
  </div>

  <!-- ===== 결과 ===== -->
  <div class="results">
    <div class="card">
      <div class="headline" class:refund={isRefund}>
        <p class="k">{isRefund ? '환급 예상' : '추가 납부 예상'}</p>
        <p class="v num">{won(settleAmount)}<small>원</small></p>
        <p class="sub">
          소득세 {won(Math.abs(result.balance))}원 + 지방소득세 {won(Math.abs(result.localBalance))}원
        </p>
      </div>

      <div class="figs">
        <div class="fig">
          <p class="k">종합소득금액</p>
          <p class="v num">{koreanWon(result.totalIncome)}<small>원</small></p>
        </div>
        <div class="fig">
          <p class="k">과세표준</p>
          <p class="v num">{koreanWon(result.taxBase)}<small>원</small></p>
        </div>
        <div class="fig">
          <p class="k">결정세액</p>
          <p class="v num">{won(result.finalTax)}<small>원</small></p>
        </div>
      </div>

      <div class="settle">
        <p class="settle-head">정산</p>
        <ul class="lines">
          <li><span class="l">결정세액</span><span class="a num">{won(result.finalTax)}</span></li>
          <li>
            <span class="l">− 기납부세액</span>
            <span class="a num">{won(result.prepaidTax)}</span>
          </li>
          <li class="sum">
            <span class="l">{isRefund ? '환급받을 소득세' : '더 낼 소득세'}</span>
            <span class="a num" class:good={isRefund} class:bad={!isRefund}>
              {won(Math.abs(result.balance))}
            </span>
          </li>
        </ul>
        <p class="settle-note">
          지방소득세는 소득세의 10%로 <strong>따로 신고·납부</strong>합니다. 원천징수된 3.3% 중
          0.3%가 이미 낸 지방소득세입니다.
        </p>
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
          <p class="why-note">
            종합소득금액 대비 실효세율은 {pct(result.effectiveRate, 2)}입니다.
          </p>
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
      </div>
    </div>

    {#if result.hasEarnedIncome}
      <div class="card hint-card">
        <p>
          <strong>근로소득이 있으시군요.</strong> 이 계산기는 표준세액공제만 반영합니다. 실제로는
          보험료·의료비·신용카드 등 특별공제를 받는 편이 유리한 경우가 많아 세금이 더 줄어들 수
          있습니다. 근로소득만 있다면 <a href="/salary">연봉 실수령액 계산기</a>가 더 정확합니다.
        </p>
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

  .more {
    border-top: 1px solid var(--line);
    padding-top: 16px;
  }

  .more summary {
    cursor: pointer;
    list-style: none;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--accent-ink);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .more summary::-webkit-details-marker {
    display: none;
  }

  .more summary::after {
    content: '+';
    margin-left: auto;
    color: var(--ink-3);
    font-family: var(--f-mono);
  }

  .more[open] summary::after {
    content: '−';
  }

  .more-body {
    display: flex;
    flex-direction: column;
    gap: 22px;
    padding-top: 20px;
  }

  .results {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* ---- 헤드라인 : 환급은 들어오는 돈, 납부는 나가는 돈 ---- */
  .headline {
    padding: 22px 24px 24px;
  }

  .headline .k {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--interest);
    margin: 0 0 4px;
  }

  .headline.refund .k {
    color: var(--accent-ink);
  }

  .headline .v {
    font-size: clamp(34px, 6vw, 46px);
    font-weight: 600;
    line-height: 1.05;
    letter-spacing: -0.02em;
    color: var(--interest);
    margin: 0;
  }

  .headline.refund .v {
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

  /* ---- 정산 ---- */
  .settle {
    padding: 16px 24px 20px;
    border-top: 1px solid var(--line);
  }

  .settle-head {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin: 0 0 8px;
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

  .lines li.sum {
    border-bottom: 0;
    border-top: 2px solid var(--line-strong);
    margin-top: 4px;
    padding-top: 11px;
    font-weight: 600;
    font-size: 14.5px;
  }

  .lines .l {
    color: var(--ink-2);
  }

  .lines li.sum .l {
    color: var(--ink);
  }

  .lines .a {
    font-weight: 500;
    white-space: nowrap;
  }

  .lines .a.good {
    color: var(--principal);
    font-weight: 700;
  }

  .lines .a.bad {
    color: var(--interest);
    font-weight: 700;
  }

  .settle-note {
    font-size: 12.5px;
    color: var(--ink-3);
    margin: 12px 0 0;
    line-height: 1.6;
  }

  .settle-note strong {
    color: var(--ink-2);
  }

  /* ---- 계산 근거 ---- */
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
    gap: 11px;
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

  .why-note {
    font-size: 12.5px;
    color: var(--ink-3);
    margin: 12px 0 0;
    padding-left: 12px;
    border-left: 2px solid var(--line-strong);
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

  .hint-card p {
    margin: 0;
    padding: 17px 20px;
    font-size: 13.5px;
    color: var(--ink-2);
    line-height: 1.7;
  }

  .hint-card strong {
    color: var(--ink);
  }
</style>
