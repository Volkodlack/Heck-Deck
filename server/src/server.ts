/**
 * HEX DECK — Serveur dédié auto-hébergeable (Express + Socket.io).
 *
 * Optionnel : par défaut les joueurs hébergent leur partie directement dans l'appli (P2P).
 * Ce serveur sert aux communautés qui veulent une salle permanente (LAN, association, Discord…).
 * Il utilise exactement le même moteur (`shared/src/engine`) que l'hôte P2P.
 * Il ne stocke rien : les statistiques passent par les rapports croisés Supabase des joueurs.
 */
import { config } from 'dotenv';
import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';
import { GameRoom, dispatchIntent, newRoomCode, sanitizeJoin } from '../../shared/src/engine';
import type { ClientToServer, ServerToClient } from '../../shared/src/index';

type IO = Server<ClientToServer, ServerToClient>;
type GameSocket = Socket<ClientToServer, ServerToClient>;

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '../../.env') });

const PORT = Number(process.env.PORT ?? 3001);
const ORIGIN = process.env.CLIENT_ORIGIN ?? '*';

const app = express();
app.use((_req, res, next) => { res.setHeader('Access-Control-Allow-Origin', '*'); next(); });
app.get('/health', (_req, res) => { res.json({ ok: true, game: 'hexdeck', rooms: rooms.size }); });

const dist = resolve(here, '../../client/dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/socket\.io).*/, (_req, res) => res.sendFile(resolve(dist, 'index.html')));
}

const http = createServer(app);
const io: IO = new Server(http, { cors: { origin: ORIGIN === '*' ? true : ORIGIN.split(','), credentials: true } });
const rooms = new Map<string, GameRoom>();

function createRoom(): GameRoom {
  let code = newRoomCode();
  while (rooms.has(code)) code = newRoomCode();
  const room = new GameRoom(code, {
    all: (ev, ...args) => { io.to(code).emit(ev, ...args); },
    to: (id, ev, ...args) => { io.to(id).emit(ev, ...args); },
  });
  room.onEmpty = () => rooms.delete(code);
  rooms.set(code, room);
  return room;
}

io.on('connection', (socket: GameSocket) => {
  const roomOf = () => rooms.get(socket.data.room as string);
  const leaveCurrent = () => {
    const r = roomOf();
    if (r) { r.removePlayer(socket.id); socket.leave(r.code); }
    socket.data.room = undefined;
  };

  socket.on('lobby:create', (raw, ack) => {
    leaveCurrent();
    const room = createRoom();
    socket.data.room = room.code;
    socket.join(room.code);
    const p = sanitizeJoin(raw);
    room.addPlayer(socket.id, p, p.accountId ?? null);
    ack?.({ ok: true, code: room.code });
  });

  socket.on('lobby:join', (raw, ack) => {
    const code = String(raw?.code ?? '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return ack?.({ ok: false, error: 'Salle introuvable.' });
    if (!room.isOpen) return ack?.({ ok: false, error: 'Salle pleine ou partie en cours.' });
    leaveCurrent();
    socket.data.room = code;
    socket.join(code);
    const p = sanitizeJoin(raw);
    room.addPlayer(socket.id, p, p.accountId ?? null);
    ack?.({ ok: true });
  });

  socket.on('lobby:leave', leaveCurrent);
  socket.on('disconnect', leaveCurrent);

  // Signalisation WebRTC (voix) : relais entre membres de la même salle uniquement.
  socket.on('rtc:signal', (p) => {
    const target = io.sockets.sockets.get(String(p?.to));
    if (target && target.data.room === socket.data.room) target.emit('rtc:signal', { from: socket.id, data: p.data });
  });

  // Toutes les autres intentions → moteur (validation côté moteur)
  const transportEvents = new Set(['lobby:create', 'lobby:join', 'lobby:leave', 'rtc:signal']);
  socket.onAny((ev: string, ...args: unknown[]) => {
    if (transportEvents.has(ev)) return;
    const r = roomOf();
    if (r) dispatchIntent(r, socket.id, ev, args);
  });
});

http.listen(PORT, () => console.log(`👻 HEX DECK server sur http://localhost:${PORT}`));
