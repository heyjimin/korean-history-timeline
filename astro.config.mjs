// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// GitHub Pages 프로젝트 사이트는 https://<user>.github.io/<repo>/ 에 올라가므로
// 배포 워크플로가 SITE_URL과 BASE_PATH를 넘겨준다. 로컬에서는 루트(/)를 쓴다.
export default defineConfig({
  site: process.env.SITE_URL,
  base: process.env.BASE_PATH ?? '/',
  trailingSlash: 'ignore',
  integrations: [react()],
  vite: {
    // MapLibre 워커는 ES 모듈(import 문 포함)이라 워커도 ES 형식으로 묶는다
    worker: { format: 'es' },
  },
});
