<script lang="ts">
  /**
   * 취득세 계산기 위젯.
   *
   * 이 계산기의 요점은 "중과에 걸리는지"다.
   * 조정대상지역에서 2주택이 되면 세율이 1~3%에서 8%로 뛴다. 8억 아파트라면
   * 취득세만 1,600만원에서 6,400만원으로 4배가 된다. 그 낙차를 화면에서 보여준다.
   */
  import { onMount } from 'svelte';
  import NumberField from './NumberField.svelte';
  import {
    calculateAcquisitionTax,
    rateTable,
    type PropertyKind,
  } from '../lib/calc/acquisition';
  import { OWNER_KINDS, ACQUISITION, type OwnerKind } from '../lib/rates/acquisition';
  import { won, koreanWon, pct } from '../lib/format';

  const STORAGE_KEY = 'semtl:acquisition';
  const PYEONG = 3.305785;

  let propertyKind = $state<PropertyKind>('house');
  let price = $state(600_000_000);
  let exclusiveArea = $state(84);
  let owner = $state<OwnerKind>('first');
  let adjustedArea = $state(false);
  let firstTime = $state(false);
  let ready = $state(false);
  let copied = $state(false);

  const isHouse = $derived(propertyKind === 'house');

  const input = $derived({ propertyKind, price, exclusiveArea, owner, adjustedArea, firstTime });
  const result = $derived(calculateAcquisitionTax(input));

  /** 중과에 걸렸을 때 1주택이었다면 얼마였을지 — 낙차를 보여주기 위해 */
  const asFirstHome = $derived(
    calculateAcquisitionTax({ ...input, owner: 'first', adjustedArea: false, firstTime: false }),
  );
  const isHeavy = $derived(result.tier === 'heavyMid' || result.tier === 'heavyTop');

  const table = $derived(rateTable(price));
  const rateText = (rate: number) => `${(rate * 100).toFixed(2).replace(/\.?0+$/, '')}%`;

  const lines = $derived([
    { label: '취득세', amount: result.acquisitionTax, note: `취득가액의 ${rateText(result.rate)}` },
    {
      label: '지방교육세',
      amount: result.educationTax,
      note: isHeavy || !isHouse ? '취득가액의 0.4%' : `취득세율의 10%`,
    },
    {
      label: '농어촌특별세',
      amount: result.ruralTax,
      note: result.ruralExempt ? '국민주택규모 이하 비과세' : `취득가액의 ${rateText(result.ruralTax / Math.max(1, price))}`,
    },
  ]);

  const query = $derived(
    `?kind=${propertyKind}&price=${price}&area=${exclusiveArea}` +
      `&owner=${owner}${adjustedArea ? '&adj=1' : ''}${firstTime ? '&first=1' : ''}`,
  );
  const shareUrl = $derived(ready ? `${location.origin}${location.pathname}${query}` : '');

  onMount(() => {
    const params = new URLSearchParams(location.search);
    if (params.has('price')) {
      const k = params.get('kind');
      if (k === 'house' || k === 'nonHouse') propertyKind = k;
      price = Number(params.get('price')) || price;
      exclusiveArea = Number(params.get('area')) || exclusiveArea;
      const o = params.get('owner');
      if (OWNER_KINDS.some((x) => x.id === o)) owner = o as OwnerKind;
      adjustedArea = params.get('adj') === '1';
      firstTime = params.get('first') === '1';
    } else {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const s = JSON.parse(saved);
          if (s.propertyKind === 'house' || s.propertyKind === 'nonHouse') propertyKind = s.propertyKind;
          if (typeof s.price === 'number') price = s.price;
          if (typeof s.exclusiveArea === 'number') exclusiveArea = s.exclusiveArea;
          if (OWNER_KINDS.some((x) => x.id === s.owner)) owner = s.owner;
          if (typeof s.adjustedArea === 'boolean') adjustedArea = s.adjustedArea;
          if (typeof s.firstTime === 'boolean') firstTime = s.firstTime;
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
          <span class="field-label">물건 종류</span>
          <div class="seg two" role="group" aria-label="물건 종류">
            <button type="button" aria-pressed={isHouse} onclick={() => (propertyKind = 'house')}>
              주택
            </button>
            <button
              type="button"
              aria-pressed={!isHouse}
              onclick={() => (propertyKind = 'nonHouse')}>주택 외</button
            >
          </div>
          {#if !isHouse}
            <p class="field-note">상가·토지 등은 주택 수와 면적에 관계없이 4%입니다.</p>
          {/if}
        </div>

        <NumberField
          id="acq-price"
          label="취득가액"
          unit="원"
          bind:value={price}
          min={0}
          max={100_000_000_000}
          hint={`${koreanWon(price)}원`}
          sliderMin={50_000_000}
          sliderMax={3_000_000_000}
          sliderStep={10_000_000}
          chips={[
            { label: '3억', value: 300_000_000 },
            { label: '6억', value: 600_000_000 },
            { label: '9억', value: 900_000_000 },
            { label: '15억', value: 1_500_000_000 },
          ]}
        />

        {#if isHouse}
          <NumberField
            id="acq-area"
            label="전용면적"
            unit="㎡"
            bind:value={exclusiveArea}
            min={0}
            max={2000}
            decimals={2}
            hint={`${(exclusiveArea / PYEONG).toFixed(1)}평`}
            sliderMin={20}
            sliderMax={200}
            sliderStep={0.5}
            chips={[
              { label: '59㎡', value: 59 },
              { label: '84㎡', value: 84 },
              { label: '114㎡', value: 114 },
            ]}
          />

          <div class="field">
            <label class="field-label" for="acq-owner">취득 후 주택 수</label>
            <select id="acq-owner" bind:value={owner}>
              {#each OWNER_KINDS as kind (kind.id)}
                <option value={kind.id}>{kind.label}</option>
              {/each}
            </select>
            <p class="field-note">
              {OWNER_KINDS.find((k) => k.id === owner)?.hint}
            </p>
          </div>

          {#if owner !== 'corporate'}
            <div class="field">
              <span class="field-label">조정대상지역</span>
              <div class="seg two" role="group" aria-label="조정대상지역 여부">
                <button
                  type="button"
                  aria-pressed={!adjustedArea}
                  onclick={() => (adjustedArea = false)}>아니오</button
                >
                <button
                  type="button"
                  aria-pressed={adjustedArea}
                  onclick={() => (adjustedArea = true)}>예</button
                >
              </div>
              <p class="field-note">
                조정대상지역이면 2주택부터 중과됩니다. 비조정지역은 3주택부터입니다.
              </p>
            </div>
          {/if}

          {#if owner === 'first'}
            <div class="field">
              <span class="field-label">생애최초 주택 구입</span>
              <div class="seg two" role="group" aria-label="생애최초 여부">
                <button type="button" aria-pressed={!firstTime} onclick={() => (firstTime = false)}>
                  아니오
                </button>
                <button type="button" aria-pressed={firstTime} onclick={() => (firstTime = true)}>
                  예
                </button>
              </div>
              <p class="field-note">
                세대원 전원 무주택 · 12억원 이하 · 취득 후 3년 이상 실거주 시 최대 200만원 감면
              </p>
            </div>
          {/if}
        {/if}
      </form>
    </div>
  </div>

  <!-- ===== 결과 ===== -->
  <div class="results">
    <div class="card">
      <div class="headline">
        <p class="k">총 납부세액</p>
        <p class="v num">{won(result.total)}<small>원</small></p>
        <p class="sub">
          {result.rateReason} · 취득세율 {rateText(result.rate)} · 실효 {pct(result.effectiveRate, 2)}
        </p>
      </div>

      {#if isHeavy}
        <div class="warn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M12 3 2 20h20L12 3z"></path>
            <path d="M12 10v4M12 17h.01"></path>
          </svg>
          <div>
            <p class="warn-title">중과세율 {rateText(result.rate)}가 적용됩니다</p>
            <p class="warn-body">
              같은 집을 1주택으로 취득했다면 <strong class="num">{won(asFirstHome.total)}원</strong>이었을
              세금이 <strong class="num">{won(result.total)}원</strong>으로
              <strong>{(result.total / Math.max(1, asFirstHome.total)).toFixed(1)}배</strong>
              늘었습니다. 차액은 {won(result.total - asFirstHome.total)}원입니다.
            </p>
          </div>
        </div>
      {/if}

      <div class="ded">
        <ul class="lines">
          {#each lines as line (line.label)}
            <li>
              <span class="l">{line.label}</span>
              <span class="note">{line.note}</span>
              <span class="a num">{won(line.amount)}</span>
            </li>
          {/each}
        </ul>

        {#if result.relief > 0}
          <p class="relief">
            <span>생애최초 감면</span>
            <span class="num">−{won(result.relief)}원</span>
          </p>
          <p class="relief-note">
            감면은 취득세 본세에만 적용됩니다. 지방교육세와 농어촌특별세는 감면 전 과세표준
            기준으로 부과됩니다.
          </p>
        {:else if result.reliefBlockedReason}
          <p class="relief-note blocked">{result.reliefBlockedReason}</p>
        {/if}

        <p class="total">
          합계
          <span class="num">{won(result.total)}원</span>
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

<!-- ===== 세율표 ===== -->
{#if isHouse}
  <section class="block">
    <h2>주택 취득세율표</h2>
    <p class="block-sub">
      취득가액 {koreanWon(price)}원 기준입니다. 현재 조건에 해당하는 칸을 표시했습니다.
    </p>

    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">취득 후 주택 수</th>
            <th scope="col">조정대상지역</th>
            <th scope="col">비조정대상지역</th>
          </tr>
        </thead>
        <tbody>
          {#each table as row (row.owner)}
            <tr>
              <td>{row.label}</td>
              <td
                class="rate-cell"
                class:here={owner === row.owner && adjustedArea}
                class:heavy={!row.adjustedStandard}
              >
                {rateText(row.adjusted ?? 0)}{#if row.adjustedStandard}<span class="std">표준</span>{/if}
              </td>
              <td
                class="rate-cell"
                class:here={owner === row.owner && !adjustedArea}
                class:heavy={!row.nonAdjustedStandard}
              >
                {rateText(row.nonAdjusted ?? 0)}{#if row.nonAdjustedStandard}<span class="std">표준</span>{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <p class="table-note">
      "표준"은 취득가액에 따라 1~3%로 달라지는 구간입니다 — 6억원 이하 1%, 6억 초과 9억 이하
      누진, 9억원 초과 3%. 법인은 지역과 주택 수에 관계없이
      {rateText(ACQUISITION.house.heavy.top)}입니다.
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

  /* ---- 중과 경고 ---- */
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

  /* ---- 세액 내역 ---- */
  .ded {
    padding: 4px 24px 20px;
    border-top: 1px solid var(--line);
    padding-top: 16px;
  }

  .lines {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .lines li {
    display: grid;
    grid-template-columns: 96px 1fr auto;
    gap: 10px;
    align-items: baseline;
    padding: 8px 0;
    font-size: 13.5px;
    border-bottom: 1px dashed var(--line);
  }

  .lines li:last-child {
    border-bottom: 0;
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

  .relief {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
    margin: 10px 0 0;
    padding-top: 10px;
    border-top: 1px dashed var(--line);
    font-size: 13.5px;
    font-weight: 600;
    color: var(--accent-ink);
  }

  .relief-note {
    font-size: 12.5px;
    color: var(--ink-3);
    margin: 8px 0 0;
    line-height: 1.6;
  }

  .relief-note.blocked {
    padding: 9px 12px;
    background: var(--surface-2);
    border-radius: 8px;
    color: var(--ink-2);
  }

  .total {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin: 14px 0 0;
    padding-top: 13px;
    border-top: 2px solid var(--line-strong);
    font-size: 14.5px;
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

  /* ---- 세율표 ---- */
  .rate-cell {
    font-weight: 600;
    color: var(--ink-2);
  }

  .rate-cell.heavy {
    color: var(--interest);
  }

  tbody tr td.here {
    background: var(--accent-soft);
    color: var(--accent-ink);
    font-weight: 700;
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  .std {
    font-family: var(--f-body);
    font-size: 10.5px;
    font-weight: 500;
    color: var(--ink-3);
    margin-left: 6px;
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 1px 6px;
  }

  .table-note {
    font-size: 12.5px;
    color: var(--ink-3);
    margin: 13px 0 0;
    line-height: 1.65;
    max-width: 65ch;
  }
</style>
