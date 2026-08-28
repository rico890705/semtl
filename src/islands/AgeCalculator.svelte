<script lang="ts">
  /**
   * 만 나이 계산기 위젯.
   *
   * 만 나이 통일법 이후에도 연 나이(병역·청소년보호법)와 세는 나이가 함께 쓰인다.
   * 셋을 나란히 놓는 것이 이 계산기의 핵심이다.
   * "술은 되는데 왜 성인이 아니지" 같은 혼란이 대부분 만 나이와 연 나이의 차이에서 온다.
   */
  import { onMount } from 'svelte';
  import { calculateAge } from '../lib/calc/age';
  import { won } from '../lib/format';

  interface Props {
    /** 빌드 시점 날짜 — SSR과 클라이언트가 같은 값을 그리도록 페이지에서 넘긴다 */
    defaultBaseDate: string;
    defaultBirthDate: string;
  }

  let { defaultBaseDate, defaultBirthDate }: Props = $props();

  const STORAGE_KEY = 'semtl:age';

  let birthDate = $state(defaultBirthDate);
  let baseDate = $state(defaultBaseDate);
  let ready = $state(false);
  let copied = $state(false);

  const result = $derived(calculateAge({ birthDate, baseDate }));
  const upcoming = $derived(result.milestones.filter((m) => !m.reached));
  const reached = $derived(result.milestones.filter((m) => m.reached));

  const query = $derived(`?birth=${birthDate}&on=${baseDate}`);
  const shareUrl = $derived(ready ? `${location.origin}${location.pathname}${query}` : '');

  onMount(() => {
    const p = new URLSearchParams(location.search);
    if (p.has('birth')) {
      birthDate = p.get('birth') ?? birthDate;
      baseDate = p.get('on') ?? baseDate;
    } else {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const s = JSON.parse(saved);
          if (typeof s.birthDate === 'string') birthDate = s.birthDate;
        }
      } catch {
        /* 저장값이 깨졌거나 접근 불가 — 기본값으로 시작 */
      }
      // 기준일은 저장하지 않고 실제 오늘로 맞춘다. 나이는 하루만 틀려도 틀린 값이다.
      const now = new Date();
      baseDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
        .toISOString()
        .slice(0, 10);
    }
    ready = true;
  });

  $effect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ birthDate }));
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
      <div class="card-head"><p class="card-title">생년월일 입력</p></div>
      <form class="form" autocomplete="off" onsubmit={(e) => e.preventDefault()}>
        <div class="field">
          <label class="field-label" for="age-birth">생년월일</label>
          <input id="age-birth" type="date" bind:value={birthDate} />
        </div>

        <div class="field">
          <label class="field-label" for="age-base">기준일</label>
          <input id="age-base" type="date" bind:value={baseDate} />
          <p class="field-note">보통 오늘입니다. 특정 날짜의 나이가 궁금하면 바꿔보세요.</p>
        </div>
      </form>
    </div>
  </div>

  <div class="results">
    {#if !result.valid}
      <div class="card notice"><p class="notice-title">{result.reason}</p></div>
    {:else}
      <div class="card">
        <div class="headline">
          <p class="k">만 나이</p>
          <p class="v num">{result.koreanAge}<small>세</small></p>
          <p class="sub">
            {result.detail.years}년 {result.detail.months}개월 {result.detail.days}일 ·
            태어난 지 {won(result.totalDays)}일
          </p>
        </div>

        <div class="figs">
          <div class="fig">
            <p class="k">연 나이</p>
            <p class="v num">{result.yearAge}<small>세</small></p>
            <p class="n">병역·청소년보호법</p>
          </div>
          <div class="fig">
            <p class="k">세는 나이</p>
            <p class="v num">{result.countingAge}<small>세</small></p>
            <p class="n">일상 대화</p>
          </div>
          <div class="fig">
            <p class="k">다음 생일</p>
            <p class="v num">{result.daysToNextBirthday}<small>일 뒤</small></p>
            <p class="n">{result.nextBirthdayDate}</p>
          </div>
        </div>

        <div class="explain">
          <p>
            {#if result.birthdayPassed}
              올해 생일이 지나 <strong>만 나이와 연 나이가 같습니다.</strong>
            {:else}
              올해 생일이 아직이라 <strong>만 나이가 연 나이보다 한 살 적습니다.</strong>
              생일이 지나면 같아집니다.
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

      {#if upcoming.length > 0}
        <div class="card">
          <div class="card-head"><p class="card-title">앞으로 도달하는 기준</p></div>
          <ul class="lines">
            {#each upcoming as m (m.label)}
              <li>
                <span class="l">
                  {m.yearBased ? '연' : '만'} {m.age}세
                  <span class="label">{m.label}</span>
                </span>
                <span class="a">
                  <span class="num date">{m.date}</span>
                  <span class="num left">{won(m.daysLeft)}일 뒤</span>
                </span>
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if reached.length > 0}
        <div class="card">
          <div class="card-head"><p class="card-title">이미 지난 기준</p></div>
          <ul class="lines past">
            {#each reached as m (m.label)}
              <li>
                <span class="l">
                  {m.yearBased ? '연' : '만'} {m.age}세
                  <span class="label">{m.label}</span>
                </span>
                <span class="a"><span class="num date">{m.date}</span></span>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
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
    padding: 22px 24px 24px;
  }

  .headline .k {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--ink-3);
    margin: 0 0 4px;
  }

  .headline .v {
    font-size: clamp(40px, 8vw, 60px);
    font-weight: 600;
    line-height: 1;
    letter-spacing: -0.02em;
    color: var(--accent-ink);
    margin: 0;
  }

  .headline .v small {
    font-size: 0.38em;
    font-weight: 500;
    color: var(--ink-2);
    margin-left: 5px;
  }

  .headline .sub {
    font-size: 13.5px;
    color: var(--ink-3);
    margin: 9px 0 0;
  }

  .figs {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
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
    font-size: 22px;
    font-weight: 600;
    letter-spacing: -0.01em;
    margin: 0;
  }

  .fig .v small {
    font-size: 0.55em;
    font-weight: 500;
    color: var(--ink-3);
    margin-left: 3px;
  }

  .fig .n {
    font-size: 11.5px;
    color: var(--ink-3);
    margin: 3px 0 0;
  }

  .explain {
    padding: 15px 24px;
    border-top: 1px solid var(--line);
    background: var(--surface-2);
  }

  .explain p {
    margin: 0;
    font-size: 13.5px;
    color: var(--ink-2);
    line-height: 1.65;
  }

  .explain strong {
    color: var(--ink);
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

  .lines {
    list-style: none;
    margin: 0;
    padding: 4px 24px 18px;
  }

  .lines li {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 14px;
    padding: 10px 0;
    border-bottom: 1px dashed var(--line);
    font-size: 13.5px;
    flex-wrap: wrap;
  }

  .lines li:last-child {
    border-bottom: 0;
  }

  .lines .l {
    color: var(--ink);
    font-weight: 600;
    display: flex;
    align-items: baseline;
    gap: 9px;
    flex-wrap: wrap;
  }

  .lines .label {
    font-weight: 400;
    color: var(--ink-2);
  }

  .lines .a {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-left: auto;
  }

  .lines .date {
    font-size: 12.5px;
    color: var(--ink-3);
  }

  .lines .left {
    font-weight: 600;
    color: var(--accent-ink);
    white-space: nowrap;
  }

  .past {
    opacity: 0.65;
  }
</style>
