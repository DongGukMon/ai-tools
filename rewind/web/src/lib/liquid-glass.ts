// Displacement map generation for liquid glass effect
// Adapted from https://github.com/shuding/liquid-glass

function smoothStep(a: number, b: number, t: number): number {
  t = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

let displacementCanvas: HTMLCanvasElement | null = null;
let displacementContext: CanvasRenderingContext2D | null = null;

function len(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

function roundedRectSDF(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): number {
  const qx = Math.abs(x) - w + r;
  const qy = Math.abs(y) - h + r;
  return (
    Math.min(Math.max(qx, qy), 0) +
    len(Math.max(qx, 0), Math.max(qy, 0)) -
    r
  );
}

type Vec2 = { x: number; y: number };
type FragmentFn = (uv: Vec2, mouse: Vec2) => Vec2;

export function generateDisplacementMap(
  width: number,
  height: number,
  fragment: FragmentFn,
  mouse: Vec2 = { x: 0.5, y: 0.5 },
): { dataUrl: string; scale: number } {
  if (!displacementCanvas) {
    displacementCanvas = document.createElement("canvas");
  }
  if (
    displacementCanvas.width !== width ||
    displacementCanvas.height !== height
  ) {
    displacementCanvas.width = width;
    displacementCanvas.height = height;
  }

  if (!displacementContext) {
    displacementContext = displacementCanvas.getContext("2d");
  }
  if (!displacementContext) {
    throw new Error("2d canvas context is unavailable");
  }

  const total = width * height * 4;
  const data = new Uint8ClampedArray(total);
  let maxScale = 0;
  const raw: number[] = [];

  for (let i = 0; i < total; i += 4) {
    const px = (i / 4) % width;
    const py = Math.floor(i / 4 / width);
    const pos = fragment({ x: px / width, y: py / height }, mouse);
    const dx = pos.x * width - px;
    const dy = pos.y * height - py;
    maxScale = Math.max(maxScale, Math.abs(dx), Math.abs(dy));
    raw.push(dx, dy);
  }

  maxScale = Math.max(maxScale * 0.5, 1);

  let idx = 0;
  for (let i = 0; i < total; i += 4) {
    data[i] = (raw[idx++] / maxScale + 0.5) * 255;
    data[i + 1] = (raw[idx++] / maxScale + 0.5) * 255;
    data[i + 2] = 0;
    data[i + 3] = 255;
  }

  displacementContext.putImageData(new ImageData(data, width, height), 0, 0);
  return { dataUrl: displacementCanvas.toDataURL(), scale: maxScale };
}

/** Header fragment: edge refraction + mouse-tracking lens */
export const headerFragment: FragmentFn = (uv, mouse) => {
  const ix = uv.x - 0.5;
  const iy = uv.y - 0.5;

  // Edge refraction via rounded rect SDF
  const d = roundedRectSDF(ix, iy, 0.46, 0.38, 0.1);
  const edge = smoothStep(0.45, 0, d - 0.03);
  const edgeScale = smoothStep(0, 1, edge) * 0.08;

  // Mouse-following lens
  const mx = (mouse.x - 0.5) * 0.25;
  const my = (mouse.y - 0.5) * 0.25;
  const dist = len(ix - mx, iy - my);
  const mouseScale = smoothStep(0.3, 0, dist) * 0.05;

  const s = edgeScale + mouseScale;
  return { x: ix * s + 0.5, y: iy * s + 0.5 };
};

export const HEADER_FILTER_ID = "liquid-glass-header";
export const CARD_FILTER_ID = "liquid-glass-card";
