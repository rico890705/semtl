<script lang="ts">
  /**
   * 메인 검색.
   *
   * 질의가 없으면 분류별 전체 목록을, 있으면 점수순 결과를 보여준다.
   * 서버 렌더링 시점에는 질의가 없으므로 전체 목록이 HTML에 그대로 담긴다 —
   * JS가 없어도, 크롤러가 와도 계산기 목록은 온전히 보인다.
   */
  import { onMount } from 'svelte';
  import { buildIndex, search } from '../lib/search';
  import { CATEGORIES, calculatorsIn, CALCULATORS } from '../lib/site';
  import CalculatorCard from '../components/CalculatorCard.svelte';

  const index = buildIndex();

  let query = $state('');
  let selected = $state(-1);
  let composing = $state(false);
  let inputEl: HTMLInputElement | undefined = $state();

  const hits = $derived(query.trim() ? search(query, index) : []);
  const searching = $derived(query.trim().length > 0);

  // 질의가 바뀌면 선택을 첫 결과로 되돌린다
  $effect(() => {
    void hits;
    selected = -1;
  });

  // /?q=대출 로 들어오면 바로 검색된 상태로 시작한다 (구조화 데이터의 SearchAction과 짝)
  onMount(() => {
    const q = new URLSearchParams(location.search).get('q');
    if (q) query = q;
  });

  /**
   * 키보드 이동은 실제로 열 수 있는 계산기만 거친다.
   * 아직 안 만든 계산기에 선택이 멈추면 Enter를 눌러도 아무 일이 없어 고장으로 보인다.
   */
  const openable = $derived(
    hits.reduce<number[]>((acc, hit, i) => {
      if (hit.meta.status === 'live') acc.push(i);
      return acc;
    }, []),
  );

  function move(delta: number) {
    if (!openable.length) return;
    const pos = openable.indexOf(selected);
    const next =
      pos === -1
        ? delta > 0
          ? 0
          : openable.length - 1
        : (pos + delta + openable.length) % openable.length;
    selected = openable[next];
  }

  function go() {
    const index = selected >= 0 ? selected : openable[0];
    const hit = index === undefined ? undefined : hits[index];
    if (hit?.meta.status === 'live') location.href = `/${hit.meta.slug}`;
  }

  function onKeydown(event: KeyboardEvent) {
    // 한글 조합을 확정하는 Enter를 이동으로 오해하면 안 된다
    if (event.isComposing || composing) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go();
    } else if (event.key === 'Escape') {
      if (query) {
        query = '';
      } else {
        inputEl?.blur();
      }
    }
  }

  function clear() {
    query = '';
    inputEl?.focus();
  }

  // 데스크톱에서 "/" 로 검색창에 바로 들어간다
  function onGlobalKeydown(event: KeyboardEvent) {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
    event.preventDefault();
    inputEl?.focus();
  }
</script>

<svelte:window onkeydown={onGlobalKeydown} />

<div class="searchbox">
  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7"></circle>
    <path d="m20 20-3.5-3.5"></path>
  </svg>

  <input
    bind:this={inputEl}
    bind:value={query}
    type="search"
    role="combobox"
    aria-expanded={searching}
    aria-controls="search-results"
    aria-label="계산기 검색"
    placeholder="무엇을 계산하시나요? (예: 대출, ㅌㅈㄱ, 복비)"
    autocomplete="off"
    spellcheck="false"
    onkeydown={onKeydown}
    oncompositionstart={() => (composing = true)}
    oncompositionend={() => (composing = false)}
  />

  {#if query}
    <button type="button" class="clear" onclick={clear} aria-label="검색어 지우기">✕</button>
  {:else}
    <kbd class="hint">/</kbd>
  {/if}
</div>

<div id="search-results" aria-live="polite">
  {#if searching}
    {#if hits.length}
      <section class="block">
        <p class="count">
          <strong>{hits.length}개</strong> 찾았습니다
          {#if openable.length}
            <span class="nav-hint">↑↓ 이동 · Enter 열기</span>
          {/if}
        </p>
        <div class="grid">
          {#each hits as hit, i (hit.meta.slug)}
            <CalculatorCard meta={hit.meta} via={hit.via} selected={i === selected} />
          {/each}
        </div>
      </section>
    {:else}
      <section class="block empty">
        <p class="empty-title">"{query}"에 해당하는 계산기가 없습니다</p>
        <p class="empty-sub">
          초성으로도 찾을 수 있습니다 — <code>ㄷㅊ</code>은 대출,
          <code>ㅅㅅㄹㅇ</code>은 실수령액입니다.
        </p>
        <p class="empty-sub">
          찾으시는 계산기가 없다면 <a href="/contact">알려주세요</a>. 현재
          {CALCULATORS.length}개를 만들고 있습니다.
        </p>
      </section>
    {/if}
  {:else}
    {#each CATEGORIES as category (category.id)}
      {@const items = calculatorsIn(category.id)}
      {#if items.length}
        <section class="block">
          <h2>{category.label}</h2>
          <p class="block-sub">{category.blurb}</p>
          <div class="grid">
            {#each items as item (item.slug)}
              <CalculatorCard meta={item} />
            {/each}
          </div>
        </section>
      {/if}
    {/each}
  {/if}
</div>

<style>
  .searchbox {
    display: flex;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    background: var(--surface);
    padding: 0 14px;
    margin: 26px 0 8px;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }

  .searchbox:focus-within {
    border-color: var(--focus);
    box-shadow: 0 0 0 4px var(--accent-soft);
  }

  .icon {
    width: 19px;
    height: 19px;
    color: var(--ink-3);
    flex: none;
  }

  input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    padding: 15px 0;
    font-family: var(--f-body);
    font-size: 16px;
    color: var(--ink);
  }

  input:focus {
    outline: none;
  }

  input::placeholder {
    color: var(--ink-3);
  }

  /* 브라우저 기본 검색 지우기 버튼 — 우리 버튼과 겹치므로 숨긴다 */
  input::-webkit-search-cancel-button {
    -webkit-appearance: none;
    appearance: none;
  }

  .clear {
    border: 0;
    background: var(--surface-2);
    color: var(--ink-2);
    border-radius: 999px;
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    cursor: pointer;
    font-size: 12px;
    flex: none;
  }

  .clear:hover {
    color: var(--ink);
  }

  .hint {
    font-family: var(--f-mono);
    font-size: 12px;
    color: var(--ink-3);
    border: 1px solid var(--line);
    border-bottom-width: 2px;
    border-radius: 5px;
    padding: 1px 7px;
    flex: none;
  }

  /* 모바일에는 키보드 단축키가 의미 없다 */
  @media (max-width: 720px) {
    .hint {
      display: none;
    }
  }

  .grid {
    display: grid;
    gap: 10px;
    grid-template-columns: repeat(auto-fit, minmax(215px, 1fr));
  }

  .count {
    font-size: 13.5px;
    color: var(--ink-3);
    margin: 0 0 14px;
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
  }

  .count strong {
    color: var(--ink);
    font-weight: 600;
  }

  .nav-hint {
    font-family: var(--f-mono);
    font-size: 12px;
    color: var(--ink-3);
  }

  @media (max-width: 720px) {
    .nav-hint {
      display: none;
    }
  }

  .empty {
    border: 1px dashed var(--line-strong);
    border-radius: 12px;
    padding: 28px 22px;
    text-align: center;
  }

  .empty-title {
    font-size: 15.5px;
    font-weight: 600;
    color: var(--ink);
    margin: 0 0 8px;
  }

  .empty-sub {
    font-size: 13.5px;
    color: var(--ink-3);
    margin: 0 0 4px;
  }

  .empty-sub code {
    font-family: var(--f-mono);
    font-size: 12.5px;
    background: var(--surface-2);
    color: var(--ink);
    padding: 1px 6px;
    border-radius: 4px;
  }
</style>
