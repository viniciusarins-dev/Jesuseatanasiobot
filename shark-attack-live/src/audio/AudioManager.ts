import { AUDIO_CONFIG, type SoundName } from "../config/audioConfig";

/** O jogo só depende disto — facilita testes e troca de implementação. */
export interface SoundPlayer {
  play(name: SoundName): void;
}

type AudioConfig = typeof AUDIO_CONFIG;

/**
 * Áudio do jogo.
 * - Sem arquivos configurados, todos os sons (e a música) são sintetizados
 *   com WebAudio — o jogo funciona "do zero".
 * - Com `file` no audioConfig, o arquivo substitui o som sintetizado.
 * - Qualquer falha de áudio é engolida: som nunca derruba o jogo.
 * - Navegadores só liberam áudio após um clique/tecla (`unlock`). No OBS
 *   (Browser Source) o áudio normalmente já é liberado automaticamente.
 */
export class AudioManager implements SoundPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly buffers = new Map<SoundName, AudioBuffer>();
  private readonly lastPlayed = new Map<SoundName, number>();
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private musicElement: HTMLAudioElement | null = null;
  private nextBeatTime = 0;
  private beat = 0;
  private muted = false;

  constructor(
    private readonly cfg: AudioConfig = AUDIO_CONFIG,
    private readonly baseUrl = "./",
  ) {}

  get isMuted(): boolean {
    return this.muted;
  }

  get isUnlocked(): boolean {
    return this.ctx?.state === "running";
  }

  /** Cria/retoma o contexto de áudio e inicia a música. Seguro chamar várias vezes. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : this.cfg.masterVolume;
        this.master.connect(this.ctx.destination);
        this.noise = this.createNoise(this.ctx);
        void this.loadFiles();
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
      this.startMusic();
    } catch (err) {
      console.warn("[Audio] indisponível", err);
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : this.cfg.masterVolume, this.ctx.currentTime, 0.05);
    if (this.musicElement) this.musicElement.muted = muted;
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  play(name: SoundName): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== "running" || this.muted) return;
    const def = this.cfg.sounds[name];
    const nowMs = performance.now();
    const last = this.lastPlayed.get(name) ?? -Infinity;
    if (nowMs - last < def.minIntervalMs) return;
    this.lastPlayed.set(name, nowMs);
    try {
      const out = ctx.createGain();
      out.gain.value = def.volume;
      out.connect(this.master);
      const buffer = this.buffers.get(name);
      if (buffer) {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(out);
        src.start();
      } else {
        this.synth(name, ctx, out, ctx.currentTime);
      }
    } catch (err) {
      console.warn("[Audio] falha ao tocar", name, err);
    }
  }

  // ---------------------------------------------------------------- arquivos

  private async loadFiles(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    const entries = Object.entries(this.cfg.sounds) as [SoundName, { file?: string }][];
    await Promise.all(
      entries
        .filter(([, def]) => def.file)
        .map(async ([name, def]) => {
          try {
            const res = await fetch(this.baseUrl + def.file);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            this.buffers.set(name, await ctx.decodeAudioData(await res.arrayBuffer()));
          } catch (err) {
            console.warn(`[Audio] não foi possível carregar ${def.file}; usando som sintetizado`, err);
          }
        }),
    );
  }

  // ---------------------------------------------------------------- música

  private startMusic(): void {
    if (this.musicTimer || this.musicElement || !this.ctx) return;
    const file = this.cfg.music.file;
    if (file) {
      const el = new Audio(this.baseUrl + file);
      el.loop = true;
      el.volume = this.cfg.music.volume * this.cfg.masterVolume;
      el.muted = this.muted;
      this.musicElement = el;
      el.play().catch((err) => console.warn("[Audio] música bloqueada até interação", err));
      return;
    }
    // Música sintetizada: linha de baixo + chimbal, agendada com antecedência.
    this.nextBeatTime = this.ctx.currentTime + 0.1;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 100);
  }

  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || ctx.state !== "running") return;
    const bpm = 112;
    const beatLen = 60 / bpm / 2; // colcheias
    const bass = [55, 0, 55, 65.41, 0, 55, 73.42, 65.41, 49, 0, 49, 58.27, 0, 49, 65.41, 58.27];
    while (this.nextBeatTime < ctx.currentTime + 0.3) {
      const t = this.nextBeatTime;
      const step = this.beat % bass.length;
      const freq = bass[step];
      if (freq > 0) this.tone(ctx, "triangle", freq, freq, t, beatLen * 0.9, this.cfg.music.volume * 0.9);
      this.noiseHit(ctx, t, 0.03, this.cfg.music.volume * (step % 2 === 0 ? 0.25 : 0.12), 8000);
      if (step % 4 === 0) this.tone(ctx, "sine", 110, 40, t, 0.15, this.cfg.music.volume * 0.8);
      this.nextBeatTime += beatLen;
      this.beat++;
    }
  }

  // ---------------------------------------------------------------- síntese

  private createNoise(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private tone(
    ctx: AudioContext,
    type: OscillatorType,
    from: number,
    to: number,
    start: number,
    duration: number,
    volume: number,
    destination: AudioNode | null = this.master,
  ): void {
    if (!destination) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(destination);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  private noiseHit(
    ctx: AudioContext,
    start: number,
    duration: number,
    volume: number,
    cutoff: number,
    destination: AudioNode | null = this.master,
  ): void {
    if (!this.noise || !destination) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.0002, volume), start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    src.connect(filter).connect(gain).connect(destination);
    src.start(start);
    src.stop(start + duration + 0.05);
  }

  private synth(name: SoundName, ctx: AudioContext, out: AudioNode, t: number): void {
    switch (name) {
      case "hit":
        this.tone(ctx, "sine", 140, 45, t, 0.3, 1, out);
        this.noiseHit(ctx, t, 0.18, 0.8, 1200, out);
        break;
      case "spawn":
        this.tone(ctx, "sine", 260, 520, t, 0.14, 0.6, out);
        break;
      case "death":
        this.tone(ctx, "square", 420, 70, t, 0.28, 0.35, out);
        this.noiseHit(ctx, t, 0.2, 0.5, 2500, out);
        break;
      case "gift":
        [660, 880, 1320].forEach((f, i) => this.tone(ctx, "triangle", f, f, t + i * 0.08, 0.18, 0.6, out));
        break;
      case "special":
        this.tone(ctx, "sawtooth", 220, 880, t, 0.5, 0.5, out);
        this.tone(ctx, "sawtooth", 880, 220, t + 0.5, 0.5, 0.5, out);
        this.tone(ctx, "sine", 90, 30, t, 1.0, 1, out);
        break;
      case "heal":
        this.tone(ctx, "sine", 520, 1040, t, 0.3, 0.7, out);
        break;
      case "burst":
        this.tone(ctx, "sine", 180, 1100, t, 0.25, 0.7, out);
        this.noiseHit(ctx, t, 0.3, 0.6, 6000, out);
        break;
      case "gameover":
        [440, 330, 220, 110].forEach((f, i) => this.tone(ctx, "triangle", f, f * 0.97, t + i * 0.22, 0.3, 0.8, out));
        break;
    }
  }
}
