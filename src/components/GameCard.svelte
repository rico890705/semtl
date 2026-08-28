<script lang="ts">
  /**
   * 게임 카드 한 장.
   *
   * 계산기 카드와 형태는 같지만 두 가지가 다르다.
   *  - 다른 도메인으로 나가므로 새 탭에서 연다
   *  - 계산기(초록)와 구분되게 브랜드 오렌지를 쓴다
   *
   * client 지시어 없이 쓰면 JS 없이 HTML만 나간다.
   */
  import type { GameMeta } from '../lib/site';

  interface Props {
    game: GameMeta;
    /** 검색에서 별칭 때문에 걸렸다면 그 별칭 */
    via?: string;
    /** 키보드로 선택된 상태 */
    selected?: boolean;
  }

  let { game, via, selected = false }: Props = $props();
</script>

<a
  class="card-item game"
  class:selected
  href={game.url}
  target="_blank"
  rel="noopener noreferrer"
  data-slug={game.slug}
  aria-label={`${game.title} — 새 탭에서 열립니다`}
>
  <span class="t">
    {game.title}
    <span class="tag">게임</span>
    {#if via}<span class="via">{via}</span>{/if}
    <svg class="out" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M7 17 17 7M9 7h8v8"></path>
    </svg>
  </span>
  <span class="d">{game.summary}</span>
</a>

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

  .card-item:hover,
  .card-item.selected {
    border-color: var(--brand-orange);
    transform: translateY(-1px);
  }

  .card-item.selected {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand-orange) 22%, transparent);
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

  .tag {
    font-size: 11px;
    font-weight: 600;
    font-family: var(--f-mono);
    color: var(--brand-orange);
    border: 1px solid color-mix(in srgb, var(--brand-orange) 40%, transparent);
    border-radius: 999px;
    padding: 1px 7px;
  }

  .via {
    font-size: 11px;
    font-weight: 600;
    font-family: var(--f-mono);
    color: var(--accent-ink);
    background: var(--accent-soft);
    border-radius: 999px;
    padding: 1px 8px;
  }

  /* 새 탭으로 나간다는 신호 */
  .out {
    width: 13px;
    height: 13px;
    color: var(--ink-3);
    margin-left: auto;
    flex: none;
  }

  .card-item:hover .out {
    color: var(--brand-orange);
  }

  .d {
    font-size: 12.5px;
    color: var(--ink-3);
    line-height: 1.5;
  }
</style>
