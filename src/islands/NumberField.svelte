<script lang="ts">
  /**
   * 숫자 입력 필드 — 모든 계산기가 공유하는 부품.
   *
   * 신경 쓴 것:
   *  - 천 단위 콤마를 입력 중에도 유지하되 캐럿이 끝으로 튀지 않게 위치를 보정한다
   *  - inputmode 로 모바일에서 숫자 키패드가 뜬다 (트래픽 대부분이 모바일)
   *  - 슬라이더와 입력창이 같은 값을 양방향으로 공유한다
   */
  import { won } from '../lib/format';

  interface Chip {
    label: string;
    value: number;
  }

  interface Props {
    id: string;
    label: string;
    unit: string;
    value: number;
    min?: number;
    max?: number;
    /** 소수점 자릿수. 0이면 콤마 표기를 쓴다. */
    decimals?: number;
    /** 라벨 우측의 보조 표기 (예: "3억원") */
    hint?: string;
    sliderMin?: number;
    sliderMax?: number;
    sliderStep?: number;
    chips?: Chip[];
  }

  let {
    id,
    label,
    unit,
    value = $bindable(),
    min = 0,
    max = Number.MAX_SAFE_INTEGER,
    decimals = 0,
    hint,
    sliderMin,
    sliderMax,
    sliderStep = 1,
    chips,
  }: Props = $props();

  let focused = $state(false);

  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const display = (n: number) => (decimals > 0 ? String(n) : won(n));

  // 포커스 중에는 사용자가 친 텍스트를 그대로 두고, 벗어나면 정규화한다
  let text = $state(display(value));
  $effect(() => {
    if (!focused) text = display(value);
  });

  const hasSlider = sliderMin !== undefined && sliderMax !== undefined;
  const sliderValue = $derived(
    hasSlider ? Math.min(sliderMax!, Math.max(sliderMin!, value)) : value,
  );

  function onInput(event: Event) {
    const el = event.currentTarget as HTMLInputElement;
    const raw = el.value;
    const caret = el.selectionStart ?? raw.length;
    const digitsBeforeCaret = raw.slice(0, caret).replace(/[^0-9]/g, '').length;

    if (decimals > 0) {
      const cleaned = raw.replace(/[^0-9.]/g, '');
      text = cleaned;
      const parsed = Number.parseFloat(cleaned);
      if (Number.isFinite(parsed)) value = clamp(parsed);
      return;
    }

    const digits = raw.replace(/[^0-9]/g, '');
    if (digits === '') {
      text = '';
      value = min;
      return;
    }

    value = clamp(Number(digits));
    const formatted = won(value);
    text = formatted;

    // 콤마가 늘거나 줄어도 같은 자릿수 위치에 캐럿이 남도록 되돌린다
    queueMicrotask(() => {
      let seen = 0;
      let pos = 0;
      while (pos < formatted.length && seen < digitsBeforeCaret) {
        if (formatted.charCodeAt(pos) >= 48 && formatted.charCodeAt(pos) <= 57) seen++;
        pos++;
      }
      el.setSelectionRange(pos, pos);
    });
  }

  function onBlur() {
    focused = false;
    value = clamp(Number.isFinite(value) ? value : min);
    text = display(value);
  }

  function onSlider(event: Event) {
    value = clamp(Number((event.currentTarget as HTMLInputElement).value));
  }
</script>

<div class="field">
  <label for={id}>
    {label}
    {#if hint}<span class="hint">{hint}</span>{/if}
  </label>

  <div class="textin">
    <input
      {id}
      type="text"
      inputmode={decimals > 0 ? 'decimal' : 'numeric'}
      autocomplete="off"
      value={text}
      oninput={onInput}
      onfocus={() => (focused = true)}
      onblur={onBlur}
    />
    <span class="unit">{unit}</span>
  </div>

  {#if hasSlider}
    <input
      class="slider"
      type="range"
      min={sliderMin}
      max={sliderMax}
      step={sliderStep}
      value={sliderValue}
      oninput={onSlider}
      aria-label={`${label} 슬라이더`}
    />
  {/if}

  {#if chips?.length}
    <div class="chips">
      {#each chips as chip (chip.value)}
        <button
          type="button"
          class="chip"
          aria-pressed={value === chip.value}
          onclick={() => (value = clamp(chip.value))}
        >
          {chip.label}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  label {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
  }

  .hint {
    font-size: 12.5px;
    font-weight: 400;
    color: var(--ink-3);
    font-family: var(--f-mono);
  }

  .textin {
    display: flex;
    align-items: center;
    border: 1px solid var(--line-strong);
    border-radius: 9px;
    background: var(--ground);
    overflow: hidden;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }

  .textin:focus-within {
    border-color: var(--focus);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .textin input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    padding: 11px 0 11px 13px;
    font-family: var(--f-mono);
    font-size: 17px;
    font-weight: 500;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .textin input:focus {
    outline: none;
  }

  .unit {
    padding: 0 13px 0 7px;
    font-size: 14px;
    color: var(--ink-3);
    font-weight: 500;
    white-space: nowrap;
  }

  .slider {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 4px;
    border-radius: 999px;
    background: var(--surface-2);
    margin: 2px 0;
    cursor: pointer;
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 17px;
    height: 17px;
    border-radius: 50%;
    background: var(--accent);
    border: 3px solid var(--surface);
    box-shadow: 0 0 0 1px var(--accent);
  }

  .slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--accent);
    border: 3px solid var(--surface);
    box-shadow: 0 0 0 1px var(--accent);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chip {
    font-family: var(--f-body);
    font-size: 13px;
    font-weight: 500;
    padding: 5px 11px;
    border-radius: 7px;
    border: 1px solid var(--line);
    background: var(--surface);
    color: var(--ink-2);
    cursor: pointer;
    transition: all 0.13s;
  }

  .chip:hover {
    border-color: var(--line-strong);
    color: var(--ink);
  }

  .chip[aria-pressed='true'] {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent-ink);
  }
</style>
