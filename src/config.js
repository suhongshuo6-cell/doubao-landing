/**
 * 全局配置：明亮棚拍主题 / 立绘取景分镜 / 交互参数 / 数学工具
 *
 * 取景坐标全部用「原图像素」表达（原图 1280×720，人物头顶 y≈8、脚底 y≈700、身体中轴 x≈645）。
 * 三个视图（正面/侧面/背面）的垂直位置是对齐的，所以同一套取景参数可以直接复用。
 */

export const PALETTE = {
  /* 页面基调：浅灰米白棚拍 */
  bg0: '#F3F1EC',
  bg1: '#EDEBE6',
  bg2: '#E8E6E1',
  /* 立绘画面边缘的背景色（取景超出原图时的兜底色，保证「消失在背景里」）*/
  studio: '#CFC9C9',
  studioDark: '#BEB8B6',
  /* 文字 */
  fg: '#1C1B1A',
  /* 唯一点缀色：围巾红 */
  accent: '#D9182B',
  accentSoft: 'rgba(217,24,43,.10)'
};

/** 立绘与取景 */
export const PORTRAIT = {
  /** 原图尺寸（取景坐标以此为基准，与预处理后的纹理尺寸无关） */
  imgW: 1280,
  imgH: 720,
  /** 人物身体中轴（转身时的枢轴） */
  cx: 645,
  /** 三视图贴图 */
  views: ['front', 'side', 'back'],
  /** 面部区域（原图像素）——只有指针落在这里才启用捏脸 */
  faceBox: { x0: 596, x1: 700, y0: 20, y1: 98 },
  /** 脸上可见的高度小于这个值（原图像素）时，脸部才足够大、捏脸才有意义 */
  pinchMaxViewH: 300,
  /** 按压半径（原图像素）与强度上限 */
  pressRadius: 46,
  pressMax: 0.62,
  /** 悬停时的浅按压 */
  pressHover: 0.16,
  /** 横向拖拽：每拖动多少像素切换一个视图 */
  turnDragPx: 340,
  /** 转身吸附回弹（欠阻尼弹簧） */
  turnSpring: { k: 150, c: 17 },
  /** 竖屏时取景宽度的收窄系数（让头部在窄屏上也占满画面）*/
  portraitShrink: 0.42,
  /** 指针视差幅度（原图像素） */
  parallax: 7
};

/**
 * 分镜表：id 与 index.html 的 [data-beat] 一一对应。
 * frame = 该分镜的取景：cy 为中心高度（原图像素，从上往下），w 为可见宽度（原图像素，横屏基准）。
 * 锚点 p 由 DOM 真实位置算出（见 portraitRig），改文案不会让取景与文字错位。
 */
export const BEATS = [
  { id: 'hero',     idx: '00', name: '开场', en: 'OVERTURE',      frame: { cy: 54,  w: 196 } },
  { id: 'face',     idx: '01', name: '面容', en: 'THE FACE',      frame: { cy: 56,  w: 170 } },
  { id: 'neck',     idx: '02', name: '颈肩', en: 'BREATH',        frame: { cy: 116, w: 250 } },
  { id: 'chest',    idx: '03', name: '心意', en: 'SHE LISTENS',   frame: { cy: 172, w: 300 } },
  { id: 'waist',    idx: '04', name: '腰线', en: 'SHE REMEMBERS', frame: { cy: 246, w: 300 } },
  { id: 'arms',     idx: '05', name: '手臂', en: 'SHE SPEAKS',    frame: { cy: 200, w: 430 } },
  { id: 'legs',     idx: '06', name: '长腿', en: 'SHE WALKS',     frame: { cy: 508, w: 300 } },
  { id: 'feet',     idx: '07', name: '赤足', en: 'TOUCH GROUND',  frame: { cy: 654, w: 380 } },
  { id: 'full',     idx: '08', name: '全身', en: 'FULL VIEW',     frame: { cy: 354, w: 1150 } },
  { id: 'download', idx: '09', name: '下载', en: 'GET STARTED',   frame: { cy: 372, w: 1330 } }
];

/**
 * 开场：不做粒子、不做闪光，只做一次「推近 + 对焦」。
 * 从稍紧的取景与轻微焦外，缓慢落到首屏构图。
 */
export const INTRO = {
  total: 2.1,
  zoomFrom: 1.16,   // 起始额外放大倍率
  blurFrom: 2.6,    // 起始焦外（原图像素）
  breathe: 0.013,   // 呼吸补光幅度
  breathePeriod: 7.2
};

export const QUALITY = {
  high:   { label: 'HIGH',   dpr: 2.0, grain: 0.012, sharpen: 0.34, anisotropy: 8 },
  medium: { label: 'MEDIUM', dpr: 1.5, grain: 0.010, sharpen: 0.22, anisotropy: 4 },
  low:    { label: 'LOW',    dpr: 1.0, grain: 0.006, sharpen: 0.00, anisotropy: 1 }
};

/* ───────── 数学工具 ───────── */
export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a));

/** 支持 a > b 的 smoothstep */
export function sstep(a, b, x) {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

export const easeInOutCubic = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
export const easeOutExpo = t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/** 帧率无关的阻尼插值 */
export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}
