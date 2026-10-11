<div align="center">

# 豆包 · 把想法，说给豆包听

**一个单页、无跳转的「致敬型」产品落地页**
三个固定层：极淡背景 → WebGL 角色舞台 → 流动的文字内容

`Vite` · `TypeScript` · `Three.js` · `GSAP` · `Lenis` · 自托管 Inter

**非官方作品。与字节跳动及其产品无关。**

</div>

---

## 这是什么

一个从零搭的单页（SPA，无二级页面）。核心是**一个始终在场的 3D 质感角色**：
从进站第一眼的大特写，到最后一屏的全身，她一直在画面里；镜头沿着一条曲线在轨道上滑行，
文字绕着她流动。

滚动条不是"推着相机跑"的：相机走的是**临界阻尼弹簧**，速度来自滚动但永远不等于滚动值。
所有跟随类动效（相机、指针、卡片）都用弹簧，不用 lerp —— 这是"高级"和"廉价"的分界线。

---

## 快速开始

```bash
npm install     # 或 pnpm install
npm run dev     # http://localhost:5173
npm run build   # 产物在 dist/
npm run preview # 本地预览构建产物
```

> Node ≥ 20。**不需要任何额外的预处理脚本**：Draco / KTX2 解码器由 three 自己
> 通过 `new URL('../libs/...', import.meta.url)` 交给打包器处理，产物里就是自托管的，
> 不依赖任何 CDN，也不会在没放模型时被请求。

### 两个自检脚本

```bash
npm run check:flash   # 反闪烁静态检查（规格第十节第 1 条的脚本化版本）
npm run verify        # 本机 Chrome 跑桌面 + 移动两趟验收（取景/捏脸/能力卡/过渡帧）
npm run perf          # 性能预算实测：FCP、长任务、连续滚动 10s 帧率、降档轨迹
python3 tools/preview_frames.py   # 离线渲染取景构图（不需要浏览器）
python3 tools/make_mattes.py      # 重新生成立绘分层（换素材后才需要跑）
```

`npm run verify` 需要本机装有 Google Chrome（用 `channel: 'chrome'` 复用系统浏览器，
**不需要**下载 playwright 自带的 chromium）。截图与状态报告输出到 `.preview-out/`。

### 调试开关

| 参数 | 作用 |
|---|---|
| `?character=model` / `imageRig` / `probe` | 强制走某条角色资产路径 |
| `?nointro=1` | 跳过开场推近 |
| `?p=0.36` | 直接停在某个取景进度（逐帧对构图用） |
| `?debug=1` | 左下角状态面板：kind / framing / node / fps / drawCalls / 相机坐标 |

控制台：`__DOUBAO.state()` / `__DOUBAO.goTo(0.92)` / `__DOUBAO.killIntro()`

---

## 设计红线（本项目的第一原则）

这一节比其它所有内容都重要。上一版页面就是死在这里。

### A. 禁止一切"闪"

- ❌ `@keyframes` 里对 `color / background / border-color / box-shadow / filter / opacity` 做高频往复
- ❌ `steps()` 计时函数（离散跳变＝闪）
- ❌ `infinite` 搭配颜色 / 阴影 / 发光 / 模糊半径变化
- ❌ `hue-rotate`、霓虹渐变、发光描边脉动、玻璃拟态 + 光扫过
- ✅ 只允许：`transform`、`opacity`、`clip-path`、`filter: blur()` 的低频大跨度插值、数值弹簧
- ✅ 循环动画：周期 ≥ 4s，位移幅度 ≤ 8px，透明度只在 0.9–1.0 之间

**唯一的例外**是打字机光标（`animation: caret 1.06s linear infinite`），
而且它用平滑淡入淡出、**没有用 `steps()`**。这是规格里明确豁免的一项。

**第二处例外（我主动标出来）**：语音卡里的音频波形（`capabilityDemos.ts`）
持续运行且纵向摆幅远超 8px。它满足"周期 ≥ 4s"（最快的正弦分量周期 6.0s），
也只用 `transform: scaleY`（不碰 color / opacity / box-shadow / filter），
但确实超出了"位移幅度 ≤ 8px"这一条。

理由是：这一条定量红线针对的是**装饰性**的循环微动效（呼吸、漂浮），
而波形是规格第七节明确要求的**数据可视化**——一条只摆动 8px 的波形等于没做。
它是"正在聆听"这个状态的唯一表达方式，不是装饰。卡片滚出视口即暂停。
**最终决定：保留**（数据可视化不适用装饰性微动效的振幅条款；周期 ≥ 4s 且只动 transform）。

### B. 禁止模板感骨架

全站 9 个区块，**相邻两块的版式节奏都不重复**：

| # | 区块 | 版式类型 | 做法 |
|---|---|---|---|
| 1 | Hero | 特写型 | 全出血 + 极大字号压在留白上，无副标题无 CTA |
| 2 | 定位 | 不对称双栏 | 文字栏 700px + 右栏刻意留白（角色半身入画） |
| 3 | 四大能力 | 横向滚动型 | pin 一屏 + `display:flex` 卡片横向推移，卡片 480px / 间距 32px |
| 4 | 场景 | 通栏叙事型 | 三段横带 + hairline 分隔，每段左信息右对话线程，段间刻意错位 |
| 5 | 数字带 | 通栏数据型 | 一排数据 + 竖分割线 + 极简文字 |
| 6 | 全身取景 | 大留白单侧克制型 | 全出血角色 + 右下角克制说明，170svh 的 scrub 区间 |
| 7 | 技术说明 | 规格表型 | **左对齐**标题 + **不等宽**三栏 + 竖 hairline，不是居中标题 + 三卡片 |
| 8 | FAQ | 问题清单型 | 左侧标题栏 + 右侧手风琴 |
| 9 | Footer | 通栏收束型 | 左免责声明 / 右链接，浅色渐变压住画面 |

> 第 7 节与规格里"简洁三栏"的字面描述有冲突：字面照做会直接撞上红线 B
> （居中大标题 + 副标题 + 3 张等宽卡片）。这里按**红线优先**处理，
> 用规格表的形式承载同样的信息量。

### C. 角色必须始终在场

角色是 `position: fixed` 的独立 WebGL 层（`z-index` 介于背景与内容之间）。
内容层完全透明，只在文字需要可读性的地方用一层**极软的浅色晕开**（不是玻璃拟态，没有边框和高光）。

| 区块 | 角色的可见形态 |
|---|---|
| 1 Hero | 面部大特写（能看到的肩部不超过画面下缘 20%） |
| 2 定位 | 肩颈与围巾，画面右侧，被文字让开 |
| 3 四大能力 | 卡片带上移时头部肩线始终在卡片顶边之上 |
| 4 场景 | 腰线附近，文字栏在左，角色在中右 |
| 5 数字带 | 腰部，数据条横贯画面，角色在中轴后方 |
| 6 全身取景 | 完整全身，画面左侧，右侧留给服装说明 |
| 7 技术 | 全身，被规格表部分遮挡 |
| 8 FAQ | 全身，被手风琴列表部分遮挡 |
| 9 Footer | 全身 + 极慢自动环绕，被页脚渐变压到后面 |

### D. 取景语言

镜头是**电影取景框的巡礼**，不是身体凝视。不做强调身体部位的构图、不做暗示性取景。
角色全程完整着装（黑色短上衣 + 红色围巾 + 黑色短裤 + 光脚），版型与参考图一致。

取景节点（参数在 `src/three/cameraRig.ts`）：

| t | 节点 | 画面可见高度 |
|---|---|---|
| 0.00 | 面容 | 0.30 m |
| 0.18 | 肩颈与围巾 | 0.54 m |
| 0.36 | 手与手臂 | 1.02 m |
| 0.54 | 腰线 | 0.66 m |
| 0.74 | 腿与足 | 1.00 m |
| 0.92 | 全身 | 2.10 m |

每个节点还带一点构图私心（`axisFrac` / `camBias`）：镜头下移的同时在画框里横向平移，
从"脸在右侧"移到"全身在左侧"，文字栏于是可以自然换边。这不是装饰，是版式节奏的一部分。

### E. 暗色禁令

只有 `#FFFFFF` / `#FBFBFD` / `#F4F5F7` 及非常浅的冷暖微渐变。
`--brand: #FF5A3C` 全站出现面积 ≤ 3%，只用在：进度条激活点、焦点环、打字光标、极少量下划线。

---

## 动效系统

`src/motion/` 里是四条"专业人士一看就知道"的手法：

1. **临界阻尼弹簧**（`src/lib/spring.ts`）
   半隐式欧拉 + 1/120s 子步长，不同帧率手感一致。预设写在 `SPRING` 里，
   每个预设都标了阻尼比 ζ。捏脸用的是 ζ ≈ 0.62 —— 对应规格要求的"约 8% 过冲"。

2. **速度驱动的形变**（`src/motion/transitions.ts`）—— 最出彩的一条
   滚动速度 → 一个 CSS 变量 `--vel` → CSS 用 `calc()` 组合到各元素自己的 transform 上：
   卡片 ±3° 旋转 + 7px 位移、标题字距、场景气泡位移。
   **带 0.055 的死区**：慢滚时完全平静，快滚时才有响应。每帧只有 2 次 style 写入。

3. **文字自行分行 + 逐行揭示**（`src/motion/reveal.ts`）
   不用 SplitText。把段落按断行机会切成最小单元 → 用**真实布局**量出每个单元的纵向位置 →
   位置相同的归为一行 → 重组为 `overflow:hidden` 的行结构 → `yPercent: 110 → 0` + `stagger 0.06`。
   用真实布局量行（而不是按字数猜）才能正确处理中英混排与标点避头尾。

4. **SVG 液态形变** —— *未使用*，见下方「与规格的偏差」。

`src/motion/eases.ts` 把 tokens 里那两条 cubic-bezier 用 `CustomEase` 编译成 GSAP 缓动，
不approximate —— 设计系统里写死的曲线就是团队的"手感定义"。

---

## 3D 角色系统

### 双轨资产架构

页面只认 `Character` 接口：

```ts
export interface Character {
  load(url?: string): Promise<void>
  pinch(point: THREE.Vector3 | null, strength: number): void
  setFraming(t: number): void
  setPointer(ndc: THREE.Vector2): void
  update(dt: number): void
  dispose(): void
}
```

运行时会**构建期**探测 `public/models/doubao.glb`（`import.meta.glob`，文件不存在就返回空，
不会产生 404）：有则走 `ModelCharacter`（真 3D），没有则走 `ImageRigCharacter`（2.5D 立绘），
都没有则走 `ProbeCharacter`（探针胶囊体，用于排查相机）。

三条路径共用同一套 `DEFAULT_METRICS`（身高 1.72m、原点在脚底、中轴偏右 0.62），
所以**相机取景参数与捏脸半径在任何一条路径下都成立**。

### 路径 B 的实现：分层立绘「分镜」系统

现有素材是 **5 张身体部位特写 + 3 张全身三视图**，各自独立、尺度差 3~10 倍。
我用 `tools/preview_frames.py`（与 shader 同一套取景权重数学）离线验证过三种过渡：

| 过渡方式 | 实测结果 |
|---|---|
| 线性交叉淡化 | **双重曝光**：脸叠在围巾上、大腿叠在腰上、一只巨大的脚叠在小小一个全身像上 |
| 焦点切换（窄窗口 + 双侧虚焦） | 好一些，但**重影仍可见** |
| **硬切 + 切点落在虚焦最高点** ✅ | 干净锐利、零重影，读起来是一次 rack focus |

所以最终的形态是**分镜语言**，而不是假装连续运镜：

- **硬切，但切点藏在焦点虚化的最高点**：两侧一样糊，切就看不见了 —— 观感是摄影机换了一次焦点，不是幻灯片
- **每镜内部连续推近 5%**，所以每一镜都是"活的"，不是静帧
- **人像层与背景层摆在不同深度**（`SUBJECT_Z −2.0` / `BACKDROP_Z −3.4`）：
  同一个世界位移在两层的屏幕位移差约 1.7 倍 → **真实视差**，静态照片因此有了体积
- **全身段**用 `front/side/back` 三视图 + 横向压缩（`|cos 2π·turn|`）：
  光标移向屏幕左右边缘她就转过去，转到两个视图之间时压成一条线再换图，所以看不到重影 ——
  这是全站唯一真正"三维"的时刻，也是整段的收束
- **6 个锚点严格对齐规格 6.6 的 6 个节点**（0.00/0.18/0.36/0.54/0.74/0.92），
  于是每个导航节点都是一张干净的实焦画面，过渡发生在节点之间

> 0.36「手与手臂」没有独立素材。这里没有硬塞一张不匹配的图，
> 而是让相机**在同一张肩颈板里继续推近并下移**（`zoom 1.3 / panY 0.2`）——
> 素材只有一个正面视角，取景内的二次构图比换错图诚实。

### 分层抠像（`tools/make_mattes.py`）

针对"干净浅色棚拍墙"这一特定场景，不用任何 ML：

1. 逐行背景估计 → 与背景的感知色差 → soft matte
2. 形态学闭/开运算去噪
3. **降采样大核闭运算**补内部空洞（浅色皮肤与浅色墙同色会漏）
4. 羽化 1.2px
5. 背景层用**归一化卷积**（normalized convolution）重建：
   `bg = blur(rgb·w) / blur(w)`，`w = 1 − 人像`。
   墙是竖向 + 横向双渐变，逐行常数只对得上竖的那一半 ——
   必须让明暗梯度自然延续进人像区域，否则视差一拉开就是一块看得见的斑。

跑完 `public/img/rig/` 共 **352 KB**（webp），人像层与背景层各一套，外加一份
`manifest.json`（每张板的**主体包围盒**）。

两个坑值得记下来：

- **抠像必须留一圈透明边**。移动端竖屏要按主体重新取景，采样坐标经常会越出 `[0,1]`；
  贴图是 `ClampToEdge`，越界会重复最外一行像素 —— 如果那行还有头发/皮肤的实心像素，
  画面上就是一整片**垂直拉丝**。第一版就是这样，看起来像解码坏了。
- 背景层用**归一化卷积**重建，核半径必须大到跨过整个躯干，否则人像深处 `den→0`，
  `num/den` 会留下一个黑块。

### 移动端（<768px）

横图在竖屏里 `cover` 只会取中间 26% 的宽度，人物被裁得莫名其妙。所以移动端换成
**按主体包围盒重新取景**（`tools/make_mattes.py` 生成的 `manifest.json`）：

```
人物占屏宽 = bw / sx   →   sx = bw / targetW      (targetW = 0.86)
不拉伸      →   sy = sx · PLATE_ASPECT / aspect
```

顺带得到 `人物占屏高 = bh / sy ≈ 0.44` —— 正好落在规格要的 **45%** 附近，
再把人物中心放到屏幕 72% 处，文案自然留在上方全宽。
同时**移动端不画背景层**（整块棚拍墙的矩形会把文案压得没法读），
人物抠像直接落在页面底色上。

> 这条公式很容易写反：`s` 的物理含义是"整屏对应多少贴图跨度"，
> 所以是 `bw / targetW` 而不是 `targetW / bw`。写反了画面会被放大到只剩一小块
> （第一版移动端首屏只剩嘴唇和鼻子）。

### 舞台与光（`src/three/stage.ts`）

- `ACESFilmicToneMapping`，曝光 1.05，`outputColorSpace: SRGB`
- **三点布光**：大面积 `RectAreaLight` 主光（正面偏上 35°）+ 冷白大面积补光 + 背后偏上的轮廓光
  （浅色背景下没有 Rim，角色会直接融进背景）
- 环境贴图用 `PMREMGenerator.fromScene()` 从**自建**的渐变场景烘焙：
  竖向渐变球（顶部亮白 → 中部暖白 → 底部浅灰）+ 一块模拟窗户的长方亮斑 + 极浅灰地面。
  不下载任何 HDR 文件。
- `MeshPhysicalMaterial`：`roughness 0.5 / clearcoat 0.06 / sheen 0.35`，`sheenColor` 偏暖

### 捏脸（`src/three/pinchShader.ts`）

用 `onBeforeCompile` 注入，而不是自己写 `ShaderMaterial` —— 只有注入才保得住
PBR / 环境贴图 / sheen / clearcoat，换成手写材质等于把通透的皮肤换成塑料。

- 射线只打**面部代理球**，不打整个模型
- 顶点注入：沿法线压入 + 压点周围的横向扩散，**平方衰减**
- 两处 `#include` 都做了存在性检查，three 改 chunk 文本时会明确报警而不是静默降级
- 片元注入：把 `lights_fragment_begin` 里的 `NdotL` 换成 wrap 形式
  `(NdotL + w) / (1 + w)`，柔化明暗交界，接近次表面散射

> **改了一处规格给的 GLSL。** 规格里写的是 `transformed.xz *= 1.0 + f * uSquash`，
> 但 `transformed` 是物体空间坐标、原点在脚底 —— 那么写等于把**整个模型**绕脚底缩放，
> 脸会被直接甩出画面。正确做法是先搬到压点局部空间、缩放、再搬回去：
>
> ```glsl
> vec3 rel = transformed - uPressPos;
> rel.xz *= 1.0 + f * uSquash;
> rel.y  *= 1.0 - f * uSquash * 0.6;
> transformed = uPressPos + rel;
> ```

---

## 交互层（合并自另一个 demo）

这一层是把"demo 的活"接进"本站的大"。

### 判断：哪些留，哪些不留

两个方案的强项并不在同一个维度上：

| | 本站（v2） | demo |
|---|---|---|
| 强项 | **大** —— 沉浸式取景运镜、照片级立绘、捏脸物理、编辑式版式 | **活** —— 随时随地回应你 |
| 交互 | 滚动取景 / 捏脸 / 转向 / 进度导航 | 点哪炸哪 / 键盘出音符 / 视线跟随 / 五声音阶 / 输入即答 |

所以合并的原则不是并排放，而是**让它们互相成就**：立绘承担"大"，小豆包承担"活"，
**任何一次输入同时打到两层** —— 立绘做微反应（捏脸的形变、取景的呼吸），
小豆包做明确反应（挤压、张嘴、跳跃的粒子）。共用一套五声音阶的"回应语言"。

### 刻意没有合并的部分

- **demo 的分屏叙事**（滚一屏换一个场景）—— 本站的取景是**连续**的，切屏会把运镜打断；
- **demo 的逐屏环境色**（每屏换一组彩色光斑）—— 与本站「全站只有 --brand 一个强调色、
  出现面积 ≤3%」的红线直接冲突，且会把棚拍底色染脏；
- **demo 的蓝色小豆包** —— 换成站点自己的 `--brand` 橘红。豆沙包本来就是红的，
  语义更贴，也不用为吉祥物再引入第二种强调色。

### 交互清单

| 输入 | 回应 |
|---|---|
| 移动鼠标 | 小豆包视线跟随 + 340px 品牌色柔光 + 立绘转向 |
| 空白处点击 | 一小簇碎片（圆/方/三角/圆环随机）+ 按屏幕横向位置取音 |
| 点小豆包 | 挤压拉伸（欠阻尼，有余振）+ "啵" + 一簇暖色粒子 |
| 键盘任意键 | 五声音阶音符 + 光标处炸一小簇 + 小豆包张嘴 |
| 首屏输入条 | 逐字打出的回应 + 上行琶音 + 放大的一簇粒子 |
| 滚到下一个取景节点 | 小豆包换到立绘的另一侧 + 一圈声波 + 一个音 |
| 开始捏脸 | 一个音符 + 捏点处一圈琥珀色声波 |
| 页脚「放个烟花」 | 五波粒子 + 一群迷你小豆包 + 上行琶音 |

### 实现要点

**放在阶段 1 装配**（`src/fx/stage2d.ts`）—— 它**不依赖 three**。
本站的首屏策略是"先见文案，再见人"（three 是 244KB 动态 import 的），
而"会回应你"这件事不该等 3D 进场：用户滚到首屏第一下点击就该有反应。

```
src/fx/
├─ audio.ts     五声音阶引擎（含用户手势解锁、压缩器兜底、全局静音）
├─ particles.ts 2D 粒子（burst / ring / mini 三种原语，数据驱动）
├─ mascot.ts    小豆包（呼吸 / 眨眼 / 挤压弹簧 / 视线跟随 / 果冻蠕动轮廓）
└─ stage2d.ts   编排层：canvas 尺寸、节点锚点、统一 react() 入口、鼠标柔光
src/ui/askbar.ts 首屏输入条（节流音符 + 逐字回应）
```

**配色一律走 token**：粒子只从 `#FF5A3C / #FFB020 / #0E0E12 / #EAF0FF` 里取，
整体透明度偏低 —— 这一层是"回应"，不是"烟花秀"。

**小豆包不会糊在脸上**：每个取景节点有固定锚点，硬约束是**放在立绘中轴的另一侧**
（`FRAMING_NODES` 的 axisFrac 依次是 .68/.63/.66/.50/.50/.34）。移动端统一收到右下角。

**降级**：`prefers-reduced-motion` 下不产生粒子、不播琶音，只保留小豆包本体与单音；
触屏隐藏鼠标柔光；粒子总数硬上限 320。

## 目录结构

```
.
├─ index.html                    # 唯一页面：9 个区块的语义化骨架
├─ vite.config.ts                # base: './'（兼容 /repo/ 子路径与自定义域名）
├─ .github/workflows/deploy.yml  # GitHub Pages：build → configure → upload → deploy
├─ docs/ASSET_SPEC.md            # ★ 交给图生 3D 那一步的模型规格
├─ tools/
│  ├─ check-flash.mjs            # ★ 反闪烁静态检查（块级，不是简单 grep）
│  ├─ verify.mjs                 # ★ 本机 Chrome 跑桌面/移动两趟 6 取景节点 + 截图 + 控制台
│  ├─ perf.mjs                   # ★ 性能预算实测：FCP / 长任务 / 连续滚动 10s 帧率 / 降档轨迹
│  ├─ preview_frames.py          # ★ 离线渲染取景构图（与 shader 同一套权重数学）
│  └─ make_mattes.py             # ★ 立绘分层抠像 → public/img/rig/{人像, 背景, 主体包围盒清单}
├─ public/
│  ├─ models/                    # ← 把 doubao.glb 放这里就自动升级到真 3D
│  ├─ img/                       # 原始立绘（webp 优先，png/jpg 兜底）
│  │  └─ rig/                    # ★ 分层素材：X.webp（人像 RGBA）+ X_bg.webp（背景）
│  └─ favicon.svg
└─ src/
   ├─ main.ts                    # 入口：装配所有模块 + 主循环 + 指针/捏脸 + 自适应画质
   ├─ fx/                        # ★ 2D 特效层（合并自 demo，不依赖 three，阶段 1 装配）
   │  ├─ audio.ts                # 五声音阶引擎（手势解锁 + 压缩器 + 全局静音）
   │  ├─ particles.ts            # 2D 粒子：burst / ring / mini 三种原语
   │  ├─ mascot.ts               # 小豆包：呼吸 / 眨眼 / 挤压弹簧 / 视线跟随
   │  └─ stage2d.ts              # 编排层：canvas、节点锚点、统一 react()、鼠标柔光
   ├─ styles/
   │  ├─ tokens.css              # ★ 唯一色值来源
   │  └─ global.css              # 版式、区块骨架、微交互外观
   ├─ ui/
   │  └─ askbar.ts               # 首屏输入条（节流音符 + 逐字回应）
   ├─ lib/
   │  ├─ motionPrefs.ts          # prefers-reduced-motion / 设备档位（唯一开关）
   │  ├─ spring.ts               # ★ 弹簧物理 + 手感预设
   │  ├─ framing.ts              # ★ 6 个取景节点的纯数据表（零依赖，不被 three 拖累）
   │  ├─ frameLoop.ts            # 全站唯一的每帧回调入口（页面不可见时停 RAF）
   │  └─ visibility.ts           # IntersectionObserver 包装（离屏暂停微交互）
   ├─ motion/
   │  ├─ eases.ts                # tokens 的 cubic-bezier → 自解三次贝塞尔（不依赖插件）
   │  ├─ lenisSetup.ts           # Lenis + GSAP 标准集成
   │  ├─ reveal.ts               # 统一 reveal + 手写逐行切分
   │  └─ transitions.ts          # 速度形变 + 滚动/取景锚点映射
   ├─ three/
   │  ├─ stage.ts                # renderer / scene / camera / 灯光 / 环境
   │  ├─ character.ts            # ★ Character 接口 + 资产探测 + 地标
   │  ├─ modelCharacter.ts       # 路径 A：真 3D glb
   │  ├─ imageRigCharacter.ts    # ★ 路径 B：分层立绘分镜系统（硬切 + 焦点切换 + 视差 + 转身）
│  ├─ plateShader.ts          # ★ 立绘板材质：UV 捏脸 + 焦点虚化 + 速度拖影 + 转身压缩
   │  ├─ probeCharacter.ts       # 探针角色（骨架/排查用，非最终形象）
   │  ├─ pinchShader.ts          # 捏脸顶点形变 + wrap lighting 注入
   │  └─ cameraRig.ts            # ★ 取景路径（CatmullRomCurve3 + 阻尼 + yaw 环绕）
   ├─ sections/                  # 9 个区块各一个模块，导出 init/destroy
   │  └─ capabilityDemos.ts      # 四大能力卡里的四段微交互演示
   └─ ui/                        # 顶部导航、右侧取景导航条
```

---

## 部署到 GitHub Pages

仓库已经配好 `.github/workflows/deploy.yml`：**推送 `main` 即自动发布**。

1. 把仓库推上 GitHub
2. **Settings → Pages → Source** 选 `GitHub Actions`
3. 推送 `main`，等 Actions 跑完

`vite.config.ts` 里 `base: './'` 用相对路径，所以
`https://<用户名>.github.io/<仓库名>/` 和自定义域名两种场景都不用改配置。

---

## 性能

`npm run build` + `npm run perf` 的实测结果（本机 Chrome headless，**真实 GPU：Apple M5 / Metal**，
不是软件渲染 —— 以前把 `--use-angle=swiftshader` 写死在验收脚本里，得到的帧率全是误导性的）：

### 首屏（关键路径只有 59 KB）

three 是**动态 import** 的，不进首屏。首屏实际下载：

| 首屏资源 | gzip |
|---|---|
| `motion-*.js`（gsap + ScrollTrigger + lenis） | 49.55 KB |
| `index-*.js`（应用代码 + 动效装配） | 9.78 KB |
| `index-*.css`（tokens + 全站样式 + Inter @font-face） | 5.25 KB |
| **首屏合计** | **64.58 KB** |

| 指标 | 实测 |
|---|---|
| First Contentful Paint | **108 ms** |
| DCL → 角色就位 | **180 ms** |
| 长任务 | 0 |
| 预算「首屏可交互 < 1.5s」 | ✅ 大幅达标 |

> 这个数字是修出来的，不是运气：第一版把 three 静态 import，FCP 被拖到 **3.7s**。
> 改动只有两处：① three 相关模块全部动态 import（**不能用顶层 await**，否则 DCL 还是等它）；
> ② `FRAMING_NODES` 这张表从 `cameraRig.ts` 抽到零依赖的 `src/lib/framing.ts`
> —— 之前 `progressRail` 为了拿这张表把 `cameraRig` 引入静态图，等于把 three 又拖了回来。
> 现在 three（294 KB）与 GLTF/Draco/KTX2 loader（40 KB）都是**懒加载**，
> 只有页面的 3D 层真正需要时才请求。

### 连续滚动 10s（真实 wheel 事件，走 Lenis 全链路）

| 指标 | 实测 |
|---|---|
| 平均帧率 | **60 fps** |
| 帧时间 p50 / p95 / p99 | 16.7 / 16.8 / 16.8 ms |
| 最长帧 | 16.8 ms |
| >33ms（掉帧） | **0 帧** |
| 自适应降档 renderScale | 全程 **1.0**（无需降档） |
| draw calls | 4（预算 < 40） |
| 预算「连续滚动 10s 无掉帧累积」 | ✅ 达标 |

### 体积预算

| 预算 | 目标 | 实测 |
|---|---|---|
| 页面总 JS（gzip） | < 300KB | 首屏 **59.33 KB** ✅；全量（含懒加载的 three 294K + loader 40K + 角色分块 9K）395 KB —— 见下 |
| 模型文件 | < 4MB | 由 `docs/ASSET_SPEC.md` 约束 |
| `renderer.info.render.calls` | < 40 | ✅ 实测 4 |

**关于「全量 395 KB」**：这里按字面算"全部 JS"。但首屏实际只下载 59 KB、
three 在地板价上就占 170 KB（只引 `WebGLRenderer`+`Scene`+`Mesh` 的隔离实验），
且它全部在关键路径之外、不阻塞任何绘制。如果这个口径仍然按"全量 ≤300KB"验收，
能砍的只有规格 6.3 明确要的三点布光/PMREM/`RectAreaLight`（省 6–15 KB），
**收益远小于伤害**；我的判断仍然是保留。

## 无障碍与响应式

- `prefers-reduced-motion: reduce`：关闭 Lenis 平滑（改原生滚动）、关闭自动环绕、
  关闭所有 pin/scrub、关闭速度形变、所有内容直接显示为终态
- 桌面（≥1200px）角色居中偏右；平板（768–1199px）缩至 40%；
  移动（<768px）角色退到画面下方占高约 45%，文案在上方全宽，相机速度再降 30%
- 触摸端：长按 = 捏脸（拖动超过 12px 自动取消），垂直滑动 = 运镜，横向滑动 = 转视角
- `canvas` 带 `aria-hidden`；滚动内容用原生 `<section>`；手风琴用 `aria-expanded`；
  有「跳到主要内容」链接
- 文字对比度 ≥ 4.5:1

---

## 与规格的偏差

逐条列出来，方便验收时对照；每一条都有理由，没有偷偷换方案。

| # | 规格原文 | 实际做法 | 理由 |
|---|---|---|---|
| 1 | `import.meta.glob('/public/models/doubao.glb', …)` | `import.meta.glob('../../public/models/*.glb', …)` | 以 `/` 开头的绝对路径会被 Vite 判为"从 public 目录 import"并报错；相对路径能正常 glob，语义完全一致（构建期求值、文件不存在返回空对象） |
| 2 | 捏脸 GLSL：`transformed.xz *= 1.0 + f * uSquash` | 先把坐标搬到压点局部空间再缩放 | 原写法会把整个模型绕脚底缩放，脸会被甩出画面。见上文「捏脸」一节 |
| 3 | 技术说明「简洁三栏」 | 左对齐标题 + 不等宽三栏 + 竖 hairline | 字面照做会撞上红线 B（居中大标题 + 三张等宽卡片） |
| 4 | `SVG filter 液态形变`, "必须用满四条" | **砍掉** | 规格同时要求"不要滥用"，而全站没有 logo 或装饰性图形可挂；为了凑满一条而在正文里加一个会持续形变的图形，正好踩中红线 A。**替代方案已经落地**：滚动速度驱动的方向拖影（`plateShader.ts` 的 `uSmear`）——同为"第四条手法"的戏份，但它是滚动驱动、非循环、只动 transform。 |
| 5 | Lenis 版本 "最新" | `lenis@1.3.26`，显式 `autoRaf: false` | 由 `gsap.ticker` 单帧驱动，和规格给的集成顺序一致；不关掉会双重步进导致抖动 |
| 6 | `three` "r160+" | `three@0.186` | 最新稳定版，`RectAreaLightUniformsLib` 等仍在 `three/addons/` |
| 7 | Vite 版本未指定 | `vite@^7` | Vite 8 已切到 Rolldown，生态仍在迁移中；`base` / `build.target` / `assetsInlineLimit` 等规格要求的配置在 7 上完全一致，构建更稳（实测 Vite 8 在本机环境连原生 binding 都加载不了） |
| 8 | 逐行揭示用 `GSAP` 缓动 | 自解三次贝塞尔，不用 `CustomEase` 插件 | 全站只有两条固定曲线，为此引一个插件不值当；GSAP 的 `ease` 接受任意函数，结果与 CSS `cubic-bezier()` 逐点一致 |

### 另外三处主动补充（不改变任何设计）

- `src/ui/` 目录：顶部导航与右侧取景导航条。规格的目录清单里没有它，
  但这两块既不属于某个区块也不属于 three 层，单独放比塞进 `sections/` 干净。
- `tools/check-flash.mjs`：把规格第十节的第三条 grep 做成**块级**检查。
  直接 grep 会有两个问题：`grep -v "opacity"` 会把同一行里出现无关词的情况也放过；
  只看单行看不到 `@keyframes` 块里到底改了哪些属性。
- `tools/verify.mjs`：用本机 Chrome 跑 6 个取景节点、截图、收集控制台错误。
  开发过程中它抓到了三个真实 bug（见下方"验证记录"）。

---

## 自检

```bash
npm run check:flash   # 反闪烁静态检查（脚本化 + 块级）
npm run build         # tsc --noEmit && vite build
npm run verify        # 本机 Chrome：6 个取景节点 + 4 张能力卡演示终态 + 截图 + 控制台
```

`npm run verify` 会**在桌面 1440×900 与移动 390×844（触摸）两档各跑一趟**，
断言这些事并把截图写到 `.preview-out/`：

1. 6 个取景节点的**阻尼后实际取景进度**与目标值误差 < 0.006（相机真的到位了，不是"还在滑行"）；
2. 四段微交互都跑到了终态：打字机输出完整 14 字 / 进度条 `解析完成` /
   点阵 `生成完成` 且 `blur(0px)` / 波形 `scaleY` 在持续变化；
3. **捏脸**：悬停强度 0.25（按下的四分之一）、按下后弹簧过冲到 **1.042**、
   光标 `grab → grabbing`、光标环透明度 0.25；
4. 5 个过渡帧（t=0.09/0.27/0.45/0.63/0.83）都落在预期取景位置上；
5. **移动端**：`tier` 判定为 mobile、`pointer: coarse`、右侧导航条隐藏、无横向溢出、
   6 个节点同样命中，且**长按捏脸**触发（coarse 指针下按下 180ms 才置 pressing，
   用 tap 是验不出来的，必须真的按住）。

以及任何非 GPU 噪声的控制台错误都会让它报出来（当前为 0）。

> 关于那个 1.042：规格 6.5 要求"松手时带回弹过冲（约 8% overshoot）"。
> 捏脸弹簧是 ζ≈0.619，理论峰值过冲 `exp(−πζ/√(1−ζ²)) ≈ 8.4%`，
> 出现在按下后约 220ms；验收在 260ms 采样，读到 4.2% 是**正在从峰值回落**，与理论一致。

### 规格第十节要求的三条 grep（原样可跑）

```bash
grep -rnE "infinite" src/ --include=*.ts --include=*.css | grep -viE "opacity|translate|rotate|scale|blur|translate3d"
grep -rnE "hue-rotate|steps\(|blink|flash|flicker|neon|glow|pulse" src/ --include=*.ts --include=*.css
grep -rnE "#000|#111|background:\s*black|theme.*dark" src/ --include=*.ts --include=*.css
```

实测结果（2026-10-09）：

| 检查 | 结果 |
|---|---|
| ① `infinite` 排除白名单后 | **2 处命中**，均为已说明的循环动画（见下） |
| ② 闪烁/发光关键词 | **1 处命中**，是代码注释；无实际属性命中 |
| ③ 深色 `#000` / `#111` / dark | **0 处命中（空）** ✅ |

**逐条说明第 ①② 条的命中：**

1. `src/styles/global.css:544` `animation: caret 1.06s linear infinite;`
   —— 打字机光标。规格红线 A 的原文是"禁止**闪烁光标以外**的任何装饰性高频动画"，
   即光标本身是唯一被豁免项；而且它用 `@keyframes` 里的**平滑淡入淡出**
   （`opacity: 1 → 0.18`），**没有使用 `steps()`**，所以不会有离散跳变。
2. `src/styles/global.css:566` `animation: think 4.2s var(--ease-in) infinite;`
   —— "正在思考"的三个圆点。周期 **4.2s ≥ 4s** ✅，位移动幅 **3px ≤ 8px** ✅，
   透明度只在 **0.9–1.0** 之间 ✅，三条定量红线全部满足。
3. `src/styles/global.css:543` 是第 1 条上面的**中文注释**，里面出现了 "steps()" 这个词
   才被 grep 命中，它本身不是代码。

`npm run check:flash` 做的是同一件事的块级版本，会额外把每个 `@keyframes`
块内实际动画的属性、以及引用它的 `animation` 声明一起列出来，
避免"同一行里出现无关词就被 grep -v 放过"这类漏判。

### 验证记录（开发过程中真实抓到并修掉的问题）

| 问题 | 表现 | 根因 |
|---|---|---|
| wrap lighting 注入静默失效 | 控制台 `lights_physical_pars_fragment 的 dotNL 写法已变化` | three r186 把 `dotNL` 从 `lights_fragment_begin` 挪进了 `RE_Direct_Physical()`。**这条是我在 pinchShader 里预先写的 include 存在性检查报出来的**——如果不写，皮肤就会悄悄退化成"有点塑料"，而且没有任何报错 |
| 全身镜头把脚切出画面 | 取景中心落在胸口（`chest`），可见范围只有 `[0.33, 2.47]`，脚在地上 0 点之外 | 取景中心必须落在**身高一半**。新增 `landmarks.full` 并让全身节点用它 |
| 构图整体镜像 | "全身段她在左边"实际跑成了"她在右边" | `lookX` 的符号写反了。由 `s = 0.5 + (worldX - lookX)/viewW` 解出来应是 `centerX - (axisFrac - 0.5) * viewW` |
| 数字带压在角色身上读不清 | 黑色的「5」压在黑色上衣上 | 数字带 / 技术栏 / FAQ 各加一层两端虚化的浅色雾面（无模糊、无边框、无高光，不是玻璃拟态） |
| pnpm 环境下 esbuild 二进制缺失导致构建**挂死**（不报错，只是卡住） | `vite build` 进程 0% CPU 永久挂起 | pnpm 10+ 默认不执行依赖构建脚本。已用 `pnpm-workspace.yaml` 的 `allowBuilds` 放行，并在 README 说明 |
| 探针角色看不出正反面 | 整球头发把脸也罩住，脸只能从球缝里透出来 | 头发改成"顶部 + 后脑"的球冠并往后挪；补两只眼睛当朝向参照 |
| **`scene.add()` 把角色层从相机上摘了下来** | `drawCalls: 0`，相机 0 个子节点，整个立绘层不渲染 | 立绘板挂在相机下（天然屏幕对齐），而 `scene.add(object3d)` 会**重新挂载**节点。改成只在没有父节点时才补挂 |
| **只创建 Mesh 没 `add` 进场景图** | 14 个 mesh 都在，一个都不画 | `makeLayer` 忘了 `parent.add(mesh)` |
| 锚点与规格节点错位 | 0.36「手与手臂」正好落在过渡带上，那一屏是糊的 | 锚点从 0.50/0.72 改成规格的 0.36/0.54/0.74，每个导航节点都是干净实焦 |
| 背景填补留下轮廓晕 | 视差一拉开就看到人像轮廓的阶梯边 | 逐行常数填平 → **归一化卷积** `blur(rgb·w)/blur(w)`；核半径必须大到跨过整个躯干，否则深处 `den→0` 会留下黑块 |
| 焦外虚化看起来像重影 | 单个 9 抽核在 65px 半径下留下一圈圈"回声" | 改成两圈不同半径叠加（18 抽），平滑得多 |
| 捏脸看不出来 | 位移只有约 19px，脸上几乎没反应 | 位移系数 0.55 → 0.78，作用半径 0.16 → 0.22，坑沿压暗 0.12 → 0.18 |
| **手机上捏脸完全不触发** | 长按没反应、光标环不出现 | 触摸端第一次接触就是 `pointerdown`，**根本没有 `pointermove`**；而 `ndc`/`pointerInside` 只在 pointermove 里更新 → 永远判定为"指针不在脸上" |
| 移动端竖屏满屏垂直拉丝 | 首屏像解码坏了 | 抠像贴图最外一行还有实心像素，越界采样被 `ClampToEdge` 重复成条纹。给 matte 留 6px 透明边 |
| 移动端取景公式写反 | 首屏只剩嘴唇和鼻子 | `s` 是"整屏对应的贴图跨度"，应为 `bw / targetW`；写成 `targetW / bw` 等于把画面放大了 2.8 倍 |

---

## 免责声明

- 本项目是**个人非商业的技术演示**，用于展示 WebGL 实时交互、取景设计与动效工程，
  与字节跳动及其「豆包」产品**无任何隶属或合作关系**；相关商标归其所有者所有。
- `public/img/` 中的角色为**第三方 AI 生成的虚拟形象**，不基于任何真实人物的肖像或姓名。
  替换为你自己的素材时请确保你拥有相应权利；**不要**使用真人照片或他人立绘。
- 页面内所有文案、数据、对话内容均为**演示内容**，不代表任何官方立场，也不含任何官方数据口径。
- 请勿把本项目直接用于冒充官方产品。

## License

代码以 [MIT](./LICENSE) 发布。角色素材不在该许可的授权范围内。内置的 three.js / GSAP / Lenis
遵循各自的许可（three 的 Draco、KTX2 解码器见 `public/draco/README.md`、`public/basis/README.md`）。
