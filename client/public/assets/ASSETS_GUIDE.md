# 🎨 HEX DECK — Guide des assets (100 % gratuits & libres)

Le jeu est **jouable sans aucun fichier** dans ce dossier : personnages, cartes, mobilier, fantôme,
onomatopées et sons sont générés en code (SVG, Canvas 2D, Web Audio API).
Ce guide sert à **remplacer** ces rendus procéduraux par des visuels/sons plus riches, sans jamais
sortir du gratuit et libre de droit.

```
client/public/assets/
├── sprites/   personnages, fantôme, objets (PNG transparents)
├── tiles/     sols, murs, décors des pièces
├── audio/     bruitages et musiques (OGG/MP3)
└── cards/     illustrations de cartes spéciales
```
Tout fichier placé ici est servi tel quel à l'URL `/assets/...` (ex : `/assets/cards/poltergeist.png`).

---

## 0. ⚡ Génération automatique via Cloudflare Workers AI (recommandé)

Le repo contient un générateur prêt à l'emploi qui produit **tous** les visuels du jeu dans la direction
artistique HEX DECK : cartoon « rubber hose » années 30 (jambes en nouilles, gants blancs, grosses chaussures),
encre noire épaisse et tremblée, hachures croisées, grands yeux noirs et sourire plein de dents. La palette
est limitée au **vert toxique** et au **violet profond**, avec du blanc cassé.

- Modèle : `@cf/black-forest-labs/flux-1-schnell` (FLUX.1 [schnell], licence Apache-2.0 : les images
  sont utilisables commercialement).
- Coût : **gratuit** dans les 10 000 neurones offerts chaque jour par Cloudflare (largement de quoi
  générer tout le jeu, plusieurs fois).

**Mise en place (5 minutes)**
1. Crée un compte gratuit sur https://dash.cloudflare.com.
2. Récupère ton **Account ID** (colonne de droite de l'accueil du dashboard).
3. **My Profile → API Tokens → Create Token** → modèle **« Workers AI »** → copie le jeton.
4. Ajoute-les dans `.env` : `CLOUDFLARE_ACCOUNT_ID=…` et `CLOUDFLARE_API_TOKEN=…`

**Commandes**
```bash
npm run assets -- --dry                 # voir les prompts sans rien générer
npm run assets                          # générer tout ce qui manque
npm run assets -- ghost --variants 4    # 4 propositions du Fantôme pour choisir la meilleure
npm run assets -- hex-ace --force       # régénérer un asset précis
npm run assets:cutout                   # fond blanc → PNG transparent (sprites/ et cards/)
```
Les prompts et le style commun se règlent dans **`scripts/asset-prompts.json`** : la clé `style`
s'ajoute à chaque prompt, ce qui garantit la cohérence visuelle de l'ensemble. Pour un asset retenu,
note sa seed (affichée à la génération) dans `CREDITS.md`.

FLUX renvoie des JPEG sur fond blanc. `npm run assets:cutout` retire le fond depuis les bords et garde
le blanc intérieur (yeux, dents, gants), puis enregistre un PNG transparent à côté du JPEG.

---

## 1. Règle d'or des licences

| Licence | Utilisable ? | Remarque |
|---|---|---|
| **CC0 / Domaine public** | ✅ Oui, sans condition | Idéal. Aucune attribution requise. |
| **MIT / Apache-2.0** (code) | ✅ Oui | Garder la notice de licence. |
| **SIL OFL** (polices) | ✅ Oui | Usage commercial OK, ne pas revendre la police seule. |
| CC-BY | ⚠️ Possible | Attribution obligatoire → à éviter pour rester simple. |
| CC-BY-NC, CC-BY-SA, « free for personal use » | ❌ Non | Incompatible avec la règle du projet. |

👉 Tiens un fichier `CREDITS.md` à jour avec la source et la licence de chaque asset ajouté.

---

## 2. Banques d'assets CC0 recommandées

| Besoin | Source | Filtre à appliquer |
|---|---|---|
| Tuiles de plateau, icônes, cartes à jouer, UI | **Kenney.nl** — https://kenney.nl/assets | Tout Kenney est CC0. Packs utiles : *Playing Cards Pack*, *Board Game Icons*, *Tiny Dungeon*, *Interface Sounds*, *Impact Sounds*. |
| Textures de manoir, sprites rétro | **OpenGameArt.org** — https://opengameart.org | Recherche avancée → License : **CC0** uniquement. |
| Packs indé | **itch.io** — https://itch.io/game-assets/assets-cc0 | Tag **assets-cc0** (vérifie la licence sur chaque page). |
| Bruitages | **Freesound** — https://freesound.org | Filtre *License : Creative Commons 0*. |
| Bruitages / musiques | **Pixabay Sound Effects** — https://pixabay.com/sound-effects/ | Licence Pixabay (gratuite, sans attribution) — non CC0 stricto sensu, à noter dans CREDITS.md. |
| Polices comics / arcade | **Google Fonts** — https://fonts.google.com | *Bangers*, *Press Start 2P*, *Luckiest Guy*, *Creepster* (toutes SIL OFL). |
| Sons 8-bit en code | **ZzFX** — https://github.com/KilledByAPixel/ZzFX | Licence MIT, alternative à `SoundEffects.ts`. |

---

## 3. Générateurs d'images IA gratuits

| Outil | Licence des images générées |
|---|---|
| **FLUX.1 [schnell]** (Cloudflare Workers AI via `npm run assets`, Hugging Face Spaces, ou en local via ComfyUI) | Modèle sous Apache-2.0 : usage commercial des images autorisé. ✅ Recommandé |
| **Stable Diffusion XL** (local : ComfyUI / Fooocus / Automatic1111) | Licence CreativeML OpenRAIL++-M : images utilisables commercialement. ✅ |
| Bing Image Creator, Playground AI… | Soumis aux conditions du service, qui peuvent changer : relis-les avant de publier. ⚠️ |

**Conseils de génération**
- Génère en **1024×1024** (ou 768×1024 pour les cartes), puis réduis.
- Pour la transparence : génère sur fond uni (`plain flat white background`), puis détoure avec
  **rembg** (open source, MIT) : `pip install rembg && rembg i entree.png sortie.png`.
- Décris un **style** (contours, couleurs, époque) plutôt que de citer une œuvre ou une marque :
  tu évites ainsi de produire un visuel trop proche d'une propriété existante.
- Negative prompt conseillé (SDXL) : `photo, realistic, 3d render, blurry, text, watermark, signature, logo, extra limbs`

### 🃏 Cartes spéciales — `cards/`

**Poltergeist (Joker)** → `cards/poltergeist.png`
```
playing card illustration of a mischievous floating poltergeist ghost bursting out of a haunted card,
indie comic book art style, very thick black ink outlines, flat cel shading, hard drop shadow,
neon violet and toxic green palette, speed lines, small floating playing cards around it,
centered composition, plain flat white background, vertical card format
```

**Hex Ace (As maudit)** → `cards/hex-ace.png`
```
cursed ace of spades playing card glowing with toxic green aura, cracked card edges, dripping ectoplasm,
small occult sigil in the center, indie comic book art style, thick black outlines, flat colors,
hard shadows, neon purple accents, centered, plain flat white background
```

**Hex Two (2 maudit)** → `cards/hex-two.png`
```
cursed number two playing card wrapped in green ghostly chains, sparks and smoke, bold comic book style,
thick black linework, flat vivid colors, toxic green glow, centered, plain flat white background
```

**Dos de carte** → `cards/back.png`
```
ornate playing card back design, symmetrical occult pattern, hexagon and pentagram motifs,
deep purple and toxic green, thick black outlines, flat comic style, seamless border, no text
```

### 🏚️ Décors du manoir — `tiles/`

**Hall (vue de dessus)** → `tiles/hall.png`
```
top-down view of a haunted mansion grand hall floor, dark wooden parquet, worn red carpet with gold trim,
a large brass emergency bell in the center, cobwebs in corners, 2D game map tile, indie comic style,
thick outlines, flat colors, moody purple lighting, no characters
```

**Bibliothèque** → `tiles/library.png`
```
top-down view of a haunted library room, tall bookshelves along the walls, scattered books, round ritual
table with a glowing green pentagram, 2D game map, comic book style, thick black outlines, flat dark colors
```

**Cuisine** → `tiles/kitchen.png`
```
top-down view of an abandoned victorian kitchen, cast iron stove, checkered stone floor, broken plates,
eerie green glow, 2D game tile, indie comic style, thick outlines, flat colors, no characters
```

**Cave** → `tiles/cellar.png`
```
top-down view of a damp stone cellar, wooden barrels, puddles, candles, small round ritual table,
2D game map tile, comic book style, thick outlines, desaturated blue and toxic green palette
```

**Grenier** → `tiles/attic.png`
```
top-down view of a dusty attic, wooden beams, old trunks, covered furniture under white sheets,
moonlight through a small window, 2D game tile, indie comic style, thick outlines, flat purple palette
```

### 👻 Sprites — `sprites/`

**Personnage jouable (base à recolorer)** → `sprites/character.png`
```
cute chubby bean-shaped character with a large glass visor and a small backpack, side view, simple
rounded silhouette, no arms, short legs, white body for recoloring, thick black outlines, flat shading,
2D game sprite, plain flat white background
```

**Le Fantôme (IA du mode Escarmouche)** → `sprites/ghost.png`
```
classic bedsheet ghost with hollow black eyes and open mouth, wavy bottom edge, pale mint glow,
thick black outlines, flat comic style, 2D game sprite, plain flat white background
```

**Objets** → `sprites/uv-lamp.png`, `sprites/salt.png`
```
2D game item icon of a handheld UV flashlight emitting purple light, thick black outlines, flat colors, comic style, plain white background
2D game item icon of a salt shaker with spilled salt circle, thick black outlines, flat colors, comic style, plain white background
```

### 💥 Onomatopées (si tu veux des versions illustrées)
```
comic book sound effect burst reading "BOOM!", jagged explosion bubble, yellow and orange, thick black
outlines, halftone dots, plain white background
```
(Remplace `BOOM!` par `SABOTAGE!`, `HEXED!`, `BOUH!`…)

---

## 4. Brancher un asset dans le code

**Images (Canvas)** — dans `client/src/game/draw.ts`, charge l'image une fois et dessine-la si elle
est prête, sinon garde le rendu procédural :
```ts
const ghostImg = new Image();
ghostImg.src = '/assets/sprites/ghost.png';

export function drawGhost(ctx: CanvasRenderingContext2D, x: number, y: number, t: number) {
  if (ghostImg.complete && ghostImg.naturalWidth) {
    ctx.drawImage(ghostImg, x - 40, y - 50 + Math.sin(t * 3) * 6, 80, 100);
    return;
  }
  // … rendu procédural existant …
}
```

**Cartes (SVG)** — dans `client/src/components/PlayingCard.tsx`, remplace le bloc du Poltergeist par
`<image href="/assets/cards/poltergeist.png" x="3" y="3" width="94" height="134" />`.

**Sons** — dans `client/src/game/SoundEffects.ts`, ajoute une méthode qui lit un fichier :
```ts
async playFile(url: string, vol = 0.6) {
  const ctx = this.unlock();
  const buf = await (await fetch(url)).arrayBuffer();
  const src = ctx.createBufferSource();
  src.buffer = await ctx.decodeAudioData(buf);
  const g = ctx.createGain(); g.gain.value = vol;
  src.connect(g).connect(ctx.destination); src.start();
}
// ex : bell() { void this.playFile('/assets/audio/bell.ogg'); }
```
