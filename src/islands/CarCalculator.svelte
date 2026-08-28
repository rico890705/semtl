<script lang="ts">
  /**
   * 자동차 할부 계산기 위젯.
   *
   * 화면에서 꼭 짚어야 하는 두 가지
   *   1. 차값 외에 취득세가 따로 든다 — 3,000만원 차면 210만원
   *   2. 유예할부는 월 납입금만 낮을 뿐, 총 이자가 늘고 만기에 목돈이 필요하다
   *
   * 광고는 낮아진 월 납입금만 크게 보여주므로 여기서는 반대쪽을 함께 보여준다.
   */
  import { onMount } from 'svelte';
  import NumberField from './NumberField.svelte';
  import { calculateCar, termComparison } from '../lib/calc/car';
  import { CAR, VEHICLE_KINDS, vehicleById, type VehicleKind } from '../lib/rates/car';
  import { won, koreanWon, pct } from '../lib/format';

  const STORAGE_KEY = 'semtl:car';

  let price = $state(30_000_000);
  let vehicleKind = $state<VehicleKind>('passenger');
  let downPayment = $state(5_000_000);
  let months = $state(60);
  let annualRate = $state(5);
  let residualRate = $state(0);
  let bondCost = $state(300_000);
  let ready = $state(false);
  let copied = $state(false);

  const input = $derived({
    price,
    downPayment,
    months,
    annualRate,
    vehicleKind,
    bondCost,
    residualRate,
  });

  const result = $derived(calculateCar(input));
  const terms = $derived(termComparison(input));
  const maxMonthly = $derived(Math.max(1, ...terms.map((t) => t.monthlyPayment)));
  const spec = $derived(vehicleById(vehicleKind));

  const query = $derived(
    `?price=${price}&kind=${vehicleKind}&down=${downPayment}&months=${months}` +
      `&rate=${annualRate}&residual=${residualRate}&bond=${bondCost}`,
  );
  const shareUrl = $derived(ready ? `${location.origin}${location.pathname}${query}` : '');

  onMount(() => {
    const p = new URLSearchParams(location.search);
    if (p.has('price')) {
      price = Number(p.get('price')) || price;
      const k = p.get('kind');
      if (VEHICLE_KINDS.some((v) => v.id === k)) vehicleKind = k as VehicleKind;
      downPayment = Number(p.get('down')) || 0;
      months = Number(p.get('months')) || months;
      annualRate = Number(p.get('rate')) || annualRate;
      residualRate = Number(p.get('residual')) || 0;
      bondCost = Number(p.get('bond')) || 0;
    } else {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const s = JSON.parse(saved);
          if (typeof s.price === 'number') price = s.price;
          if (VEHICLE_KINDS.some((v) => v.id === s.vehicleKind)) vehicleKind = s.vehicleKind;
          if (typeof s.downPayment === 'number') downPayment = s.downPayment;
          if (typeof s.months === 'number') months = s.months;
          if (typeof s.annualRate === 'number') annualRate = s.annualRate;
          if (typeof s.residualRate === 'number') residualRate = s.residualRate;
          if (typeof s.bondCost === 'number') bondCost = s.bondCost;
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
  <div class="inputs">
    <div class="card">
      <div class="card-head"><p class="card-title">조건 입력</p></div>

      <form class="form" autocomplete="off" onsubmit={(e) => e.preventDefault()}>
        <NumberField
          id="car-price"
          label="차량가격"
          unit="원"
          bind:value={price}
          min={0}
          max={1_000_000_000}
          hint={`${koreanWon(price)}원 · 세금 포함 출고가`}
          sliderMin={5_000_000}
          sliderMax={150_000_000}
          sliderStep={1_000_000}
          chips={[
            { label: '2천만', value: 20_000_000 },
            { label: '3천만', value: 30_000_000 },
            { label: '5천만', value: 50_000_000 },
          ]}
        />

        <div class="field">
          <label class="field-label" for="car-kind">차종</label>
          <select id="car-kind" bind:value={vehicleKind}>
            {#each VEHICLE_KINDS as v (v.id)}
              <option value={v.id}>{v.label} (취득세 {v.acquisitionRate}%)</option>
            {/each}
          </select>
          <p class="field-note">{spec.hint}</p>
        </div>

        <NumberField
          id="car-down"
          label="선수금"
          unit="원"
          bind:value={downPayment}
          min={0}
          max={1_000_000_000}
          hint={price > 0 ? `차값의 ${((downPayment / price) * 100).toFixed(0)}%` : '계약금'}
          sliderMin={0}
          sliderMax={Math.max(1_000_000, price)}
          sliderStep={1_000_000}
        />

        <NumberField
          id="car-months"
          label="할부 기간"
          unit="개월"
          bind:value={months}
          min={1}
          max={120}
          hint={`${(months / 12).toFixed(1)}년`}
          sliderMin={12}
          sliderMax={72}
          chips={[
            { label: '36', value: 36 },
            { label: '48', value: 48 },
            { label: '60', value: 60 },
            { label: '72', value: 72 },
          ]}
        />

        <NumberField
          id="car-rate"
          label="할부금리"
          unit="%"
          bind:value={annualRate}
          min={0}
          max={30}
          decimals={2}
          hint={annualRate === 0 ? '무이자 할부' : '연 이자율'}
          sliderMin={0}
          sliderMax={15}
          sliderStep={0.1}
        />

        <NumberField
          id="car-residual"
          label="유예할부 잔가"
          unit="%"
          bind:value={residualRate}
          min={0}
          max={70}
          decimals={0}
          hint={residualRate > 0 ? `만기 잔금 ${won(result.residual)}원` : '0이면 일반 할부'}
          sliderMin={0}
          sliderMax={60}
          chips={[
            { label: '없음', value: 0 },
            { label: '30%', value: 30 },
            { label: '40%', value: 40 },
          ]}
        />

        <NumberField
          id="car-bond"
          label="공채 실부담액"
          unit="원"
          bind:value={bondCost}
          min={0}
          max={10_000_000}
          hint="즉시 매도 기준"
          sliderMin={0}
          sliderMax={1_000_000}
          sliderStep={10_000}
        />
        <p class="field-note tight">
          지역과 배기량에 따라 다릅니다. 대부분 즉시 할인 매도하므로 실부담은 매입액의
          {CAR.bond.typicalDiscountLow}~{CAR.bond.typicalDiscountHigh}% 수준입니다.
        </p>
      </form>
    </div>
  </div>

  <div class="results">
    <div class="card">
      <div class="headline">
        <p class="k">월 납입금</p>
        <p class="v num">{won(result.monthlyPayment)}<small>원</small></p>
        <p class="sub">
          할부원금 {won(result.principal)}원 · {months}개월 · 연 {annualRate}%
          {#if result.isDeferred}· 만기 잔금 {koreanWon(result.residual)}원{/if}
        </p>
      </div>

      {#if result.isDeferred && result.comparison}
        <div class="warn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M12 3 2 20h20L12 3z"></path>
            <path d="M12 10v4M12 17h.01"></path>
          </svg>
          <div>
            <p class="warn-title">
              월 {won(result.comparison.monthlyDiff)}원 싸지만 총 이자는
              {won(result.comparison.interestDiff)}원 더 냅니다
            </p>
            <p class="warn-body">
              일반 할부라면 월 {won(result.comparison.monthlyPayment)}원입니다. 유예할부는 남겨둔
              원금에도 계속 이자가 붙기 때문입니다. 게다가 만기에
              <strong>{won(result.residual)}원을 한 번에</strong> 마련해야 합니다.
            </p>
          </div>
        </div>
      {/if}

      <div class="figs">
        <div class="fig">
          <p class="k"><span class="dot dot--interest"></span>총 이자</p>
          <p class="v num">{won(result.totalInterest)}<small>원</small></p>
        </div>
        <div class="fig">
          <p class="k"><span class="dot dot--interest"></span>취득세</p>
          <p class="v num">{won(result.acquisitionTax)}<small>원</small></p>
        </div>
        <div class="fig">
          <p class="k">차값 대비</p>
          <p class="v num">{pct(result.costRatio, 1)}</p>
        </div>
      </div>

      <!-- 차값만 보면 놓치는 부분 -->
      <div class="total">
        <p class="total-head">차를 손에 넣기까지 실제로 나가는 돈</p>
        <p class="total-v num">{won(result.totalCost)}<small>원</small></p>
        <ul class="breakdown">
          <li><span>차량가격</span><span class="num">{won(result.price)}</span></li>
          <li><span>+ 할부 이자</span><span class="num i">{won(result.totalInterest)}</span></li>
          <li>
            <span>+ 취득세 ({result.acquisitionRate}%)</span>
            <span class="num i">{won(result.acquisitionTax)}</span>
          </li>
          {#if result.taxRelief > 0}
            <li class="relief">
              <span>− 취득세 감면</span><span class="num p">{won(result.taxRelief)}</span>
            </li>
          {/if}
          <li><span>+ 공채</span><span class="num i">{won(result.bondCost)}</span></li>
        </ul>
        <p class="total-note">
          {#if result.taxRelief > 0}
            경차 감면으로 취득세 {won(result.taxRelief)}원이 빠졌습니다.
          {:else}
            차값 외에 <strong>{won(result.registrationCost)}원</strong>이 더 듭니다. 보험료와
            정비비는 여기 포함되지 않습니다.
          {/if}
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

<!-- 기간별 비교 -->
<section class="block">
  <h2>기간을 바꾸면</h2>
  <p class="block-sub">
    기간이 길면 월 부담이 줄지만 총 이자가 늘어납니다. 같은 조건에서 비교해보세요.
  </p>

  <div class="terms">
    {#each terms as row (row.months)}
      <div class="term-row" class:current={row.current}>
        <span class="term-when">{row.months}개월</span>
        <span class="term-bar">
          <span class="term-fill" style={`width:${(row.monthlyPayment / maxMonthly) * 100}%`}></span>
        </span>
        <span class="term-monthly num">{won(row.monthlyPayment)}원</span>
        <span class="term-interest num">이자 {won(row.totalInterest)}원</span>
      </div>
    {/each}
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

  .warn {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    margin: 0 24px 18px;
    padding: 14px 16px;
    background: var(--interest-soft);
    border-radius: 10px;
  }

  .warn svg {
    width: 19px;
    height: 19px;
    color: var(--interest);
    flex: none;
    margin-top: 2px;
  }

  .warn-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
    margin: 0 0 5px;
  }

  .warn-body {
    font-size: 13px;
    color: var(--ink-2);
    margin: 0;
    line-height: 1.65;
  }

  .warn-body strong {
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

  /* ---- 실제로 드는 돈 ---- */
  .total {
    padding: 18px 24px 20px;
    border-top: 1px solid var(--line);
  }

  .total-head {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin: 0 0 6px;
  }

  .total-v {
    font-size: 30px;
    font-weight: 600;
    letter-spacing: -0.02em;
    margin: 0 0 14px;
    color: var(--ink);
  }

  .total-v small {
    font-size: 0.45em;
    font-weight: 500;
    color: var(--ink-3);
    margin-left: 4px;
  }

  .breakdown {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .breakdown li {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    padding: 6px 0;
    font-size: 13.5px;
    color: var(--ink-2);
    border-bottom: 1px dashed var(--line);
  }

  .breakdown li:last-child {
    border-bottom: 0;
  }

  .breakdown .num {
    font-weight: 500;
    color: var(--ink);
  }

  .breakdown .num.i {
    color: var(--interest);
  }

  .breakdown .num.p {
    color: var(--principal);
  }

  .total-note {
    font-size: 12.5px;
    color: var(--ink-3);
    margin: 12px 0 0;
    line-height: 1.6;
  }

  .total-note strong {
    color: var(--interest);
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

  /* ---- 기간별 비교 ---- */
  .terms {
    border: 1px solid var(--line);
    border-radius: 11px;
    background: var(--surface);
    overflow: hidden;
  }

  .term-row {
    display: grid;
    grid-template-columns: 72px 1fr 116px 150px;
    gap: 14px;
    align-items: center;
    padding: 11px 16px;
    border-bottom: 1px solid var(--line);
    font-size: 13.5px;
  }

  .term-row:last-child {
    border-bottom: 0;
  }

  .term-row.current {
    background: var(--accent-soft);
  }

  .term-when {
    color: var(--ink-2);
    font-weight: 500;
  }

  .term-row.current .term-when {
    color: var(--accent-ink);
    font-weight: 700;
  }

  .term-bar {
    height: 10px;
    background: var(--surface-2);
    border-radius: 3px;
    overflow: hidden;
  }

  .term-fill {
    display: block;
    height: 100%;
    background: var(--principal);
    transition: width 0.3s;
  }

  .term-monthly {
    text-align: right;
    font-weight: 600;
    color: var(--ink);
  }

  .term-interest {
    text-align: right;
    font-size: 12.5px;
    color: var(--interest);
  }

  @media (max-width: 680px) {
    .term-row {
      grid-template-columns: 64px 1fr auto;
      gap: 10px;
    }

    .term-bar,
    .term-interest {
      display: none;
    }
  }
</style>
