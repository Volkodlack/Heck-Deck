# 👻 HEX DECK

Jeu web multijoueur (2 à 8 joueurs) dans un manoir hanté, qui mêle trois choses :
- **Déduction sociale** : des Possédés se cachent parmi les Survivants.
- **Chat vocal de proximité** (WebRTC) : tu entends les autres selon la distance et les murs entre vous.
- **Jeu de cartes de défausse** façon Puant / Président, avec des cartes maudites.

Tout le rendu (personnages, cartes, décors, onomatopées) est en **SVG / Canvas** et tous les sons sont
**synthétisés** avec la Web Audio API. Le jeu se lance donc sans télécharger le moindre asset.

Disponible en **site web** (GitHub Pages) et en **APK Android** (Capacitor). Les parties sont hébergées
par les joueurs eux-mêmes, et seuls les comptes, la progression et les statistiques sont centralisés.

---

## 🏠 Architecture : les joueurs hébergent, toi tu ne gardes que les stats

```
            ┌──────────── Supabase (gratuit) ────────────┐
            │ comptes · progression (XP, tuto, chapeaux)  │
            │ stats classées (rapports croisés)           │
            │ mise en relation P2P (Realtime, ~1 Ko)      │
            └─────────────▲───────────────▲───────────────┘
                          │ fin de partie │ code de salle
   ┌──────────────────────┴───┐      ┌────┴──────────────────┐
   │ HÔTE (site ou APK)       │◀────▶│ INVITÉS (site ou APK)  │
   │ moteur de jeu (Worker)   │WebRTC│ rendu + voix           │
   │ + bots                   │ P2P  │                        │
   └──────────────────────────┘      └────────────────────────┘
          TURN Cloudflare (relais si réseau strict, 1 000 Go/mois gratuits)
```

- **Solo et tutoriel** : 100 % hors-ligne, le moteur et les bots tournent sur l'appareil.
- **En ligne** : la partie tourne sur l'appareil de l'hôte. Les invités s'y connectent directement
  en WebRTC avec le code à 6 lettres, et Supabase ne sert qu'à la mise en relation.
- **Serveur dédié (optionnel)** : pour une salle permanente (LAN, association, Discord), avec
  `docker compose up -d` ou `npm start`. C'est le même moteur.
- **Ce qui est stocké chez toi** : uniquement les profils, la progression et les statistiques.

Le même moteur (`shared/src/engine`) tourne sur le serveur Node, dans le navigateur (Web Worker) et
dans l'APK.

### Statistiques sans serveur de jeu central
Comme les parties tournent chez les joueurs, chaque joueur connecté envoie **son propre** rapport de
fin de partie (`submit_game_report`), avec son compte.
- **Progression (XP, niveaux, chapeaux)** : toujours accordée, y compris contre les bots (moitié
  d'XP), avec une limite de 40 rapports par jour.
- **Stats classées** (parties, victoires) : une partie ne compte que si **au moins 2 comptes
  différents** envoient des rapports **concordants** (même partie, même camp vainqueur, même liste de
  joueurs), **sans bots**, avec au moins 3 humains et 3 minutes de jeu (limite : 15 par jour).
  Un tricheur seul ne peut donc pas s'inventer des victoires.
- Limite connue : quelqu'un qui joue avec 2 comptes à lui peut gonfler ses stats (dans la limite
  quotidienne). L'XP reste déclarative.

---

## 🚀 Installation (développement)

Prérequis : **Node.js 20+** (22 recommandé).

```bash
git clone https://github.com/Volkodlack/Heck-Deck.git
cd Heck-Deck
npm install
cp .env.example .env
npm run dev               # site sur :5173 (+ serveur dédié local sur :3001)
```

Sans Supabase, le solo et le tutoriel fonctionnent. En mode dev, « Héberger » marche aussi entre deux
**onglets du même navigateur**, pour tester le P2P sans rien configurer.

| Commande | Rôle |
|---|---|
| `npm run dev` | Site (Vite) + serveur dédié local |
| `npm run build` | Compile le site dans `client/dist` |
| `npm start` | Serveur dédié (sert aussi le site compilé) |
| `npm run typecheck` | Vérification TypeScript |
| `npm test` | Tests : partie à 4 clients + partie contre les bots |
| `npm run assets` / `assets:cutout` | Génération des visuels via Cloudflare AI / détourage |

---

## ☁️ Mise en ligne (une seule fois)

### 1. Supabase : comptes, stats et mise en relation
1. Crée un projet gratuit sur https://supabase.com.
2. **SQL Editor** → exécute `supabase/schema.sql`. Il est ré-exécutable, donc tu peux le relancer
   après chaque mise à jour.
3. **Project Settings → API** → copie l'URL et la clé `anon` (elle est publique par nature).
4. Google OAuth (facultatif) : **Authentication → Providers → Google**, et ajoute l'URL du site dans
   **Authentication → URL Configuration**.

### 2. Cloudflare TURN : relais pour les réseaux stricts (recommandé)
1. Dashboard Cloudflare → **Realtime → TURN Server** → crée une clé (Key ID + API token).
2. Déploie l'Edge Function avec la CLI Supabase :
   ```bash
   supabase secrets set CF_TURN_KEY_ID=… CF_TURN_KEY_API_TOKEN=…
   supabase functions deploy turn-credentials
   ```
   Sans cette étape, le jeu utilise seulement le STUN gratuit de Cloudflare. Ça suffit dans la plupart
   des cas, mais pas derrière certaines 4G ou certains Wi-Fi d'entreprise.

### 3. Variables GitHub (site + APK)
**Settings → Secrets and variables → Actions → onglet Variables** :
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (et éventuellement `VITE_SERVER_URL`, un serveur dédié
proposé par défaut).

### 4. Site : GitHub Pages
**Settings → Pages → Source : GitHub Actions**. À chaque push sur `main`, le workflow
`Site (GitHub Pages)` publie le jeu sur `https://volkodlack.github.io/Heck-Deck/`.

### 5. APK Android
Le workflow `APK Android` compile l'APK à chaque push. Tu le télécharges dans
**Actions → APK Android → Artifacts → hexdeck-apk**. Pour une version officielle, pousse un tag :
```bash
git tag v0.2.0 && git push origin v0.2.0      # → Release GitHub avec l'APK attaché
```
Pour un APK **signé** (mises à jour sans désinstaller, Play Store), crée un keystore une fois :
```bash
keytool -genkey -v -keystore hexdeck.jks -alias hexdeck -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 hexdeck.jks   # → secret ANDROID_KEYSTORE_BASE64
```
Ajoute ensuite les **secrets** `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS` et `ANDROID_KEY_PASSWORD`. Garde `hexdeck.jks` en lieu sûr : sans lui, tu ne
pourras plus publier de mise à jour de l'appli.

**Ce que l'APK fait en plus du site :** orientation paysage, joystick tactile, permission micro, et
un service Android au premier plan (notification « tu héberges la partie ») qui garde la partie en vie
quand l'hôte change d'appli.
Limite actuelle : la connexion Google ne fonctionne pas encore dans l'APK (il faudra un « deep
link »). Email/mot de passe et Invité fonctionnent.

Pour compiler en local : Android Studio, puis `npm run build -w client && cd client && npx cap sync android && npx cap open android`.

### 6. Serveur dédié (optionnel, pour les communautés)
```bash
docker compose up -d        # ou : npm run build && npm start
```
Les joueurs entrent l'adresse (ex. `http://192.168.1.20:3001`) dans **En ligne → Serveur dédié**.

---

## 🤖 Bots & tutoriel
Au **premier lancement**, le tutoriel démarre automatiquement : une vraie partie hors-ligne contre 3
bots, où tu es Survivant. Les étapes se valident toutes seules (bouger, fouiller, s'asseoir, poser
des cartes, quitter la table, sonner la cloche, voter). On peut le revoir depuis l'accueil, et le
terminer rapporte +100 XP une fois.

Les bots (`shared/src/engine/bots.ts`) passent par les mêmes validations que les humains :
- ils naviguent de pièce en pièce ;
- ils jouent aux cartes, sabotent et refilent des Hex Cards ;
- ils accusent, discutent dans le chat et votent.

En solo, choisis de 1 à 7 bots. En ligne, l'hôte peut en ajouter depuis le lobby.

---

## 🗂️ Arborescence

```
Heck-Deck/
├── shared/src/
│   ├── engine/               Moteur de jeu indépendant du réseau
│   │   ├── GameRoom.ts       Phases, cartes, sabotages, votes, Fantôme IA
│   │   ├── bots.ts           Joueurs IA
│   │   └── dispatch.ts       Intentions client → moteur (assainies)
│   ├── types.ts · cards.ts · map.ts · index.ts (BALANCE)
├── client/
│   ├── src/lib/net/          proxy.ts · backends.ts (local / hôte P2P / invité / serveur)
│   │                         engine.worker.ts · signaling.ts · ice.ts
│   ├── src/lib/              play.ts (modes) · progress.ts (XP & stats) · native.ts (Android)
│   ├── src/game/             GameCanvas · draw · SoundEffects · VoiceChat · touch
│   ├── src/components/       Home · LobbyRoom · HUD · CardTableModal · VoteModal · Tutorial · TouchControls…
│   ├── android/              Projet Capacitor (HostService.java : partie en arrière-plan)
│   └── public/assets/        ASSETS_GUIDE.md
├── server/src/server.ts      Serveur dédié optionnel (Socket.io) · test/
├── supabase/                 schema.sql · functions/turn-credentials
├── scripts/                  génération des visuels (Cloudflare AI) · détourage
├── .github/workflows/        tests · APK Android · GitHub Pages
└── Dockerfile · docker-compose.yml
```

---

## 🎮 Règles

### Rôles
| Joueurs | Composition |
|---|---|
| 2–3 | **Escarmouche** : pas de traître. Le Fantôme IA patrouille et fait piocher une carte au contact. Le premier qui vide sa main gagne. |
| 4–5 | 1 Possédé, le reste Survivants |
| 6–8 | 2 Possédés (+ 1 **Médium** neutre si l'option est cochée) |

### Exploration (temps réel)
- **Déplacement** : ZQSD (AZERTY) / WASD (QWERTY) / flèches. **E** pour interagir.
- **Fouiller un meuble** : objet (Lampe UV, Sel) ou échange de ta carte la plus faible contre une carte de la pioche.
- **Lampe UV** (touche 1) : tu vois normalement pendant une coupure de courant. **Sel** (touche 2) : bloque les Hex Cards pendant 30 s.
- **Tables de Rituel** (2, 3 et 4 places) : assieds-toi pour lancer une ronde de cartes.
- **Possédés** : couper le courant, verrouiller une pièce 15 s, brouiller les voix, faire exploser une
  table (chaque joueur assis pioche 1 carte). Ils peuvent aussi refiler en douce une **Hex Card** à un
  Survivant proche (touche **R**).
- **Médium** : peut sonder le rôle d'un joueur, une seule fois.

### Ronde de Défausse (façon Puant)
- Hiérarchie : 3 < 4 < … < R < **As** < **2**, plus 2 **Poltergeists** (Jokers).
- Tu poses 1 à 4 cartes de même valeur. Le joueur suivant doit poser la même quantité, d'une valeur
  strictement supérieure, ou passer.
- Un **2** ou un **Poltergeist** brûle le pli (« BOUM! ») et tu rejoues.
- Si tout le monde passe, le pli est ramassé et le dernier joueur à avoir posé relance.
- **Cartes Maudites** (As et 2) : vider ta main sur l'une d'elles déclenche une Malédiction (+20 % de Panique).

### Réunion & vote
La Cloche du Hall (1 fois par joueur) téléporte tout le monde au centre et passe la voix en mode
global. Le vote dure 60 s et le joueur qui a la majorité stricte part au Placard à Balais : son rôle
est alors révélé. Les éliminés deviennent des fantômes spectateurs : ils entendent tout le monde, mais
personne ne les entend.

### Victoire
- **Survivants** : tous les Survivants ont vidé leur main, ou tous les Possédés sont éliminés.
- **Possédés** : la Panique atteint 100 %, ou il ne reste qu'un seul non-Possédé en vie.
- **Médium** : gagne s'il est encore en vie à la fin, quel que soit le camp vainqueur.

La Panique monte aussi toute seule (+1 % toutes les 15 s) et à chaque sabotage. Tous les réglages sont
dans `BALANCE` (`shared/src/index.ts`).

---

## 🛡️ Anti-triche
Le moteur de l'hôte fait autorité sur tout. Les autres joueurs n'envoient que des intentions :
- Les mains et les rôles restent secrets. Chaque joueur ne reçoit que son propre état, et les Possédés voient seulement leurs complices.
- Chaque coup est revalidé : tour de jeu, cartes réellement possédées, règle de valeur et de quantité.
- Les déplacements sont contrôlés (vitesse maximale, collisions avec les murs et les portes verrouillées).
- Le serveur vérifie la portée de chaque interaction (fouille, table, cloche, refilage) et applique les temps de recharge.

## 🎨 Assets
Voir [`client/public/assets/ASSETS_GUIDE.md`](client/public/assets/ASSETS_GUIDE.md) : prompts d'IA prêts
à l'emploi, banques CC0 et comment brancher un fichier à la place du rendu procédural.

## 📄 Licence
Code sous licence MIT. Les polices Bangers et Press Start 2P (Google Fonts) sont sous SIL OFL.
