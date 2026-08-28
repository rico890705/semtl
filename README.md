# 셈틀 (SEMTL)

한국의 금융·직장·부동산 계산기 모음. 모든 계산은 브라우저에서 이뤄지며 입력값은 서버로 전송되지 않습니다.

정적 사이트로 빌드되므로 서버가 필요 없고, 계산기마다 독립 URL을 가집니다.

## 기술 스택

| | |
|---|---|
| 프레임워크 | [Astro](https://astro.build) 7 — 페이지는 정적 HTML, 계산기만 island |
| 위젯 | [Svelte](https://svelte.dev) 5 (runes) |
| 스타일 | 순수 CSS + 디자인 토큰 (`src/styles/tokens.css`) |
| 테스트 | Node.js 내장 테스트 러너 (`node:test`) — 의존성 없음 |
| 타입 | TypeScript strict |

빌드 결과는 정적 파일이라 Cloudflare Pages, Vercel, Netlify 등 어디서나 무료로 호스팅할 수 있습니다.

## 실행

```bash
npm install
npm run dev      # 개발 서버 (http://localhost:4321)
npm run build    # dist/ 에 정적 사이트 생성
npm run preview  # 빌드 결과 미리보기
npm test         # 계산 로직 테스트
npm run check    # 타입 검사
```

## 구조

```
src/
  lib/
    rates/        연도별·제도별 요율과 세율 — 갱신은 여기서만
    calc/         계산 로직. 순수 함수라 DOM도 프레임워크도 모른다
    site.ts       계산기 레지스트리 — 네비·목록·검색·사이트맵의 단일 출처
    search.ts     한글 검색 (자모 분해·초성)
    date.ts       날짜 계산 (UTC 기준)
    format.ts     숫자 표기
  islands/        Svelte 위젯 — 이 파일들만 JS가 나간다
  components/     정적 컴포넌트
  layouts/        Base(문서 뼈대) / Calculator(계산기 페이지 공통)
  pages/          라우트
  styles/         디자인 토큰과 전역 스타일
```

### 계산 로직을 분리한 이유

`src/lib/calc/*.ts`는 순수 함수만 둡니다. DOM도 Svelte도 모릅니다.

- 테스트가 쉽습니다 — 브라우저 없이 `node:test`로 검증합니다
- 계산기끼리 공유합니다 — 예: `insurance.ts`의 4대보험 산식을 실수령액 계산기와 4대보험 계산기가 함께 씁니다
- 프레임워크를 갈아타도 이 파일들은 그대로 남습니다

## 요율 갱신

**세금과 보험료율은 매년 바뀝니다.** 값은 전부 `src/lib/rates/`에 모여 있고, 계산 코드에는 숫자가 하드코딩되어 있지 않습니다.

| 파일 | 내용 | 갱신 시점 |
|---|---|---|
| `rates/2026.ts` | 4대보험 요율, 소득세율, 각종 공제 | 1월 (보험료율), 7월 (국민연금 상·하한) |
| `rates/acquisition.ts` | 취득세율, 생애최초 감면 | 세법 개정 시 |
| `rates/brokerage.ts` | 중개보수 요율 | 법 개정 시 (직전 2021년 10월) |
| `rates/dsr.ts` | DSR 상한, 스트레스 금리 | 금융위 발표 시 |
| `rates/prepayment.ts` | 중도상환수수료율 | 금융사 공시 변경 시 |
| `rates/savings.ts` | 이자소득세율 | 세법 개정 시 |

각 파일 상단에 **대조한 공식 출처**가 `sources` 배열로 들어 있고, 화면 하단 "요율·세율 출처"에도 그대로 노출됩니다. 갱신할 때는 같은 페이지를 다시 확인하면 됩니다.

새 연도를 추가하려면 `rates/2026.ts`를 복사해 값만 바꾸고 `rates/index.ts`에 등록하세요.

### 테스트는 요율에 의존하지 않습니다

테스트는 구체적인 숫자가 아니라 **구조**를 검증합니다 — 합계가 맞는가, 구간 경계가 이어지는가, 두 계산기가 같은 값을 내는가. 그래서 요율을 갱신해도 테스트를 고칠 필요가 없습니다.

## 계산기 추가하기

1. `src/lib/calc/이름.ts` — 순수 함수로 계산 로직
2. `src/lib/calc/이름.test.ts` — 검증
3. `src/islands/이름Calculator.svelte` — 위젯
4. `src/pages/슬러그/index.astro` — 페이지 (`Calculator` 레이아웃 사용)
5. `src/lib/site.ts`의 `CALCULATORS`에 한 줄 추가

레지스트리에 등록하면 네비게이션, 분류 페이지, 검색, 계산기 간 연결, 사이트맵이 자동으로 따라옵니다.

`Calculator` 레이아웃이 빵부스러기, 신뢰 배지, 광고 자리, FAQ, 구조화 데이터(JSON-LD), 요율 출처를 처리하므로 페이지에서는 계산기 본체와 설명 콘텐츠만 채우면 됩니다.

## 설계 원칙

**입력값을 서버로 보내지 않습니다.** 연봉·대출·소득은 민감한 정보입니다. 모든 계산이 브라우저에서 끝나므로 구조적으로 유출될 수 없습니다.

**계산 과정을 보여줍니다.** 숫자만 던지지 않고 어떤 세율이 적용됐고 무엇을 뺐는지 단계별로 펼쳐 보여줍니다.

**색이 정보를 담습니다.** 초록은 갖는 것(원금·실수령액), 벽돌색은 나가는 것(이자·공제·세금)을 뜻합니다. 장식이 아니라 읽는 장치입니다.

**결과를 링크로 공유합니다.** 계산 결과가 주소에 담겨 북마크하면 저장이고 보내면 공유입니다.

## 배포

정적 사이트이므로 빌드 결과인 `dist/`를 서빙하기만 하면 됩니다.

| 설정 | 값 |
|---|---|
| Build Command | `npm run build` |
| **Publish Directory** | **`dist`** |

**Publish Directory를 반드시 `dist`로 지정해야 합니다.** 비워두면 저장소 루트가 서빙되어
루트에 `index.html`이 없으므로 404가 뜨고, 대신 소스코드와 설정 파일이 웹에 그대로
노출됩니다.

도메인이 바뀌면 두 곳을 함께 고쳐야 합니다.

- `astro.config.mjs`의 `site` — canonical URL과 사이트맵의 기준
- `public/robots.txt`의 사이트맵 주소 — 하드코딩이라 자동으로 따라가지 않습니다

## 배포 전 확인

- [ ] 배포 플랫폼의 Publish Directory가 `dist`인지
- [ ] `astro.config.mjs`의 `site`가 실제 도메인인지
- [ ] `public/robots.txt`의 사이트맵 주소
- [x] 문의 메일 — `src/lib/site.ts`의 `SITE.contactEmail`
- [ ] 요율이 최신인지 각 `rates/` 파일의 `sources` 확인
- [ ] 애드센스 승인 후 `.env`에 `PUBLIC_ADSENSE_CLIENT` 설정

## 면책

계산 결과는 참고용입니다. 실제 금액은 금융기관·관계기관의 기준과 개인별 공제 항목에 따라 달라질 수 있습니다. 세무·법률·투자 자문이 아닙니다.
