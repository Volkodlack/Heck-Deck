/**
 * HEX DECK — Serveur temps réel (Express + Socket.io).
 * - Gestion des lobbies (code à 6 lettres, 2 à 8 joueurs)
 * - Relais des intentions de jeu vers la GameRoom autoritaire
 * - Signalisation WebRTC (offres / réponses / ICE) pour le chat vocal de proximité
 * - En production, sert aussi le client compilé (client/dist)
 */
import { config } from 'dotenv';
import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { GameRoom, type GameSocket, type IO } from './GameRoom';
import { verifyToken } from './db';
import type { Cosmetics, JoinPayload } from '../../shared/src/index';

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '../../.env') });

const PORT = Number(process.env.PORT ?? 3001);
const ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';

const app = express();
app.get('/health', (_req, res) => { res.json({ ok: true, rooms: rooms.size }); });

const dist = resolve(here, '../../client/dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/socket\.io).*/, (_req, res) => res.sendFile(resolve(dist, 'index.html')));
}

const http = createServer(app);
const io: IO = new Server(http, { cors: { origin: ORIGIN.split(','), credentials: true } });

const rooms = new Map<string, GameRoom>();
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sans I/O pour éviter les confusions

function newCode(): string {
  let code = '';
  do code = Array.from({ length: 6 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
  while (rooms.has(code));
  return code;
}

const HATS: Cosmetics['hat'][] = ['none', 'tophat', 'witch', 'candle', 'horns'];
function sanitize(p: JoinPayload): JoinPayload {
  const color = /^#[0-9a-f]{6}$/i.test(p?.cosmetics?.color ?? '') ? p.cosmetics.color : '#c51111';
  const hat = HATS.includes(p?.cosmetics?.hat) ? p.cosmetics.hat : 'none';
  return { name: String(p?.name ?? 'Invité').replace(/[<>]/g, '').trim().slice(0, 16) || 'Invité', cosmetics: { color, hat }, accessToken: p?.accessToken };
}

function roomOf(socket: GameSocket): GameRoom | undefined {
  return rooms.get(socket.data.room as string);
}

io.on('connection', (socket: GameSocket) => {
  const leaveCurrent = () => {
    const r = roomOf(socket);
    if (r) { r.removePlayer(socket.id); socket.leave(r.code); }
    socket.data.room = undefined;
  };

  socket.on('lobby:create', async (raw, ack) => {
    leaveCurrent();
    const p = sanitize(raw);
    const room = new GameRoom(newCode(), io);
    room.onEmpty = () => rooms.delete(room.code);
    rooms.set(room.code, room);
    socket.data.room = room.code;
    room.addPlayer(socket, p, await verifyToken(p.accessToken));
    ack?.({ ok: true, code: room.code });
  });

  socket.on('lobby:join', async (raw, ack) => {
    const code = String(raw?.code ?? '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return ack?.({ ok: false, error: 'Salle introuvable.' });
    if (!room.isOpen) return ack?.({ ok: false, error: 'Salle pleine ou partie en cours.' });
    leaveCurrent();
    socket.data.room = code;
    const p = sanitize(raw);
    room.addPlayer(socket, p, await verifyToken(p.accessToken));
    ack?.({ ok: true });
  });

  socket.on('lobby:leave', leaveCurrent);
  socket.on('lobby:settings', (s) => roomOf(socket)?.updateSettings(socket.id, s ?? {}));
  socket.on('lobby:cosmetics', (c) => roomOf(socket)?.updateCosmetics(socket.id, sanitize({ name: 'x', cosmetics: c }).cosmetics));
  socket.on('lobby:start', () => roomOf(socket)?.start(socket.id));
  socket.on('chat', (t) => roomOf(socket)?.chat(socket.id, String(t ?? '')));

  socket.on('move', (m) => roomOf(socket)?.move(socket.id, m));
  socket.on('search', (f) => roomOf(socket)?.search(socket.id, String(f)));
  socket.on('item:use', (i) => (i === 'uv' || i === 'salt') && roomOf(socket)?.useItem(socket.id, i));
  socket.on('table:sit', (t) => roomOf(socket)?.sit(socket.id, String(t)));
  socket.on('table:leave', () => roomOf(socket)?.leave(socket.id));
  socket.on('table:play', (ids) => Array.isArray(ids) && roomOf(socket)?.play(socket.id, ids.map(String)));
  socket.on('table:pass', () => roomOf(socket)?.pass(socket.id));
  socket.on('sabotage', (s) => s && roomOf(socket)?.doSabotage(socket.id, s));
  socket.on('hex:slip', (s) => s && roomOf(socket)?.slip(socket.id, String(s.targetId), String(s.cardId)));
  socket.on('medium:inspect', (t) => roomOf(socket)?.inspect(socket.id, String(t)));
  socket.on('bell', () => roomOf(socket)?.ringBell(socket.id));
  socket.on('vote', (t) => roomOf(socket)?.vote(socket.id, String(t)));

  // Signalisation WebRTC : on ne relaie qu'entre membres de la même salle.
  socket.on('rtc:signal', ({ to, data }) => {
    const target = io.sockets.sockets.get(String(to));
    if (target && target.data.room === socket.data.room) target.emit('rtc:signal', { from: socket.id, data });
  });

  socket.on('disconnect', leaveCurrent);
});

http.listen(PORT, () => console.log(`👻 HEX DECK server sur http://localhost:${PORT} (client autorisé : ${ORIGIN})`));
