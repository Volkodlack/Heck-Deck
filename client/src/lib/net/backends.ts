/**
 * Les trois façons de jouer :
 * - LocalHost  : le moteur tourne chez moi (Web Worker). Solo/tuto hors-ligne, ou hôte P2P
 *                si `p2p` est activé (les invités se connectent en WebRTC DataChannel).
 * - P2PGuest   : je rejoins l'appli d'un hôte via son code de salle.
 * - ServerLink : je me connecte à un serveur dédié auto-hébergé (Socket.io).
 */
import { io, type Socket } from 'socket.io-client';
import { newRoomCode } from '@shared/engine';
import type { JoinPayload, Role } from '@shared';
import type { GameEndInfo } from '@shared/engine';
import { net, type Backend } from './proxy';
import { RoomChannel, type SignalMsg } from './signaling';
import { getIceServers } from './ice';
import type { FromWorker, ToWorker } from './engine.worker';

const rid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 10)}`;
const encode = (ev: string, args: unknown[]) => JSON.stringify({ ev, args });

/* ============================== Hôte local ============================== */

interface GuestLink { pc: RTCPeerConnection; dc: RTCDataChannel | null; payload: JoinPayload; joined: boolean; pendingIce: RTCIceCandidateInit[] }

export interface HostOptions {
  p2p?: boolean;
  bots?: number;
  forcedRole?: Role;
  autoStart?: boolean;
  maxPlayers?: number;
  onGameEnd?: (info: GameEndInfo) => void;
}

export class LocalHost implements Backend {
  readonly id = rid('h');
  readonly kind: 'local' | 'host';
  readonly code = newRoomCode();
  private worker: Worker;
  private channel: RoomChannel | null = null;
  private guests = new Map<string, GuestLink>();
  private offSignal: (() => void) | null = null;

  constructor(private payload: JoinPayload, private opts: HostOptions = {}) {
    this.kind = opts.p2p ? 'host' : 'local';
    this.worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.fromWorker(e.data);
  }

  /** Démarre le moteur (et la mise en relation P2P si demandée). */
  async start() {
    if (this.opts.p2p) {
      // Canal de mise en relation pour ce code (1 chance sur 190 millions de collision).
      this.channel = new RoomChannel(this.code);
      await this.channel.subscribe();
      this.offSignal = this.channel.onMessage((m) => void this.onSignal(m));
    }
    this.toWorker({
      t: 'init', code: this.code, hostId: this.id, payload: this.payload, bots: this.opts.bots,
      forcedRoles: this.opts.forcedRole ? { [this.id]: this.opts.forcedRole } : undefined,
      autoStart: this.opts.autoStart, maxPlayers: this.opts.maxPlayers,
    });
  }

  send(ev: string, args: unknown[]) { this.handleFrom(this.id, ev, args); }

  private handleFrom(pid: string, ev: string, args: unknown[]) {
    if (ev === 'rtc:signal') {
      const { to, data } = (args[0] ?? {}) as { to?: string; data?: unknown };
      if (to === this.id) net.deliver('rtc:signal', { from: pid, data });
      else if (to && this.guests.has(to)) this.sendTo(to, 'rtc:signal', [{ from: pid, data }]);
      return;
    }
    if (ev === 'lobby:leave') {
      if (pid === this.id) net.detach('leave');
      else this.dropGuest(pid);
      return;
    }
    if (ev === 'lobby:create' || ev === 'lobby:join') return;
    this.toWorker({ t: 'intent', pid, ev, args });
  }

  private toWorker(m: ToWorker) { this.worker.postMessage(m); }

  private fromWorker(m: FromWorker) {
    if (m.t === 'out') {
      if (m.to === null) {
        net.deliver(m.ev, ...m.args);
        const msg = encode(m.ev, m.args);
        this.guests.forEach((g) => g.joined && g.dc?.readyState === 'open' && g.dc.send(msg));
      } else if (m.to === this.id) net.deliver(m.ev, ...m.args);
      else this.sendTo(m.to, m.ev, m.args);
    } else if (m.t === 'joinResult') {
      const g = this.guests.get(m.pid);
      if (!g) return;
      if (m.ok) { g.joined = true; this.sendTo(m.pid, '_joined', [{ id: m.pid }]); }
      else { this.sendTo(m.pid, '_reject', [m.error]); setTimeout(() => this.dropGuest(m.pid, false), 500); }
    } else if (m.t === 'gameEnd') {
      this.opts.onGameEnd?.(m.info);
    }
  }

  private sendTo(pid: string, ev: string, args: unknown[]) {
    const g = this.guests.get(pid);
    if (g?.dc?.readyState === 'open') g.dc.send(encode(ev, args));
  }

  /* ---------- P2P : accueil des invités ---------- */

  private async onSignal(m: SignalMsg) {
    const ch = this.channel!;
    if (m.t === 'ping') return ch.send({ t: 'pong', from: this.id });
    if (m.t === 'hello') {
      if (this.guests.has(m.from)) return; // hello répété
      const pc = new RTCPeerConnection({ iceServers: await getIceServers() });
      const link: GuestLink = { pc, dc: null, payload: m.payload as JoinPayload, joined: false, pendingIce: [] };
      this.guests.set(m.from, link);
      const dc = pc.createDataChannel('game', { ordered: true });
      link.dc = dc;
      dc.onopen = () => this.toWorker({ t: 'join', pid: m.from, payload: link.payload });
      dc.onmessage = (e) => {
        try {
          const { ev, args } = JSON.parse(String(e.data));
          if (link.joined && typeof ev === 'string' && Array.isArray(args)) this.handleFrom(m.from, ev, args);
        } catch { /* message invalide ignoré */ }
      };
      dc.onclose = () => this.dropGuest(m.from);
      pc.onicecandidate = (e) => e.candidate && ch.send({ t: 'ice', from: this.id, to: m.from, c: e.candidate.toJSON() });
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.dropGuest(m.from); };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      ch.send({ t: 'offer', from: this.id, to: m.from, sdp: offer.sdp! });
      return;
    }
    if (m.t === 'answer' && m.to === this.id) {
      const g = this.guests.get(m.from);
      if (!g) return;
      await g.pc.setRemoteDescription({ type: 'answer', sdp: m.sdp });
      g.pendingIce.splice(0).forEach((c) => void g.pc.addIceCandidate(c).catch(() => {}));
      return;
    }
    if (m.t === 'ice' && m.to === this.id) {
      const g = this.guests.get(m.from);
      if (!g) return;
      if (g.pc.remoteDescription) await g.pc.addIceCandidate(m.c).catch(() => {});
      else g.pendingIce.push(m.c);
    }
  }

  private dropGuest(pid: string, notifyEngine = true) {
    const g = this.guests.get(pid);
    if (!g) return;
    this.guests.delete(pid);
    try { g.dc?.close(); g.pc.close(); } catch { /* ignore */ }
    if (notifyEngine && g.joined) this.toWorker({ t: 'remove', pid });
  }

  close() {
    this.guests.forEach((g) => { try { g.dc?.send(encode('_hostLeft', [])); } catch { /* ignore */ } });
    [...this.guests.keys()].forEach((pid) => this.dropGuest(pid, false));
    this.offSignal?.();
    this.channel?.close();
    this.worker.terminate();
  }
}

/* ============================== Invité P2P ============================== */

export class P2PGuest implements Backend {
  readonly id = rid('g');
  readonly kind = 'guest' as const;
  private channel: RoomChannel;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];
  private hostId: string | null = null;
  private closed = false;

  constructor(private code: string, private payload: JoinPayload) {
    this.channel = new RoomChannel(code);
  }

  /** Se connecte à l'hôte. Résout quand l'hôte a accepté le joueur. */
  async connect(): Promise<void> {
    await this.channel.subscribe();
    const ice = await getIceServers();
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (msg: string) => { if (!settled) { settled = true; reject(new Error(msg)); } };
      const timeout = setTimeout(() => fail('Salle introuvable (l’hôte est-il en ligne ?).'), 15000);

      // On répète le "hello" tant que l'hôte n'a pas répondu (il peut s'abonner après nous).
      const hello = () => !this.hostId && this.channel.send({ t: 'hello', from: this.id, payload: this.payload });
      hello();
      const helloTimer = setInterval(hello, 2000);

      this.channel.onMessage(async (m) => {
        if (!('to' in m) || m.to !== this.id) return;
        if (m.t === 'reject') { clearTimeout(timeout); clearInterval(helloTimer); fail(m.reason); return; }
        if (m.t === 'offer' && !this.pc) {
          this.hostId = m.from;
          clearInterval(helloTimer);
          const pc = new RTCPeerConnection({ iceServers: ice });
          this.pc = pc;
          pc.onicecandidate = (e) => e.candidate && this.channel.send({ t: 'ice', from: this.id, to: m.from, c: e.candidate.toJSON() });
          pc.ondatachannel = (e) => {
            const dc = e.channel;
            this.dc = dc;
            dc.onmessage = (ev) => {
              let msg: { ev: string; args: unknown[] };
              try { msg = JSON.parse(String(ev.data)); } catch { return; }
              if (msg.ev === '_joined') { clearTimeout(timeout); settled = true; resolve(); return; }
              if (msg.ev === '_reject') { clearTimeout(timeout); fail(String(msg.args[0] ?? 'Refusé.')); return; }
              if (msg.ev === '_hostLeft') { net.deliver('toast', 'L’hôte a quitté la partie.'); net.detach('host-left'); return; }
              net.deliver(msg.ev, ...msg.args);
            };
            dc.onclose = () => {
              if (this.closed) return;
              if (!settled) fail('Connexion à l’hôte perdue.');
              else { net.deliver('toast', 'Connexion à l’hôte perdue.'); net.detach('host-lost'); }
            };
          };
          pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') fail('Impossible de joindre l’hôte (réseau trop restrictif ?).'); };
          await pc.setRemoteDescription({ type: 'offer', sdp: m.sdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          this.channel.send({ t: 'answer', from: this.id, to: m.from, sdp: answer.sdp! });
          this.pendingIce.splice(0).forEach((c) => void pc.addIceCandidate(c).catch(() => {}));
        }
        if (m.t === 'ice') {
          if (this.pc?.remoteDescription) await this.pc.addIceCandidate(m.c).catch(() => {});
          else this.pendingIce.push(m.c);
        }
      });
    });
  }

  send(ev: string, args: unknown[]) {
    if (this.dc?.readyState === 'open') this.dc.send(encode(ev, args));
  }

  close() {
    this.closed = true;
    try { this.dc?.close(); this.pc?.close(); } catch { /* ignore */ }
    this.channel.close();
  }
}

/* ============================== Serveur dédié ============================== */

export class ServerLink implements Backend {
  readonly kind = 'server' as const;
  private socket: Socket;
  constructor(url: string) {
    this.socket = io(url, { transports: ['websocket', 'polling'], reconnection: false, timeout: 6000 });
    this.socket.onAny((ev: string, ...args: unknown[]) => net.deliver(ev, ...args));
    this.socket.on('disconnect', () => { if (net.kind === 'server') net.detach('server-lost'); });
  }
  get id() { return this.socket.id ?? ''; }
  waitConnected(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket.connected) return resolve();
      this.socket.once('connect', () => resolve());
      this.socket.once('connect_error', (e) => reject(new Error(`Serveur injoignable : ${e.message}`)));
    });
  }
  send(ev: string, args: unknown[]) { this.socket.emit(ev, ...args); }
  close() { this.socket.disconnect(); }
}
