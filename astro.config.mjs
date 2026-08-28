// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  /**
   * 배포 도메인. sitemap.xml과 canonical URL의 기준이 된다.
   * 도메인이 정해지면 이 값만 바꾸면 된다 — 코드에서는 Astro.site로 참조한다.
   */
  site: 'https://semtl.onrender.com',

  integrations: [svelte(), sitemap()],

  build: {
    // 작은 스타일시트는 HTML에 인라인해서 요청 수를 줄인다 (LCP에 유리)
    inlineStylesheets: 'auto',
  },

  // 계산기끼리 이동이 잦으므로 링크에 마우스를 올리면 미리 받아둔다
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
});
