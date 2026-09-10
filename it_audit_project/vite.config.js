import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 개발 중에는 여러 파일(src/data/*.js, src/app.js 등)로 나뉘어 있지만,
// `npm run build`를 실행하면 vite-plugin-singlefile이 CSS/JS를 전부 인라인으로
// 합쳐서 dist/index.html 딱 하나만 산출합니다. (지금까지 쓰시던 단일 HTML 파일과 동일한 형태)
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    // 데이터가 크기 때문에(도메인 정의, 인터뷰 스크립트 등) 청크 경고 임계값을 넉넉히 올려둡니다.
    chunkSizeWarningLimit: 5000,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    outDir: 'dist',
  },
});
