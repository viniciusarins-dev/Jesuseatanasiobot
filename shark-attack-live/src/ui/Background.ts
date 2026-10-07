import type { GameConfig } from "../config/gameConfig";
import { randRange } from "../utils/math";

interface Bubble {
  x: number;
  y: number;
  r: number;
  speed: number;
  wobble: number;
}

/** Oceano animado: gradiente, raios de luz, bolhas e algas. */
export class Background {
  private readonly bubbles: Bubble[] = [];
  private time = 0;

  constructor(private readonly width: number, private readonly height: number, effects: GameConfig["effects"]) {
    for (let i = 0; i < effects.bubbleCount; i++) this.bubbles.push(this.newBubble(randRange(0, height)));
  }

  private newBubble(y: number): Bubble {
    return { x: randRange(0, this.width), y, r: randRange(3, 12), speed: randRange(30, 110), wobble: randRange(0, Math.PI * 2) };
  }

  update(dt: number): void {
    this.time += dt;
    for (let i = 0; i < this.bubbles.length; i++) {
      const b = this.bubbles[i];
      b.y -= b.speed * dt;
      if (b.y < -20) this.bubbles[i] = this.newBubble(this.height + 20);
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    const { width: w, height: h, time } = this;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#0b6fa4");
    grad.addColorStop(0.45, "#064a7a");
    grad.addColorStop(1, "#021a33");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Raios de luz vindos da superfície.
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 6; i++) {
      const x = (i + 0.5) * (w / 6) + Math.sin(time * 0.3 + i) * 60;
      const alpha = 0.04 + 0.03 * Math.sin(time * 0.8 + i * 1.7);
      const rayGrad = ctx.createLinearGradient(0, 0, 0, h * 0.8);
      rayGrad.addColorStop(0, `rgba(180, 240, 255, ${alpha * 2})`);
      rayGrad.addColorStop(1, "rgba(180, 240, 255, 0)");
      ctx.fillStyle = rayGrad;
      ctx.beginPath();
      ctx.moveTo(x - 40, 0);
      ctx.lineTo(x + 40, 0);
      ctx.lineTo(x + 220, h * 0.8);
      ctx.lineTo(x - 60, h * 0.8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Algas no fundo.
    ctx.strokeStyle = "rgba(30, 140, 90, 0.55)";
    ctx.lineCap = "round";
    for (let i = 0; i < 14; i++) {
      const baseX = (i + 0.5) * (w / 14);
      const height = 120 + (i % 4) * 45;
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(baseX, h);
      for (let s = 1; s <= 6; s++) {
        const y = h - (height * s) / 6;
        const sway = Math.sin(time * 1.2 + i + s * 0.6) * s * 5;
        ctx.lineTo(baseX + sway, y);
      }
      ctx.stroke();
    }

    // Bolhas.
    ctx.strokeStyle = "rgba(200, 240, 255, 0.55)";
    ctx.fillStyle = "rgba(200, 240, 255, 0.12)";
    ctx.lineWidth = 2;
    for (const b of this.bubbles) {
      const x = b.x + Math.sin(time * 2 + b.wobble) * 8;
      ctx.beginPath();
      ctx.arc(x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}
