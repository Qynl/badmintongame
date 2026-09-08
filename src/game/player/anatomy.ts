import { CanvasTexture, LatheGeometry, RepeatWrapping, Vector2 } from 'three';
/** Rounded profiles retain wrist taper and forearm volume instead of stretching a cylinder. */
export function forearmGeometry() {
  const points = [
    [0.045, -0.5], [0.052, -0.46], [0.059, -0.32], [0.061, -0.18],
    [0.055, 0.0], [0.043, 0.23], [0.032, 0.43], [0.029, 0.5],
  ].map(([r, y]) => new Vector2(r, y));
  const geometry = new LatheGeometry(points, 28); geometry.scale(1, 1, 0.84); return geometry;
}
export function upperArmGeometry() {
  const points = [[0.066, -0.5], [0.074, -0.35], [0.078, -0.17], [0.072, 0.08], [0.058, 0.4], [0.049, 0.5]].map(([r, y]) => new Vector2(r, y));
  return new LatheGeometry(points, 24);
}
let pores: CanvasTexture | null = null;
export function skinTexture() {
  if (pores) return pores;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d')!, data = context.createImageData(128, 128);
  let seed = 39;
  for (let i = 0; i < data.data.length; i += 4) {
    seed = (seed * 16807) % 2147483647; const value = 185 + seed % 45;
    data.data[i] = data.data[i + 1] = data.data[i + 2] = value; data.data[i + 3] = 255;
  }
  context.putImageData(data, 0, 0); pores = new CanvasTexture(canvas);
  pores.wrapS = pores.wrapT = RepeatWrapping; pores.repeat.set(3, 5); return pores;
}
