/**
 * 예적금 이자과세.
 *
 * 2026-08-27 확인 완료.
 *
 * 흔한 오해: "세금우대 9.5%"
 * 예전 세금우대종합저축(2014년 폐지)의 세율이며 지금은 존재하지 않는다.
 * 현재의 우대 제도는 상호금융 조합 예탁금의 저율과세(농특세 1.4%만)와
 * 비과세종합저축(0%)이다.
 *
 * 2026년부터 달라지는 것
 * 상호금융 준조합원 중 총급여 5,000만원(종합소득금액 3,800만원) 초과자는
 * 비과세에서 저율 분리과세로 전환된다. 2026년 5%, 2027년부터 9%.
 * 농어민 조합원과 총급여 5,000만원 이하 준조합원은 종전 혜택이 유지된다.
 */

export interface SavingsTaxOption {
  id: string;
  label: string;
  rate: number;
  hint: string;
}

export const SAVINGS = {
  verified: true,

  taxOptions: [
    {
      id: 'normal',
      label: '일반과세',
      rate: 0.154,
      hint: '이자소득세 14% + 지방소득세 1.4%',
    },
    {
      id: 'coop',
      label: '저율과세',
      rate: 0.014,
      hint: '상호금융 조합 예탁금 · 농어촌특별세만 · 3,000만원 한도',
    },
    {
      id: 'coop2026',
      label: '저율 분리과세',
      rate: 0.05,
      hint: '2026년 신설 · 총급여 5,000만원 초과 준조합원',
    },
    {
      id: 'exempt',
      label: '비과세',
      rate: 0,
      hint: '비과세종합저축 등',
    },
  ] as SavingsTaxOption[],

  sources: [
    {
      label: '국세청 — 이자소득 원천징수',
      url: 'https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7869&mi=6433',
    },
    {
      label: '기획재정부 — 2025년 세제개편안 (상호금융 준조합원 과세 전환)',
      url: 'https://www.moef.go.kr',
    },
    {
      label: '비과세종합저축 제도 안내',
      url: 'https://www.standardchartered.co.kr/np/kr/cms/pl/se/TaxInfo.jsp?menuId=HC02020400000000',
    },
  ],
} as const;

export const DEFAULT_TAX_OPTION = 'normal';

export const taxOptionById = (id: string): SavingsTaxOption =>
  SAVINGS.taxOptions.find((o) => o.id === id) ?? SAVINGS.taxOptions[0];
