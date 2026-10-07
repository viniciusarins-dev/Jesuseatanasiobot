import type { GameConfig } from "../config/gameConfig";
import { randRange } from "../utils/math";
import { font } from "../ui/render";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  drag: number;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  life: number;
  maxLife: number;
}

interface Ring {
  x: number;
  y: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
}

/** Efeitos puramente visuais. Têm limites para não pesar em picos de eventos. */
export class EffectsSystem {
  private particles: Particle[] = [];
  private texts: FloatingText[] = [];
  private rings: Ring[] = [];
  private shakeTime = 0;
  private shakeIntensity = 0;
  private flashTime = 0;
  private flashMax = 0;
  private flashColor = "#ffffff";

  constructor(private readonly cfg: GameConfig["effects"]) {}

  burst(x: number, y: number, color: string, count: number, speed: number, size = 8): void {
    for (let i = 0; i < count && this.particles.length < this.cfg.maxParticles; i++) {
      const angle = Math.random() * Math.PI * 2;
      const v = randRange(speed * 0.3, speed);
      const life = randRange(0.4, 0.9);
      this.particles.push({
        x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v,
        life, maxLife: life, size: randRange(size * 0.5, size), color, drag: 3,
      });
    }
  }

  floatingText(x: number, y: number, text: string, color: string, size = 44): void {
    if (this.texts.length >= this.cfg.maxFloatingTexts) this.texts.shift();
    this.texts.push({ x: x + randRange(-15, 15), y, text, color, size, life: 0.9, maxLife: 0.9 });
  }

  ring(x: number, y: number, maxRadius: number, color: string, duration = 0.6, width = 10): void {
    this.rings.push({ x, y, maxRadius, life: duration, maxLife: duration, color, width });
  }

  shake(intensity: number, duration: number): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeTime = Math.max(this.shakeTime, duration);
  }

  flash(color: string, duration: number): void {
    this.flashColor = color;
    this.flashTime = duration;
    this.flashMax = duration;
  }

  clear(): void {
    this.particles = [];
    this.texts = [];
    this.rings = [];
  }

  get particleCount(): number {
    return this.particles.length;
  }

  update(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt;
      const decay = Math.exp(-p.drag * dt);
      p.vx *= decay;
      p.vy *= decay;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.texts) {
      t.life -= dt;
      t.y -= 90 * dt;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    this.shakeTime = Math.max(0, this.shakeTime - dt);
    if (this.shakeTime === 0) this.shakeIntensity = 0;
    this.flashTime = Math.max(0, this.flashTime - dt);
  }

  /** Deslocamento de câmera do tremor de tela. */
  shakeOffset(): { x: number; y: number } {
    if (this.shakeTime <= 0) return { x: 0, y: 0 };
    return { x: randRange(-1, 1) * this.shakeIntensity, y: randRange(-1, 1) * this.shakeIntensity };
  }

  renderWorld(ctx: CanvasRenderingContext2D): void {
    for (const r of this.rings) {
      const t = 1 - r.life / r.maxLife;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - t) + 2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.maxRadius * t, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    for (const t of this.texts) {
      const k = t.life / t.maxLife;
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font = font(t.size, 900);
      ctx.lineWidth = 8;
      ctx.strokeStyle = "rgba(0,0,0,0.8)";
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  renderScreen(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (this.flashTime <= 0) return;
    ctx.globalAlpha = 0.35 * (this.flashTime / this.flashMax);
    ctx.fillStyle = this.flashColor;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
  }
}
