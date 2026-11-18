/**
 * HEX DECK — Bruitages arcade 100 % synthétisés (Web Audio API, aucun fichier audio).
 * Les sons sont générés à la volée avec oscillateurs + bruit blanc filtré.
 * Pour remplacer un son par un fichier CC0, voir public/assets/ASSETS_GUIDE.md.
 */
type Wave = OscillatorType;

class SoundEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private noiseBuf: AudioBuffer | null = null;
  private ambience: { stop: () => void } | null = null;
  muted = false;

  /** À appeler sur un geste utilisateur (politique autoplay des navigateurs). */
  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.6;
      this.sfxBus.connect(this.master);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  private tone(freq: number, dur: number, type: Wave = 'square', vol = 0.3, slideTo?: number, delay = 0) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol = 0.4, freq = 1000, type: BiquadFilterType = 'lowpass', delay = 0, sweepTo?: number) {
    const ctx = this.ctx; if (!ctx || !this.noiseBuf) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t); src.stop(t + dur + 0.05);
  }

  /* ------------------------------ Bruitages ------------------------------ */
  step() { this.noise(0.06, 0.15, 400 + Math.random() * 200, 'bandpass'); }
  card() { this.noise(0.08, 0.35, 3000, 'highpass'); this.tone(900, 0.05, 'triangle', 0.08); }
  pass() { this.tone(330, 0.12, 'square', 0.12, 220); }
  search() { this.noise(0.25, 0.25, 800, 'bandpass', 0, 2500); this.tone(660, 0.1, 'triangle', 0.15, 990, 0.2); }
  error() { this.tone(160, 0.18, 'sawtooth', 0.15, 110); }
  vote() { this.tone(523, 0.08, 'square', 0.15); this.tone(784, 0.12, 'square', 0.15, undefined, 0.08); }

  /** Cloche d'urgence : partiels inharmoniques + longue décroissance. */
  bell() {
    [1, 2.76, 5.4, 8.93].forEach((m, i) => this.tone(440 * m, 2.2 - i * 0.4, 'sine', 0.25 / (i + 1)));
    this.tone(440, 2.2, 'sine', 0.2, undefined, 0.7);
  }

  /** Explosion de pli "BOUM!" : grave + bruit qui se ferme. */
  boom() {
    this.tone(120, 0.6, 'sine', 0.7, 30);
    this.noise(0.8, 0.8, 4000, 'lowpass', 0, 100);
  }

  sabotage() {
    this.tone(880, 0.5, 'sawtooth', 0.15, 110);
    this.noise(0.4, 0.3, 200, 'highpass', 0.05, 6000);
  }

  /** Carte maudite reçue / malédiction : accord diminué descendant. */
  curse() {
    [311, 370, 440].forEach((f, i) => this.tone(f, 1.2, 'sawtooth', 0.12, f / 2, i * 0.07));
    this.noise(1, 0.2, 300, 'lowpass');
  }
  hexed() { this.tone(1200, 0.3, 'triangle', 0.15, 300); this.tone(600, 0.3, 'square', 0.06, 150, 0.05); }

  ghost() {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    const g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 500;
    lfo.frequency.value = 6; lg.gain.value = 40;
    lfo.connect(lg).connect(o.frequency);
    o.frequency.setValueAtTime(700, t);
    o.frequency.exponentialRampToValueAtTime(250, t + 1.2);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    o.connect(g).connect(this.sfxBus);
    o.start(t); lfo.start(t); o.stop(t + 1.4); lfo.stop(t + 1.4);
  }

  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'square', 0.15, undefined, i * 0.12)); }
  eliminated() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.2, undefined, i * 0.18)); this.noise(0.3, 0.4, 600, 'lowpass', 0.8); }

  /* ------------------------------ Ambiance ------------------------------ */
  /** Nappe inquiétante : drones désaccordés + LFO de filtre + grincements aléatoires. */
  startAmbience() {
    const ctx = this.unlock();
    if (this.ambience) return;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(0.12, ctx.currentTime, 2);
    out.connect(this.master);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 400; filter.Q.value = 6;
    filter.connect(out);
    const lfo = ctx.createOscillator(); const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07; lfoGain.gain.value = 250;
    lfo.connect(lfoGain).connect(filter.frequency); lfo.start();
    const oscs = [55, 55.4, 82.4, 110.7].map((f) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(filter); o.start(); return o;
    });
    const creak = setInterval(() => {
      if (Math.random() < 0.35) this.tone(80 + Math.random() * 60, 0.6, 'sawtooth', 0.04, 60 + Math.random() * 40);
    }, 4000);
    this.ambience = {
      stop: () => {
        clearInterval(creak);
        out.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
        setTimeout(() => { oscs.forEach((o) => o.stop()); lfo.stop(); out.disconnect(); }, 2000);
      },
    };
  }
  stopAmbience() { this.ambience?.stop(); this.ambience = null; }

  /** Bruit de brouillage (sabotage vocal) envoyé dans un nœud donné. */
  createStatic(target: AudioNode, vol = 0.05) {
    const ctx = this.ctx; if (!ctx || !this.noiseBuf) return () => {};
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2000;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f).connect(g).connect(target); src.start();
    return () => { src.stop(); g.disconnect(); };
  }
}

export const SFX = new SoundEngine();
