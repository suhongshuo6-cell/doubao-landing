/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 火山方舟 API Key。仅建议本地 dev；GH Pages 等纯静态托管会暴露前端 Key。 */
  readonly VITE_ARK_API_KEY?: string
  /** 模型或推理接入点 ID，默认 doubao-pro-32k */
  readonly VITE_ARK_MODEL?: string
  /** 生产环境同源反代基址（含协议与域名，无尾斜杠）。不设则直连方舟（可能 CORS）。 */
  readonly VITE_ARK_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
