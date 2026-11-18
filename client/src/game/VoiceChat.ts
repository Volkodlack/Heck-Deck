/**
 * HEX DECK — Chat vocal de proximité.
 * - WebRTC natif (RTCPeerConnection en maillage complet, idéal jusqu'à 8 joueurs).
 * - Signalisation via Socket.io ('rtc:signal').
 * - Spatialisation Web Audio : GainNode (distance + murs) → BiquadFilter (étouffement) → PannerNode (HRTF).
 * - Mode Global pendant les réunions, brouillage lors d'un sabotage "jam".
 */
import { BALANCE, dist, wallsBetween, type RoomId } from '@shared';
import { socket } from '../lib/socket';
import { SFX } from './SoundEffects';

const ICE: RTCConfiguration = {
  // Serveurs STUN publics gratuits. Pour les réseaux stricts, ajoute un TURN (ex : coturn auto-hébergé).
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};

interface Peer {
  pc: RTCPeerConnection;
  gain: GainNode;
  filter: BiquadFilterNode;
  panner: PannerNode;
  el: HTMLAudioElement | null;
  pendingIce: RTCIceCandidateInit[];
  level: number;
}

export interface VoicePositions {
  me: { id: string; x: number; y: number; alive: boolean };
  others: { id: string; x: number; y: number; alive: boolean }[];
  global: boolean;
  jammed: boolean;
  lockedRoom: RoomId | null;
}

export class VoiceChat {
  private peers = new Map<string, Peer>();
  private local: MediaStream | null = null;
  private stopStatic: (() => void) | null = null;
  private offs: (() => void)[] = [];
  micAvailable = false;
  micMuted = false;
  /** Niveau d'écoute (0..1) de chaque pair, pour l'indicateur visuel dans le HUD. */
  levels: Record<string, number> = {};

  async start() {
    SFX.unlock();
    try {
      this.local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      this.micAvailable = true;
    } catch {
      this.local = null; // pas de micro : écoute seule
    }
    const onPeers = (ids: string[]) => this.syncPeers(ids);
    const onSignal = (p: { from: string; data: unknown }) => void this.handleSignal(p.from, p.data as Signal);
    socket.on('rtc:peers', onPeers);
    socket.on('rtc:signal', onSignal);
    this.offs.push(() => socket.off('rtc:peers', onPeers), () => socket.off('rtc:signal', onSignal));
  }

  setMicMuted(m: boolean) {
    this.micMuted = m;
    this.local?.getAudioTracks().forEach((t) => (t.enabled = !m));
  }

  syncPeers(ids: string[]) {
    const me = socket.id;
    if (!me) return;
    for (const id of ids) {
      if (id === me || this.peers.has(id)) continue;
      const peer = this.createPeer(id);
      // Règle anti-collision : seul l'id le plus petit initie l'offre.
      if (me < id) void this.makeOffer(id, peer);
    }
    for (const id of [...this.peers.keys()]) if (!ids.includes(id)) this.closePeer(id);
  }

  private createPeer(id: string): Peer {
    const ctx = SFX.unlock();
    const pc = new RTCPeerConnection(ICE);
    const gain = ctx.createGain(); gain.gain.value = 0;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 18000;
    const panner = ctx.createPanner();
    Object.assign(panner, { panningModel: 'HRTF', distanceModel: 'linear', refDistance: 1, maxDistance: 10000, rolloffFactor: 0 });
    gain.connect(filter).connect(panner).connect(ctx.destination);
    const peer: Peer = { pc, gain, filter, panner, el: null, pendingIce: [], level: 0 };
    this.peers.set(id, peer);

    if (this.local) this.local.getTracks().forEach((t) => pc.addTrack(t, this.local!));
    else pc.addTransceiver('audio', { direction: 'recvonly' });

    pc.onicecandidate = (e) => e.candidate && socket.emit('rtc:signal', { to: id, data: { type: 'candidate', candidate: e.candidate.toJSON() } });
    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      // Astuce Chrome : un flux WebRTC distant doit être attaché à un <audio> pour alimenter Web Audio.
      const el = new Audio();
      el.srcObject = stream; el.muted = true; void el.play().catch(() => {});
      peer.el = el;
      ctx.createMediaStreamSource(stream).connect(gain);
    };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') pc.restartIce(); };
    return peer;
  }

  private async makeOffer(id: string, peer: Peer) {
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    socket.emit('rtc:signal', { to: id, data: { type: 'offer', sdp: offer.sdp } });
  }

  private async handleSignal(from: string, data: Signal) {
    let peer = this.peers.get(from);
    if (!peer) peer = this.createPeer(from);
    const { pc } = peer;
    try {
      if (data.type === 'offer') {
        await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('rtc:signal', { to: from, data: { type: 'answer', sdp: answer.sdp } });
        this.flushIce(peer);
      } else if (data.type === 'answer') {
        await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
        this.flushIce(peer);
      } else if (data.type === 'candidate') {
        if (pc.remoteDescription) await pc.addIceCandidate(data.candidate);
        else peer.pendingIce.push(data.candidate);
      }
    } catch (err) {
      console.warn('[voice] signal error', err);
    }
  }

  private flushIce(peer: Peer) {
    peer.pendingIce.splice(0).forEach((c) => void peer.pc.addIceCandidate(c).catch(() => {}));
  }

  /** À appeler à chaque frame (ou ~10 fois/s) avec les positions des joueurs. */
  update(pos: VoicePositions) {
    const ctx = SFX.ctx;
    if (!ctx) return;
    const L = ctx.listener;
    const scale = 1 / 100; // 100 px = 1 m
    if (L.positionX) { L.positionX.value = pos.me.x * scale; L.positionY.value = 0; L.positionZ.value = pos.me.y * scale; }
    else (L as unknown as { setPosition: (x: number, y: number, z: number) => void }).setPosition(pos.me.x * scale, 0, pos.me.y * scale);

    for (const o of pos.others) {
      const peer = this.peers.get(o.id);
      if (!peer) continue;
      let vol = 0;
      let cutoff = 18000;
      // Les vivants n'entendent pas les morts ; les morts entendent tout le monde.
      const audible = pos.me.alive ? o.alive : true;
      if (audible) {
        if (pos.global) vol = 1;
        else {
          const d = dist(pos.me, o);
          vol = Math.max(0, 1 - d / BALANCE.voiceMaxDistance) ** 1.4;
          const walls = wallsBetween(pos.me, o, pos.lockedRoom);
          vol *= BALANCE.voiceWallDamping ** walls;
          cutoff = walls > 0 ? Math.max(600, 3000 / walls) : 18000;
        }
        if (pos.jammed && !pos.global) { vol *= 0.35; cutoff = Math.min(cutoff, 1200); }
      }
      peer.gain.gain.setTargetAtTime(vol, ctx.currentTime, 0.08);
      peer.filter.frequency.setTargetAtTime(cutoff, ctx.currentTime, 0.1);
      // En mode global, on centre les voix ; sinon spatialisation réelle.
      const px = pos.global ? pos.me.x : o.x;
      const pz = pos.global ? pos.me.y - 1 : o.y;
      if (peer.panner.positionX) { peer.panner.positionX.value = px * scale; peer.panner.positionZ.value = pz * scale; }
      this.levels[o.id] = vol;
    }

    // Grésillement d'ambiance pendant le brouillage.
    if (pos.jammed && !pos.global && !this.stopStatic) this.stopStatic = SFX.createStatic(ctx.destination, 0.03);
    if ((!pos.jammed || pos.global) && this.stopStatic) { this.stopStatic(); this.stopStatic = null; }
  }

  private closePeer(id: string) {
    const p = this.peers.get(id);
    if (!p) return;
    p.pc.close();
    p.gain.disconnect();
    p.panner.disconnect();
    if (p.el) p.el.srcObject = null;
    this.peers.delete(id);
    delete this.levels[id];
  }

  stop() {
    [...this.peers.keys()].forEach((id) => this.closePeer(id));
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = null;
    this.stopStatic?.();
    this.stopStatic = null;
    this.offs.forEach((f) => f());
    this.offs = [];
  }
}

type Signal =
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'candidate'; candidate: RTCIceCandidateInit };

export const voice = new VoiceChat();
