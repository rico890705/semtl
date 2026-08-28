/**
 * 계산기 검색.
 *
 * 한국어 검색에서 실제로 문제가 되는 두 가지를 처리한다.
 *
 * 1) 조합 중인 글자
 *    "대출"을 치는 도중의 상태는 ㄷ → 대 → 댗 → 대추 → 대출 이다.
 *    "댗"은 "대출"의 부분 문자열이 아니라서 단순 includes로는 결과가 사라졌다 나타난다.
 *    글자를 자모로 풀어두면 ㄷㅐㅊ 이 ㄷㅐㅊㅜㄹ 의 접두사가 되어 매끄럽게 이어진다.
 *
 * 2) 초성 검색
 *    한국 사용자는 "ㄷㅊ"으로 대출을, "ㅅㅅㄹㅇ"으로 실수령액을 찾는다.
 *
 * 서버가 없으므로 전부 브라우저에서 돈다. 계산기가 수백 개가 되어도
 * 인덱스는 수십 KB 수준이라 이 방식으로 충분하다.
 */
import { CALCULATORS, CATEGORIES, type CalculatorMeta } from './site.ts';

const CHO = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

/**
 * 겹모음과 겹받침은 키를 두 번 눌러 만들어지므로 눌린 순서대로 풀어서 저장한다.
 * 그래야 "퇴직금"을 치는 도중의 "토"(ㅌㅗ)가 "ㅌㅗㅣㅈ..."의 접두사가 되어
 * 결과가 한 글자 동안 사라지는 일이 없다.
 * 된소리(ㄲㄸㅃㅆㅉ)는 한 번에 입력되므로 풀지 않는다.
 */
const JUNG = [
  'ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅗㅏ', 'ㅗㅐ',
  'ㅗㅣ', 'ㅛ', 'ㅜ', 'ㅜㅓ', 'ㅜㅔ', 'ㅜㅣ', 'ㅠ', 'ㅡ', 'ㅡㅣ', 'ㅣ',
];

const JONG = [
  '', 'ㄱ', 'ㄲ', 'ㄱㅅ', 'ㄴ', 'ㄴㅈ', 'ㄴㅎ', 'ㄷ', 'ㄹ', 'ㄹㄱ', 'ㄹㅁ', 'ㄹㅂ', 'ㄹㅅ', 'ㄹㅌ',
  'ㄹㅍ', 'ㄹㅎ', 'ㅁ', 'ㅂ', 'ㅂㅅ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;

/** 공백과 대소문자, 가운뎃점을 지운다 */
export function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s·・.,\-_()]/g, '');
}

/** "대출" → "ㄷㅐㅊㅜㄹ". 한글이 아닌 글자는 그대로 둔다. */
export function toJamo(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= HANGUL_START && code <= HANGUL_END) {
      const offset = code - HANGUL_START;
      out += CHO[Math.floor(offset / 588)];
      out += JUNG[Math.floor((offset % 588) / 28)];
      out += JONG[offset % 28];
    } else {
      out += ch;
    }
  }
  return out;
}

/** "대출" → "ㄷㅊ". 초성 검색용. */
export function toChoseong(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= HANGUL_START && code <= HANGUL_END) {
      out += CHO[Math.floor((code - HANGUL_START) / 588)];
    } else {
      out += ch;
    }
  }
  return out;
}

/** 자음만으로 이뤄진 질의인가 (ㄱ~ㅎ, 모음 없음) */
export function isChoseongQuery(query: string): boolean {
  return /^[ㄱ-ㅎ]+$/.test(query);
}

interface IndexField {
  text: string;
  jamo: string;
  cho: string;
  /** 이 필드에서 걸렸을 때의 기본 점수 */
  base: number;
  /** 별칭으로 걸린 경우 결과에 그 별칭을 보여주기 위해 */
  keyword?: string;
}

interface IndexEntry {
  meta: CalculatorMeta;
  order: number;
  fields: IndexField[];
}

function field(text: string, base: number, keyword?: string): IndexField {
  const norm = normalize(text);
  return { text: norm, jamo: toJamo(norm), cho: toChoseong(norm), base, keyword };
}

export function buildIndex(list: CalculatorMeta[] = CALCULATORS): IndexEntry[] {
  return list.map((meta, order) => {
    const categoryLabel = CATEGORIES.find((c) => c.id === meta.category)?.label ?? '';
    const fields: IndexField[] = [
      field(meta.title, 70),
      field(meta.short, 62),
      ...(meta.keywords ?? []).map((k) => field(k, 52, k)),
      field(meta.summary, 18),
      field(categoryLabel, 14),
      field(meta.slug, 30),
    ];
    return { meta, order, fields };
  });
}

/** 완전일치 > 접두사 > 포함 순으로 가산한다 */
function positional(hay: string, needle: string, base: number): number {
  if (!needle || !hay) return 0;
  if (hay === needle) return base + 30;
  if (hay.startsWith(needle)) return base + 15;
  if (hay.includes(needle)) return base;
  return 0;
}

export interface SearchHit {
  meta: CalculatorMeta;
  score: number;
  /** 별칭 때문에 걸렸다면 그 별칭 — "복비"로 찾았을 때 이유를 보여준다 */
  via?: string;
}

export function search(rawQuery: string, index: IndexEntry[] = buildIndex()): SearchHit[] {
  const query = normalize(rawQuery);
  if (!query) return [];

  const queryJamo = toJamo(query);
  const choseongMode = isChoseongQuery(query);

  const hits: SearchHit[] = [];

  for (const entry of index) {
    let best = 0;
    let via: string | undefined;

    for (const f of entry.fields) {
      // 글자 그대로 맞는 경우가 가장 강하다
      let score = positional(f.text, query, f.base);

      // 조합 중인 글자를 위해 자모로 풀어서 한 번 더 (가중치는 조금 낮게)
      const jamoScore = positional(f.jamo, queryJamo, f.base - 12);
      if (jamoScore > score) score = jamoScore;

      // 초성 검색은 자음만 친 경우에만 — 안 그러면 오탐이 쏟아진다
      if (choseongMode) {
        const choScore = positional(f.cho, query, f.base - 22);
        if (choScore > score) score = choScore;
      }

      if (score > best) {
        best = score;
        via = f.keyword;
      }
    }

    if (best > 0) hits.push({ meta: entry.meta, score: best, via });
  }

  return hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // 점수가 같으면 실제로 쓸 수 있는 계산기를 먼저
    const liveDiff = Number(b.meta.status === 'live') - Number(a.meta.status === 'live');
    if (liveDiff !== 0) return liveDiff;
    return a.meta.title.localeCompare(b.meta.title, 'ko');
  });
}
