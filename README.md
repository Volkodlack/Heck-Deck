# 👻 HEX DECK

Jeu web multijoueur (2 à 8 joueurs) dans un manoir hanté, qui mêle trois choses :
- **Déduction sociale** : des Possédés se cachent parmi les Survivants.
- **Chat vocal de proximité** (WebRTC) : tu entends les autres selon la distance et les murs entre vous.
- **Jeu de cartes de défausse** façon Puant / Président, avec des cartes maudites.

Tout le rendu (personnages, cartes, décors, onomatopées) est en **SVG / Canvas** et tous les sons sont
**synthétisés** avec la Web Audio API. Le jeu se lance donc sans télécharger le moindre asset.

---

## 🚀 Installation

Prérequis : **Node.js 20+**.

```bash
git clone https://github.com/Volkodlack/Heck-Deck.git
cd Heck-Deck
npm install
cp .env.example .env      # facultatif : sans Supabase, le jeu tourne en mode Invité
npm run dev               # serveur :3001 + client :5173
```

Ouvre **http://localhost:5173** dans plusieurs onglets (ou sur plusieurs machines du réseau local via
`http://<ip-du-pc>:5173`), entre en **Invité rapide**, crée une salle et partage le code à 6 lettres.

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur Socket.io (rechargement auto) + client Vite |
| `npm run build` | Compile le client dans `client/dist` |
| `npm start` | Lance le serveur, qui sert aussi `client/dist` (production, un seul port) |
| `npm run typecheck` | Vérification TypeScript (client + serveur) |
| `npm test` | Test de bout en bout : 4 clients simulés jouent une partie complète |

> 🎙️ Le micro ne fonctionne que sur `localhost` ou en **HTTPS** (règle des navigateurs). Sans micro,
> tu entends quand même les autres.

---

## 🔐 Comptes & statistiques (Supabase, facultatif)

1. Crée un projet gratuit sur https://supabase.com.
2. **SQL Editor** → colle et exécute `supabase/schema.sql` (profils, sécurité RLS, trigger d'inscription,
   fonction de statistiques, chapeaux débloqués au fil des victoires).
3. **Project Settings → API** → remplis `.env` :
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (client)
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (serveur uniquement, ne jamais l'exposer)
4. Google OAuth : **Authentication → Providers → Google** (identifiants depuis Google Cloud Console),
   puis ajoute `http://localhost:5173` dans **Authentication → URL Configuration → Redirect URLs**.

Les statistiques sont écrites **par le serveur uniquement**, après vérification du jeton du joueur. Un
client ne peut donc pas gonfler ses victoires.

---

## 🗂️ Arborescence

```
Heck-Deck/
├── shared/src/               Code commun client + serveur
│   ├── types.ts              Types d'état et événements Socket.io
│   ├── cards.ts              Paquet, hiérarchie, validation des coups
│   ├── map.ts                Plan du manoir, collisions, murs (voix), rôles
│   └── index.ts              Constantes d'équilibrage (BALANCE)
├── server/
│   ├── src/server.ts         Express + Socket.io, lobbies, signalisation WebRTC
│   ├── src/GameRoom.ts       Machine à états, cartes, sabotages, votes, Fantôme IA
│   ├── src/db.ts             Supabase côté serveur (facultatif)
│   └── test/smoke.ts         Test de bout en bout
├── client/
│   ├── public/assets/        sprites/ tiles/ audio/ cards/ + ASSETS_GUIDE.md
│   └── src/
│       ├── App.tsx           Auth → accueil → lobby → partie
│       ├── lib/              socket (store), supabase, session
│       ├── game/
│       │   ├── GameCanvas.tsx   Rendu Canvas 2D, lumière dynamique, prédiction
│       │   ├── draw.ts          Dessin procédural (persos, meubles, fantôme, BD)
│       │   ├── SoundEffects.ts  Bruitages & ambiance synthétisés
│       │   └── VoiceChat.ts     WebRTC + spatialisation (Panner/Gain/filtre)
│       └── components/
│           ├── Logo.tsx, Avatar.tsx, PlayingCard.tsx, ComicFx.tsx
│           ├── auth/Login.tsx, auth/Register.tsx
│           ├── Home.tsx, LobbyRoom.tsx, ChatBox.tsx
│           ├── HUD.tsx, CardTableModal.tsx, VoteModal.tsx, EndScreen.tsx
│           └── GameScreen.tsx
└── supabase/schema.sql
```

> Le cahier des charges parlait d'un `server.js` : ici c'est `server/src/server.ts` (TypeScript exécuté
> directement par `tsx`, sans étape de compilation).

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
Le serveur fait autorité sur tout. Les clients n'envoient que des intentions :
- Les mains et les rôles restent secrets. Chaque joueur ne reçoit que son propre état, et les Possédés voient seulement leurs complices.
- Chaque coup est revalidé : tour de jeu, cartes réellement possédées, règle de valeur et de quantité.
- Les déplacements sont contrôlés (vitesse maximale, collisions avec les murs et les portes verrouillées).
- Le serveur vérifie la portée de chaque interaction (fouille, table, cloche, refilage) et applique les temps de recharge.

## 🌐 Déploiement
`npm run build && npm start` sert le client et le serveur sur un seul port. Ça fonctionne sur
n'importe quel hébergeur Node qui gère les WebSockets (Render, Railway, Fly.io, ou un VPS). Mets le
jeu derrière HTTPS pour que le micro fonctionne. Pour les réseaux très restrictifs, ajoute un serveur
TURN (par exemple coturn, open source) dans `ICE` de `VoiceChat.ts`.

## 🎨 Assets
Voir [`client/public/assets/ASSETS_GUIDE.md`](client/public/assets/ASSETS_GUIDE.md) : prompts d'IA prêts
à l'emploi, banques CC0 et comment brancher un fichier à la place du rendu procédural.

## 📄 Licence
Code sous licence MIT. Les polices Bangers et Press Start 2P (Google Fonts) sont sous SIL OFL.
