import { defineConfig } from 'vite'

// GitHub Pages：仓库会部署在 https://<user>.github.io/<repo>/ 这类子路径下，
// 也可能挂自定义域名。base 用相对路径 './' 两种场景都能跑，无需改配置。
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 4096,
    cssTarget: 'chrome90',
    reportCompressedSize: true,
    rollupOptions: {
      output: {
        // 分包策略（Vite 8 起 manualChunks 只接受函数形式）：
        //  · three 核心 + 轻量 addons（如 RectAreaLightUniformsLib）：首屏就要，合成一个 chunk
        //  · three 的 loaders（GLTFLoader / DRACOLoader / KTX2Loader / WorkerPool / zstddec）：
        //    只有"用户往 public/models/ 放了 doubao.glb"时才会被动态 import 到。
        //    必须单独成 chunk —— 否则这 140KB(gzip) 会跟着 modulepreload 一起进首屏。
        //  · gsap + lenis：动效层，单独缓存
        //
        // 注意不能用 `three/examples/jsm` 一刀切：RectAreaLightUniformsLib 也在那个目录下，
        // 一刀切会把 loaders 一起拖进首屏（实测 modulepreload 里会多出 141KB gzip）。
        manualChunks(id: string) {
          if (
            id.includes('node_modules/three/examples/jsm/loaders/') ||
            id.includes('node_modules/three/examples/jsm/libs/') ||
            id.includes('node_modules/three/examples/jsm/utils/')
          ) {
            return 'three-loaders'
          }
          if (id.includes('node_modules/three')) return 'three'
          if (id.includes('node_modules/gsap') || id.includes('node_modules/lenis')) return 'motion'
          return undefined
        },
      },
    },
  },
})
