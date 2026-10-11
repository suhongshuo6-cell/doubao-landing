import { defineConfig } from 'vite'

// GitHub Pages：仓库会部署在 https://<user>.github.io/<repo>/ 这类子路径下，
// 也可能挂自定义域名。base 用相对路径 './' 两种场景都能跑，无需改配置。
export default defineConfig({
  base: './',
  server: {
    // 浏览器直连 ark.cn-beijing.volces.com 常遇 CORS。
    // 本地 dev 把 /ark-api 代理到方舟，前端 doubaoClient 在 DEV 下走此路径。
    proxy: {
      '/ark-api': {
        target: 'https://ark.cn-beijing.volces.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/ark-api/, ''),
      },
      // Dify API (api.dify.ai) — 浏览器直连常遇 CORS；dev 走同源代理
      '/dify-api': {
        target: 'https://api.dify.ai',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/dify-api/, ''),
      },
    },
  },
  build: {
    target: 'es2020',
    assetsInlineLimit: 4096,
    cssTarget: 'chrome90',
    reportCompressedSize: true,
    rollupOptions: {
      output: {
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
