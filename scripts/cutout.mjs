#!/usr/bin/env node
/**
 * Détourage : transforme le fond blanc des images générées en transparence (PNG).
 * Remplissage par diffusion depuis les bords → le blanc à l'INTÉRIEUR du dessin (yeux, dents, gants) est conservé.
 *
 * Usage :
 *   npm run assets:cutout                     tous les .jpg de sprites/ et cards/
 *   npm run assets:cutout -- sprites/ghost.jpg
 *   npm run assets:cutout -- --tolerance 40   seuil de "blanc" (défaut 32)
 */
import sharp from 'sharp';
import { readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const assets = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'client/public/assets');
const args = process.argv.slice(2);
const tIdx = args.indexOf('--tolerance');
const tol = tIdx >= 0 ? Number(args[tIdx + 1]) : 32;
let files = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--tolerance');
if (!files.length) {
  files = ['sprites', 'cards'].flatMap((d) => existsSync(join(assets, d)) ? readdirSync(join(assets, d)).filter((f) => f.endsWith('.jpg')).map((f) => `${d}/${f}`) : []);
}

for (const rel of files) {
  const src = join(assets, rel);
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const isBg = (i) => 255 - data[i] < tol && 255 - data[i + 1] < tol && 255 - data[i + 2] < tol;
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop();
    if (seen[p]) continue;
    seen[p] = 1;
    if (!isBg(p * 4)) continue;
    data[p * 4 + 3] = 0;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  const out = src.replace(/\.(jpe?g|png)$/, '.png');
  await sharp(data, { raw: { width: w, height: h, channels: 4 } }).trim().png().toFile(out);
  console.log(`✂️  ${rel} → ${out.slice(assets.length + 1)}`);
}
