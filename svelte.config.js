import { vitePreprocess } from '@astrojs/svelte';

export default {
  // Svelte 컴포넌트 안에서 lang="ts"를 쓰기 위한 전처리
  preprocess: vitePreprocess(),
};
