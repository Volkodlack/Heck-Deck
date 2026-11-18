#!/usr/bin/env node
/**
 * HEX DECK — Génération des visuels via Cloudflare Workers AI (FLUX.1 [schnell], palier gratuit).
 *
 * Prérequis (.env à la racine) :
 *   CLOUDFLARE_ACCOUNT_ID=...   (Dashboard Cloudflare → colonne de droite "Account ID")
 *   CLOUDFLARE_API_TOKEN=...    (My Profile → API Tokens → Create Token → modèle "Workers AI")
 *
 * Usage :
 *   npm run assets                      génère tout ce qui n'existe pas encore
 *   npm run assets -- ghost hex-ace     génère seulement ces assets
 *   npm run assets -- --force           régénère tout
 *   npm run assets -- ghost --variants 4   4 propositions (ghost-1.png … ghost-4.png) pour choisir
 *   npm run assets -- --dry             affiche les prompts sans appeler l'API
 *
 * Les prompts et le style commun sont dans scripts/asset-prompts.json : modifie-les librement.
 * Sortie : client/public/assets/<dossier>/<nom>.jpg (fond blanc → détourage en PNG transparent, voir ASSETS_GUIDE.md).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODEL = '@cf/black-forest-labs/flux-1-schnell';

// Lecture minimaliste du .env (pas de dépendance)
const envFile = join(root, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const args = process.argv.slice(2);
const force = args.includes('--force');
const dry = args.includes('--dry');
const vIdx = args.indexOf('--variants');
const variants = vIdx >= 0 ? Math.max(1, Number(args[vIdx + 1]) || 1) : 1;
const only = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--variants');

const { style, assets } = JSON.parse(readFileSync(join(root, 'scripts/asset-prompts.json'), 'utf8'));
const list = only.length ? assets.filter((a) => only.includes(a.name)) : assets;
if (only.length && list.length !== only.length) {
  console.error('Noms inconnus. Disponibles :', assets.map((a) => a.name).join(', '));
  process.exit(1);
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!dry && (!accountId || !token)) {
  console.error('❌ CLOUDFLARE_ACCOUNT_ID et CLOUDFLARE_API_TOKEN manquants dans .env (voir l’en-tête de ce script).');
  process.exit(1);
}

async function generate(prompt, seed) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, steps: 8, seed }), // 8 = maximum de flux-1-schnell (meilleure qualité)
  });
  if (res.status === 429) throw new Error('Quota gratuit du jour atteint (429). Réessaie après minuit UTC.');
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.result?.image) throw new Error(`API ${res.status} : ${JSON.stringify(json?.errors ?? json)}`);
  return Buffer.from(json.result.image, 'base64');
}

let made = 0;
for (const a of list) {
  const prompt = `${a.prompt}, ${style}`;
  for (let v = 1; v <= variants; v++) {
    let out = variants > 1 ? a.out.replace(/(\.\w+)$/, `-${v}$1`) : a.out;
    let file = join(root, 'client/public/assets', out);
    const jpgFile = file.replace(/\.png$/, '.jpg');
    if ((existsSync(file) || existsSync(jpgFile)) && !force) { console.log(`⏭  ${out} existe déjà (--force pour régénérer)`); continue; }
    if (dry) { console.log(`📝 ${out}\n   ${prompt}\n`); continue; }
    const seed = Math.floor(Math.random() * 2 ** 31);
    process.stdout.write(`🎨 ${out} (seed ${seed})… `);
    try {
      const img = await generate(prompt, seed);
      // FLUX renvoie du JPEG : on garde la bonne extension (le détourage produira ensuite un PNG transparent).
      if (img[0] === 0xff && img[1] === 0xd8) { file = jpgFile; out = out.replace(/\.png$/, '.jpg'); }
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, img);
      made++;
      console.log(`✓ ${out}`);
    } catch (e) {
      console.log('✗');
      console.error('   ', e.message);
      if (String(e.message).includes('429')) process.exit(2);
    }
  }
}
if (!dry) console.log(`\n${made} image(s) générée(s) dans client/public/assets/. Pense à noter les seeds retenues et à compléter CREDITS.md.`);
