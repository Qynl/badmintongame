import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
let floorTexture: CanvasTexture | undefined;
let courtTexture: CanvasTexture | undefined;
export function woodTexture() {
  if (floorTexture) return floorTexture;
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 1024;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#9b7851'; c.fillRect(0, 0, 1024, 1024);
  let seed = 123;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let row = 0; row < 16; row++) {
    for (let col = -1; col < 4; col++) {
      const x = col * 350 + (row % 3) * 110, y = row * 64;
      const light = 50 + random() * 5;
      c.fillStyle = `hsl(34, 30%, ${light}%)`; c.fillRect(x + 1, y + 1, 348, 62);
      for (let k = 0; k < 28; k++) { c.strokeStyle = `rgba(52, 30, 13, ${random() * 0.13})`; c.lineWidth = random() * 1.3; c.beginPath(); const sy = y + random() * 64; c.moveTo(x, sy); c.bezierCurveTo(x + 80, sy + random() * 5, x + 230, sy - random() * 5, x + 350, sy); c.stroke(); }
    }
  }
  floorTexture = new CanvasTexture(canvas); floorTexture.wrapS = floorTexture.wrapT = RepeatWrapping; floorTexture.repeat.set(6, 8); floorTexture.colorSpace = SRGBColorSpace; floorTexture.anisotropy = 8; return floorTexture;
}
export function sportsTexture() {
  if (courtTexture) return courtTexture;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const c = canvas.getContext('2d')!; c.fillStyle = '#c5ccc7'; c.fillRect(0, 0, 512, 512);
  const image = c.getImageData(0, 0, 512, 512);
  for (let i = 0; i < image.data.length; i += 4) { const n = (Math.random() - 0.5) * 18; image.data[i] += n; image.data[i + 1] += n; image.data[i + 2] += n; }
  c.putImageData(image, 0, 0);
  courtTexture = new CanvasTexture(canvas); courtTexture.wrapS = courtTexture.wrapT = RepeatWrapping; courtTexture.repeat.set(9, 16); courtTexture.anisotropy = 8; courtTexture.colorSpace = SRGBColorSpace; return courtTexture;
}
export function labelTexture(text: string, color = '#e5e8dc', bg = '#1b302c', width = 1024, height = 256) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const c = canvas.getContext('2d')!; c.fillStyle = bg; c.fillRect(0, 0, width, height);
  c.fillStyle = color; c.font = `600 ${height * 0.49}px Arial`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, width / 2, height * 0.52, width * 0.86);
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.anisotropy = 4; return texture;
}
