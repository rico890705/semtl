/**
 * 검색 검증.
 *
 * 자모 분해와 초성 매칭은 조용히 깨지기 쉬운 종류의 코드다.
 * 사람들이 실제로 칠 법한 질의를 그대로 테스트에 넣어둔다.
 *
 *   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { search, toJamo, toChoseong, isChoseongQuery, normalize } from './search.ts';

const top = (query: string) => search(query)[0]?.meta.slug;
const slugs = (query: string) => search(query).map((hit) => hit.meta.slug);

test('한글을 자모로 분해한다', () => {
  assert.equal(toJamo('대출'), 'ㄷㅐㅊㅜㄹ');
  assert.equal(toJamo('abc'), 'abc');
});

test('겹모음과 겹받침을 눌린 순서대로 푼다', () => {
  assert.equal(toJamo('퇴직금'), 'ㅌㅗㅣㅈㅣㄱㄱㅡㅁ'); // ㅚ → ㅗㅣ
  assert.equal(toJamo('과'), 'ㄱㅗㅏ'); // ㅘ → ㅗㅏ
  assert.equal(toJamo('닭'), 'ㄷㅏㄹㄱ'); // ㄺ → ㄹㄱ
  assert.equal(toJamo('의'), 'ㅇㅡㅣ'); // ㅢ → ㅡㅣ
  assert.equal(toJamo('있'), 'ㅇㅣㅆ'); // 된소리는 그대로
});

test('겹모음이 든 말도 타이핑 도중 결과가 끊기지 않는다', () => {
  // "퇴직금"은 ㅌ → 토 → 퇴 → 퇴ㅈ → 퇴지 → 퇴직 → ... 순으로 지나간다
  for (const partial of ['ㅌ', '토', '퇴', '퇴지', '퇴직', '퇴직금']) {
    assert.equal(top(partial), 'severance', `"${partial}" 입력에서 결과가 어긋남`);
  }
});

test('초성만 뽑아낸다', () => {
  assert.equal(toChoseong('대출'), 'ㄷㅊ');
  assert.equal(toChoseong('실수령액'), 'ㅅㅅㄹㅇ');
  assert.equal(toChoseong('중개보수'), 'ㅈㄱㅂㅅ');
});

test('자음만으로 이뤄진 질의를 구분한다', () => {
  assert.equal(isChoseongQuery('ㄷㅊ'), true);
  assert.equal(isChoseongQuery('대출'), false);
  assert.equal(isChoseongQuery('대ㅊ'), false);
  assert.equal(isChoseongQuery('ㅏㅑ'), false);
});

test('공백과 가운뎃점을 무시한다', () => {
  assert.equal(normalize('연봉 실수령액'), '연봉실수령액');
  assert.equal(normalize('국민연금·건강보험'), '국민연금건강보험');
  assert.equal(top('연봉 실수령액'), 'salary');
});

test('정식 명칭으로 찾는다', () => {
  assert.equal(top('대출'), 'loan');
  assert.equal(top('퇴직금'), 'severance');
  assert.equal(top('종합소득세'), 'income-tax');
  assert.equal(top('취득세'), 'acquisition-tax');
});

test('초성으로 찾는다', () => {
  assert.equal(top('ㄷㅊ'), 'loan');
  assert.equal(top('ㅌㅈㄱ'), 'severance');
  assert.equal(top('ㅅㅅㄹㅇ'), 'salary');
  assert.equal(top('ㅈㄱㅂㅅ'), 'brokerage-fee');
});

test('조합 중인 글자에도 결과가 끊기지 않는다', () => {
  // "대출"을 치는 도중의 모든 상태에서 대출 계산기가 1순위여야 한다
  for (const partial of ['ㄷ', '대', '댗', '대추', '대출']) {
    assert.equal(top(partial), 'loan', `"${partial}" 입력에서 결과가 어긋남`);
  }
});

test('별칭으로 찾고, 어떤 별칭에 걸렸는지 알려준다', () => {
  const [hit] = search('복비');
  assert.equal(hit.meta.slug, 'brokerage-fee');
  assert.equal(hit.via, '복비');

  assert.equal(top('연봉계산기'), 'salary');
  assert.equal(top('주담대'), 'loan');
  assert.equal(top('종소세'), 'income-tax');
  assert.equal(top('적금'), 'savings');
  assert.equal(top('만나이'), 'korean-age');
});

test('영문 약어도 찾는다', () => {
  assert.equal(top('dsr'), 'dsr');
  assert.equal(top('DSR'), 'dsr');
  assert.equal(top('ltv'), 'dsr');
});

test('제목보다 별칭이, 별칭보다 요약이 낮게 잡힌다', () => {
  const results = search('이자');
  // "이자 계산기"라는 이름은 없지만 대출과 예적금이 별칭으로 걸린다
  assert.ok(results.length >= 2);
  assert.ok(results.every((hit) => hit.score > 0));
  // 점수 내림차순 정렬
  for (let i = 1; i < results.length; i++) {
    assert.ok(results[i - 1].score >= results[i].score);
  }
});

test('같은 점수면 실제로 쓸 수 있는 계산기를 먼저 보여준다', () => {
  const results = search('계산기');
  const liveIndex = results.findIndex((hit) => hit.meta.status === 'live');
  const plannedIndex = results.findIndex((hit) => hit.meta.status === 'planned');
  if (liveIndex !== -1 && plannedIndex !== -1) {
    const live = results[liveIndex];
    const planned = results[plannedIndex];
    if (live.score === planned.score) assert.ok(liveIndex < plannedIndex);
  }
});

test('빈 질의와 없는 말은 결과가 없다', () => {
  assert.deepEqual(search(''), []);
  assert.deepEqual(search('   '), []);
  assert.deepEqual(slugs('쿼카사진'), []);
});

test('초성 매칭이 모음 섞인 질의로 새지 않는다', () => {
  // "ㄷㅊ"은 초성 매칭이지만 "다차"는 아니어야 한다
  assert.equal(top('ㄷㅊ'), 'loan');
  assert.deepEqual(slugs('다차'), []);
});
