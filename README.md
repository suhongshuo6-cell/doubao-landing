<div align="center">

# 豆包 Doubao · 3D 数字人滚动剧场

**一个单页、无跳转、零构建的 WebGL 品牌落地页**

进入页面只看到一张铺满屏幕的 3D 数字人面孔 → 鼠标划过可以"捏脸" → 向下滚动，镜头沿着身体一路下移（颈 → 锁骨 → 腰 → 长腿 → 赤足）→ 横向拖拽可以绕到她身侧。
开场还有一段 **从二次元 cel-shading 蜕变成写实皮肤** 的逐像素材质transition。

`three.js` · 自研 GLSL · 纯程序化几何 · 无外部模型/贴图依赖 · 可直接托管到 GitHub Pages

<img src="./assets/og.png" alt="豆包 3D 数字人滚动剧场" width="880" />

</div>

---

## 目录

- [亮点](#亮点)
- [快速开始](#快速开始)
- [部署到 GitHub Pages](#部署到-github-pages)
- [交互与分镜](#交互与分镜)
- [调试参数](#调试参数)
- [技术实现](#技术实现)
- [目录结构](#目录结构)
- [自检工具](#自检工具)
- [自定义指南](#自定义指南)
- [性能与降级](#性能与降级)
- [浏览器支持](#浏览器支持)
- [免责声明](#免责声明)
- [License](#license)

---

## 亮点

| | |
|---|---|
| 🎭 **动漫 → 写实蜕变** | 同一份 fragment shader 里同时计算 cel-shading 与写实皮肤光照，用 `uReal × 扫光高度` **逐像素**决定每个像素处于哪种材质状态。不是两张贴图淡入淡出。 |
| 🫳 **捏脸交互** | 射线与头部隐式曲面求交（解析步进 + 二分），命中点做高斯衰减顶点位移；松手是**欠阻尼弹簧回弹**，会有 1~2 次可见余振。鼠标只是划过也会凹陷。 |
| 🎥 **滚滚驱动运镜** | 全站只有一个进度量 `p ∈ [0,1]`。每个分镜的锚点由该区块在文档里的**真实位置**算出，所以改文案、调区块高度都不会让镜头和文字错位。 |
| 🧬 **零资产依赖** | 头、眼、睫毛、发丝、四肢、手指脚趾、服装全部由代码生成（放样 / 平行传输扫掠 / 球面变形挖孔）。仓库里没有一张贴图、没有一个 `.glb`。 |
| ✨ **开场粒子汇聚** | 7000 颗粒子的目标位置是从角色网格表面**真实采样**出来的，所以它们聚成的就是她本人的轮廓。 |
| 📱 **自动降级** | 三档画质（高/中/低），移动端与低配机自动降档，帧率持续过低会二次降级；`prefers-reduced-motion` 与无 WebGL 都有兜底。 |
| 📦 **免构建** | 没有打包器、没有依赖安装。three.js 已内置在 `vendor/`，`importmap` 直接跑源码。 |

---

## 快速开始

ES Module + importmap 需要 HTTP 协议，**不能直接双击 `index.html`**（`file://` 会被 CORS 拦截）。任选一种起服务：

```bash
# Python（macOS / Linux 自带）
python3 -m http.server 8080

# Node
npx serve -l 8080

# PHP
php -S 127.0.0.1:8080
```

然后打开 <http://127.0.0.1:8080>。

不需要 `npm install`，不需要 build。

---

## 部署到 GitHub Pages

**方式一：从分支直接发布（最简单，无需 CI）**

1. 把本目录推到 GitHub 仓库的默认分支（`main`）。
2. 仓库 **Settings → Pages → Build and deployment → Source** 选 `Deploy from a branch`。
3. 分支选 `main`，目录选 `/ (root)`，保存。
4. 等 1 分钟左右，访问 `https://<你的用户名>.github.io/<仓库名>/`。

> 所有资源都用的**相对路径**（`./src/...`、`./vendor/...`），所以在 `用户名.github.io/仓库名/` 这种子路径下也能正常工作，不需要改 base。

**方式二：GitHub Actions**

仓库里已包含 `.github/workflows/pages.yml`。到 **Settings → Pages → Source** 选 `GitHub Actions`，之后每次推送到 `main` 都会自动发布。

---

## 交互与分镜

页面共 10 个分镜，滚动进度 `p` 与镜头、文案、HUD 一一对应：

| # | 分镜 | 镜头 | 交互 |
|---|---|---|---|
| 00 | 开场 | 黑场 → 粒子汇聚 → 推近到脸部特写 | 点击/空格/`Esc` 可跳过 |
| 01 | 面容 | 脸部特写（约 0.35m） | **捏脸**：按住拖动；划过即凹陷 |
| 02 | 颈肩 | 颈侧 / 锁骨 | 呼吸起伏、光斑游走 |
| 03 | 心意 | 胸口高度 | 布料与皮肤的呼吸波动 |
| 04 | 腰线 | 腰 | 身体轻微转体摆动 |
| 05 | 手臂 | 手臂与手 | **左右拖拽环绕**（最大 ±55°），松手弹回 |
| 06 | 长腿 | 低机位仰拍 | 镜头光晕、边缘光 |
| 07 | 赤足 | 贴地特写 | 地面网格、接触阴影、粒子上升 |
| 08 | 全身 | 拉远 | 四张卖点卡（3D 跟随倾斜） |
| 09 | 下载 | 拉远 | 磁吸按钮、二维码、页脚 |

全局交互：

- **鼠标视差** —— 镜头与她的视线都会跟随指针
- **自定义光标** —— 悬停可交互元素时放大；移到脸上变成金色的「捏」
- **键盘** —— `↑/↓`、`PgUp/PgDn`、`Home/End` 均可推进分镜
- **环境音** —— 右上角按钮开启（低频 pad + 捏脸音点，需用户手势，符合浏览器自动播放策略）
- **画质切换** —— 右上角太阳图标，在高/中/低之间循环

---

## 调试参数

在 URL 后面加参数即可，方便调镜头和排查问题：

| 参数 | 作用 |
|---|---|
| `?p=0.42` | 直接停在某个滚动进度（自动跳过开场），用于逐帧对镜头 |
| `?nointro=1` | 跳过开场动画 |
| `?q=low` \| `medium` \| `high` | 强制画质档位 |
| `?debug=1` | 右下角显示调试面板（帧率 / 三角面 / draw call / 当前 p） |
| `?frames=8` | 只渲染 8 帧后停住（给无头浏览器截图用） |
| `?instant=1` | 相机不做阻尼过渡，直接落到目标位 |

控制台里还有 `window.__DOUBAO`：`__DOUBAO.goTo(0.6)`、`__DOUBAO.errors`、`__DOUBAO.state()`。

---

## 技术实现

### 1. 材质蜕变：不是淡入淡出，是逐像素状态机

`src/three/shaders.js` 的皮肤 fragment shader 里同时算两套光照：

```glsl
// 动漫态：三段色阶 + 硬边高光 + 边缘光
float band = smoothstep(0.14,0.20,kdl)*0.60 + smoothstep(0.50,0.56,kdl)*0.40;
// 写实态：wrap diffuse + 次表面透光 + 双叶高光 + 菲涅尔
diff += uColDeep * term * 0.62;

// 扫光线以下 = 已蜕变
float realMask = 1.0 - smoothstep(uSweepY-uSweepW, uSweepY+uSweepW, vWorld.y);
vec3 col = mix(anime, real, clamp(uReal * realMask, 0.0, 1.0));
```

扫光是一条自下而上移动的亮线，扫到哪里、哪里的材质状态就切过去，同时线上爆出粒子、后期叠加色差与白闪。动漫态还会额外渲染一层**屏幕空间等宽描边**（背面外扩），随蜕变进度淡出。

### 2. 头部：球面变形 + 解析挖孔

头部是一个 `SphereGeometry` 逐顶点变形而来（`deformHead()`）：下颌收窄、面部压平、下巴前推，再叠加 26 个高斯特征（鼻梁/鼻头/唇/下巴/颧骨/苹果肌/眼窝/**上下眼睑**/眉骨/太阳穴…）。

眼球要"嵌"进脸里，所以做了一件不太常见的事：**用解析式在头部网格上挖出两个眼裂**。

```js
// 眼裂场：切向椭圆距离，且必须排除"眼心背面"的点
function eyeField(px, py, pz, ref) {
  const front = v·g;
  if (front < ref.radius * 0.15) return 99;   // 后脑对跖区域必须排除
  return Math.hypot(a / EYE.openW, b / EYE.openH);
}
```

> 这里踩过一个真实的坑：最初没有那句 `front` 判定，结果**与眼心对跖的后脑勺切向距离也接近 0**，被当成眼裂一起挖穿了。这个 bug 是被 `tools/scene-check.mjs` 抓出来的。

眼裂的实际形状不是靠 `openW/openH` 决定的，而是**眼球球面与脸部表面的真实交线**——上下眼睑特征把脸面往前压，交线自然收成杏仁形。睫毛线就是用同一个交点扫描出来的，所以永远压在眼眶边缘上，不会陷进眼球被挡住。

眼球本身也没有贴图：虹膜的放射状纤维、瞳孔缘暗环、角膜镜像高光全部是 `atan` + 值噪声算出来的。

### 3. 几何：自写放样与扫掠

`src/three/geometry.js` 提供两个原语，全角色都由此生成：

- `sweep(points, radii)` —— 沿折线扫管，用**平行传输标架**避免扭转（四肢、手指、发丝、眉毛、睫毛）。
- `loft(sections, { shape, profile })` —— 沿轴串横截面，支持逐角度调制半径（躯干、服装）与任意截面（脚掌的平底）。

标架约定 `ax × az = -t`，这样固定的三角绕序永远朝外，不需要 `DoubleSide` 兜底。

### 4. 运镜：DOM 锚点 → 相机关键帧

```js
// 分镜锚点 = 该 section 在文档里居中时的滚动进度
const center = el.offsetTop + el.offsetHeight * 0.5 - window.innerHeight * 0.5;
p_beat = center / scrollLen;
```

相邻锚点之间用 `easeInOutCubic` 插值，于是镜头会在每个分镜处**自然减速停顿**，像分镜脚本而不是匀速位移。再叠加指针视差与值噪声"手持微抖"。

### 5. 后处理链

`RenderPass → UnrealBloomPass → OutputPass → 自写调色 Pass`

自写 Pass 里做了径向色差、暗角、胶片颗粒、扫描线、S 曲线对比，以及蜕变/捏脸时的白闪与色差峰值。整个 3D 层在**线性空间**渲染，色调映射与 sRGB 转换交给 `OutputPass`。

---

## 目录结构

```
doubao-landing/
├─ index.html                  # 唯一的页面（单页，无路由）
├─ styles/main.css             # 全部 DOM 层样式（玻璃拟态 / HUD / 响应式）
├─ assets/                     # favicon 与社交分享图
├─ src/
│  ├─ main.js                  # 装配 + 开场时间线 + 主循环
│  ├─ config.js                # 调色板 / 10 个相机关键帧 / 画质档位 / 数学工具
│  ├─ three/
│  │  ├─ stage.js              # 渲染器、相机、后处理链、星空背景、地面
│  │  ├─ character.js          # 程序化数字人（头/眼/发/躯干/四肢/服装）
│  │  ├─ geometry.js           # sweep / loft / merge / 表面采样
│  │  ├─ shaders.js            # 皮肤、眼球、头发、布料、描边、调色
│  │  ├─ particles.js          # 汇聚 / 星尘 / 爆发三合一粒子系统
│  │  ├─ cameraRig.js          # p → 相机参数
│  │  └─ interact.js           # 捏脸、环绕、视线跟随
│  └─ ui/
│     ├─ hud.js                # 加载屏、分镜刻度、部位标签、光标
│     ├─ reveal.js             # 逐字揭示、卡片倾斜、磁吸按钮
│     └─ audio.js              # WebAudio 环境音
├─ vendor/three/               # 内置的 three.js r186（含必要的 addons）＋ MIT 许可
├─ tools/                      # 离线自检与素材生成脚本
└─ .github/workflows/pages.yml # GitHub Pages 自动发布
```

---

## 自检工具

因为 three.js 的核心（几何、场景图、材质）在 Node 里也能跑，仓库带了一个**不需要浏览器**的自检脚本，它会在 Node 里把整个角色构建一遍，并交叉核对着色器接口：

```bash
node tools/scene-check.mjs
```

它会检查：

1. 几何体有没有 NaN、三角面数量是否合理
2. 人物尺寸与站位（脚底 y≈0、身高≈1.78m、脸在 y≈1.66）
3. 头部是否**只**挖掉两个眼裂（没有误伤后脑）
4. 眼裂尺寸、眼球截面能否盖住挖孔（会不会看穿脑袋）
5. **每个材质的 GLSL `uniform` 声明与 JS `uniforms` 是否一一对应**——漏一个就是静默失效
6. **vertex / fragment 之间的 `varying` 是否匹配**——不匹配会直接链接失败变黑屏
7. 10 个分镜的相机关键帧是否单调下移

这个脚本在开发过程中真的抓到过致命 bug（后脑被挖穿、眼裂尺寸与眼球不匹配），强烈建议改动几何或着色器后跑一遍。

另外：

```bash
python3 tools/make-og.py     # 重新生成 assets/og.png
```

---

## 自定义指南

**改文案 / 加区块** —— 直接改 `index.html` 里的 `<section data-beat="...">`。分镜锚点会按 DOM 真实位置自动重算，不用动 JS。新增分镜时记得在 `src/config.js` 的 `BEATS` 里补一条同 `id` 的相机关键帧。

**改镜头** —— `src/config.js` → `BEATS[].cam = { pos, look, fov, orbit, roll }`，单位是米。`orbit` 是该分镜允许的横向环绕幅度（弧度）。

**改配色** —— 同一个文件里的 `PALETTE`，以及 `styles/main.css` 顶部的 `:root` 变量。

**改体质 / 五官** —— `src/three/character.js`：

- `FEATURES` 数组是五官特征表，格式 `[中心x, 中心y, 半径x, 半径y, 位移量, 权重x, 权重y, 权重z]`，单位空间里头高为 2、脸朝 +Z。
- 改完跑 `node tools/scene-check.mjs`，确认没把眼裂/眼球关系搞坏。

**换成真 3D 模型** —— 本项目的 `buildCharacter()` 返回 `{ group, meshes, materials, headMesh }`，你可以在 `main.js` 里把 `character.group` 换成自己 `GLTFLoader` 加载的模型；捏脸靠的是 `materials.head.uniforms.uPinch`，把这份材质换成模型面部材质、或改用 blend shapes 即可。

---

## 性能与降级

| 档位 | DPR | MSAA | Bloom | 粒子 | 发丝 |
|---|---|---|---|---|---|
| high | 2.0 | 4× | ✅ | 7000 | 78 |
| medium | 1.5 | — | ✅ | 4200 | 54 |
| low | 1.0 | — | — | 2000 | 34 |

- 移动端 / `deviceMemory ≤ 4` / 核心数 ≤ 4 / 视口 < 760px 自动选 medium。
- 运行中若连续 2 秒低于 26fps，自动二次降级（关 Bloom、DPR 降 1、隐掉一半发丝）。
- 页面不可见时暂停渲染（`document.hidden`）。
- `prefers-reduced-motion: reduce`：跳过开场，直接展示静态成品画面。
- 无 WebGL2：显示兜底卡片，DOM 内容完整可读。

桌面端整场约 7.2 万三角面、约 130 个 draw call。

---

## 浏览器支持

需要 **WebGL2**（Chrome / Edge 90+、Safari 15+、Firefox 90+）。three.js r186 已不再支持 WebGL1。

---

## 免责声明

- 本项目是**个人非商业的技术演示**，用于展示 WebGL 实时渲染与交互设计，与字节跳动及其「豆包」产品**无任何隶属或合作关系**；相关商标归其所有者所有。
- 页面中的虚拟形象是**程序化生成的原创设计**，不基于任何真实人物的肖像、五官或姓名，也不构成对任何真实人物的描摹。请勿将其用于冒充真人或商业代言。
- 请勿把本项目直接用于冒充官方产品。移除或替换品牌名称与文案后，本项目的代码可自由用于你自己的项目。

---

## License

代码以 [MIT](./LICENSE) 发布。内置的 three.js 遵循其自身的 MIT 许可（见 `vendor/three/LICENSE`）。
