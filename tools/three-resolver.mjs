/**
 * Node 侧的模块解析钩子：把裸模块名 "three" / "three/addons/*"
 * 指到仓库内置的 vendor 目录，这样离线自检脚本不需要 node_modules。
 */
const THREE_URL = new URL('../vendor/three/three.module.js', import.meta.url).href;
const ADDONS_URL = new URL('../vendor/three/addons/', import.meta.url).href;

export async function resolve(specifier, context, next) {
  if (specifier === 'three') {
    return { url: THREE_URL, shortCircuit: true, format: 'module' };
  }
  if (specifier.startsWith('three/addons/')) {
    return { url: ADDONS_URL + specifier.slice('three/addons/'.length), shortCircuit: true, format: 'module' };
  }
  return next(specifier, context);
}
