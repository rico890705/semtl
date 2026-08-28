<script lang="ts">
  /**
   * 계산기 카드 한 장.
   *
   * 정적 목록(CalculatorGrid.astro)과 검색 결과(CalculatorSearch.svelte)가
   * 같은 컴포넌트를 쓴다. client 지시어 없이 쓰면 JS 없이 HTML만 나간다.
   */
  import type { CalculatorMeta } from '../lib/site';

  interface Props {
    meta: CalculatorMeta;
    /** 검색에서 별칭 때문에 걸렸다면 그 별칭 */
    via?: string;
    /** 키보드로 선택된 상태 */
    selected?: boolean;
  }

  let { meta, via, selected = false }: Props = $props();

  const live = $derived(meta.status === 'live');
</script>

{#if live}
  <a class="card-item" class:selected href={`/${meta.slug}`} data-slug={meta.slug}>
    <span class="t">
      {meta.title}
      {#if via}<span class="via">{via}</span>{/if}
    </span>
    <span class="d">{meta.summary}</span>
  </a>
{:else}
  <div class="card-item soon" class:selected data-slug={meta.slug}>
    <span class="t">
      {meta.title}
      <span class="tag">준비 중</span>
      {#if via}<span class="via">{via}</span>{/if}
    </span>
    <span class="d">{meta.summary}</span>
  </div>
{/if}

<style>
  .card-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-decoration: none;
    padding: 15px 17px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
    transition:
      border-color 0.15s,
      transform 0.15s;
  }

  a.card-item:hover,
  a.card-item.selected {
    border-color: var(--accent);
    transform: translateY(-1px);
  }

  a.card-item.selected {
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .soon {
    background: transparent;
    border-style: dashed;
  }

  .t {
    font-size: 14.5px;
    font-weight: 600;
    color: var(--ink);
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
  }

  .soon .t {
    color: var(--ink-2);
  }

  .tag {
    font-size: 11px;
    font-weight: 500;
    font-family: var(--f-mono);
    color: var(--ink-3);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 1px 7px;
  }

  /* 무엇 때문에 검색에 걸렸는지 — "복비"로 찾았을 때 이유가 보여야 안심이 된다 */
  .via {
    font-size: 11px;
    font-weight: 600;
    font-family: var(--f-mono);
    color: var(--accent-ink);
    background: var(--accent-soft);
    border-radius: 999px;
    padding: 1px 8px;
  }

  .d {
    font-size: 12.5px;
    color: var(--ink-3);
    line-height: 1.5;
  }
</style>
