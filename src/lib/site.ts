/**
 * 사이트 전역 설정과 계산기 레지스트리.
 *
 * 이 파일 하나가 네비게이션, 목록 페이지, 계산기 간 연결(체이닝), 사이트맵을
 * 전부 만들어낸다. 계산기를 추가할 때는 여기에 한 줄 넣고 페이지를 만들면 된다.
 */

export const SITE = {
  name: '셈틀',
  tagline: '숫자로 답하는 계산기',
  description:
    '대출, 급여, 세금, 부동산 계산기를 한곳에서. 모든 계산은 브라우저에서 처리되며 입력값은 서버로 전송되지 않습니다.',
  locale: 'ko_KR',
  // 배포 도메인은 astro.config.mjs의 site가 유일한 출처다. 코드에서는 Astro.site로 읽는다.
} as const;

/**
 * 검색엔진 소유확인 코드.
 *
 * 구글 서치콘솔·네이버 서치어드바이저에서 발급받은 값을 넣으면
 * <head> 에 meta 태그로 나간다. 빈 문자열이면 태그를 내보내지 않는다.
 *
 * 파일 업로드 방식(google-xxxx.html)을 쓴다면 public/ 에 그대로 넣어도 된다.
 * 다만 meta 태그 쪽이 파일이 흩어지지 않아 관리하기 낫다.
 */
export const VERIFICATION = {
  /** google-site-verification */
  google: '',
  /** naver-site-verification */
  naver: '',
  /** msvalidate.01 (Bing) */
  bing: '',
} as const;

export type CategoryId = 'finance' | 'labor' | 'realestate' | 'life';

export const CATEGORIES: { id: CategoryId; label: string; blurb: string }[] = [
  { id: 'finance', label: '금융', blurb: '대출·이자·투자' },
  { id: 'labor', label: '노무', blurb: '급여·퇴직금·수당' },
  { id: 'realestate', label: '부동산', blurb: '취득세·중개보수' },
  { id: 'life', label: '생활', blurb: '날짜·단위·요금' },
];

export interface CalculatorMeta {
  /** URL 경로 (선행 슬래시 없음) */
  slug: string;
  /** 페이지 제목 겸 목록 제목 */
  title: string;
  /** 네비게이션·카드용 짧은 이름 */
  short: string;
  category: CategoryId;
  /** 목록과 meta description에 쓰이는 한 줄 설명 */
  summary: string;
  status: 'live' | 'planned';
  /** 세율·요율이 걸린 계산기는 기준 연도를 표시한다 */
  basisYear?: number;
  /** 이어서 계산할 만한 계산기 slug */
  chain?: string[];
  /**
   * 검색 별칭 — 사람들이 실제로 치는 말을 넣는다.
   * 정식 명칭보다 별칭으로 찾는 경우가 훨씬 많다 ("중개보수"보다 "복비").
   */
  keywords?: string[];
}

export const CALCULATORS: CalculatorMeta[] = [
  {
    slug: 'loan',
    title: '대출 계산기',
    short: '대출',
    category: 'finance',
    summary: '대출금액·금리·기간으로 월 상환액과 총 이자를 계산합니다.',
    status: 'live',
    chain: ['dsr', 'prepayment-fee', 'salary'],
    keywords: ['이자', '이자계산기', '원리금균등', '원금균등', '주택담보대출', '주담대', '월상환액', '상환', '융자'],
  },
  {
    slug: 'salary',
    title: '연봉 실수령액 계산기',
    short: '실수령액',
    category: 'labor',
    summary: '연봉에서 4대보험과 소득세를 뺀 실제 수령액을 계산합니다.',
    status: 'live',
    basisYear: 2026,
    chain: ['insurance', 'severance', 'loan'],
    keywords: ['연봉', '연봉계산기', '월급', '급여', '세후', '실수령', '실수령액표', '월실수령액'],
  },
  {
    slug: 'severance',
    title: '퇴직금 계산기',
    short: '퇴직금',
    category: 'labor',
    summary: '평균임금을 기준으로 퇴직금과 퇴직소득세를 계산합니다.',
    status: 'live',
    basisYear: 2026,
    chain: ['salary', 'insurance'],
    keywords: ['퇴직', '퇴사', '퇴직급여', '평균임금', '퇴직소득세'],
  },
  {
    slug: 'insurance',
    title: '4대보험 계산기',
    short: '4대보험',
    category: 'labor',
    summary: '국민연금·건강보험·고용보험·산재보험을 근로자와 사업주가 각각 얼마씩 부담하는지 계산합니다.',
    status: 'live',
    basisYear: 2026,
    chain: ['salary', 'severance'],
    keywords: ['국민연금', '건강보험', '고용보험', '산재보험', '공제', '보험료', '사대보험', '인건비', '사업주부담', '회사부담'],
  },
  {
    slug: 'dsr',
    title: 'DSR 한도 계산기',
    short: 'DSR',
    category: 'finance',
    summary: '소득 대비 총부채원리금상환비율로 대출 가능 한도를 확인합니다.',
    status: 'live',
    basisYear: 2026,
    chain: ['loan', 'acquisition-tax'],
    keywords: ['대출한도', '한도', 'DTI', 'LTV', '총부채원리금상환비율', '주택담보대출한도', '스트레스DSR', '디에스알'],
  },
  {
    slug: 'prepayment-fee',
    title: '중도상환수수료 계산기',
    short: '중도상환',
    category: 'finance',
    summary: '대출을 만기 전에 갚을 때 붙는 수수료를 계산합니다.',
    status: 'live',
    basisYear: 2026,
    chain: ['loan', 'dsr'],
    keywords: ['중도상환', '조기상환', '수수료', '대출갈아타기', '대환', '중도상환수수료', '조기상환수수료'],
  },
  {
    slug: 'income-tax',
    title: '종합소득세 계산기',
    short: '종합소득세',
    category: 'finance',
    summary: '프리랜서·사업소득자의 종합소득세를 계산하고 3.3% 정산 결과를 알려줍니다.',
    status: 'live',
    basisYear: 2026,
    chain: ['salary', 'savings'],
    keywords: ['종소세', '소득세', '세금', '과세표준', '누진공제', '프리랜서', '사업소득', '3.3%', '환급', '5월신고', '원천징수'],
  },
  {
    slug: 'acquisition-tax',
    title: '취득세 계산기',
    short: '취득세',
    category: 'realestate',
    summary: '주택 가액과 보유 주택 수에 따른 취득세를 계산합니다.',
    status: 'live',
    basisYear: 2026,
    chain: ['brokerage-fee', 'loan'],
    keywords: ['취득세', '등록세', '집살때세금', '부동산세금', '생애최초', '다주택', '중과', '지방교육세', '농어촌특별세'],
  },
  {
    slug: 'brokerage-fee',
    title: '중개보수 계산기',
    short: '중개보수',
    category: 'realestate',
    summary: '거래 금액과 유형에 따른 부동산 중개수수료 상한을 계산합니다.',
    status: 'live',
    chain: ['acquisition-tax', 'loan'],
    keywords: ['복비', '중개수수료', '부동산수수료', '중개료', '복덕방', '중개보수', '전세복비', '월세복비'],
  },
  {
    slug: 'savings',
    title: '예적금 이자 계산기',
    short: '예적금',
    category: 'finance',
    summary: '단리·복리와 이자소득세를 반영한 세후 수령액을 계산합니다.',
    status: 'live',
    chain: ['loan', 'income-tax'],
    keywords: ['적금', '예금', '복리', '단리', '이자', '만기수령액', '이자소득세', '정기예금', '정기적금', '적금이자', '예금이자'],
  },
  {
    slug: 'korean-age',
    title: '만 나이 계산기',
    short: '만 나이',
    category: 'life',
    summary: '생년월일로 만 나이·연 나이·세는 나이를 한 번에 계산합니다.',
    status: 'live',
    chain: ['pyeong'],
    keywords: ['나이', '나이계산', '만나이', '연나이', '생일', '세는나이', '한국나이', '나이계산기'],
  },
  {
    slug: 'pyeong',
    title: '평수 계산기',
    short: '평수',
    category: 'life',
    summary: '제곱미터와 평을 변환하고 전용·공급면적 차이를 보여줍니다.',
    status: 'live',
    chain: ['acquisition-tax', 'brokerage-fee'],
    keywords: ['평', '제곱미터', '면적', '평수변환', '제곱미터변환', '전용면적', '공급면적', '평계산', '몇평'],
  },
];

export const liveCalculators = (): CalculatorMeta[] =>
  CALCULATORS.filter((c) => c.status === 'live');

export const findCalculator = (slug: string): CalculatorMeta | undefined =>
  CALCULATORS.find((c) => c.slug === slug);

export const calculatorsIn = (category: CategoryId): CalculatorMeta[] =>
  CALCULATORS.filter((c) => c.category === category);

/** 체이닝 카드용 — 존재하지 않는 slug는 조용히 걸러낸다 */
export const chainTargets = (meta: CalculatorMeta): CalculatorMeta[] =>
  (meta.chain ?? []).map(findCalculator).filter((c): c is CalculatorMeta => Boolean(c));
