import { easeOutBack } from "../utils/math";
import { fitFontSize, fitText, font, text } from "./render";

interface Alert {
  title: string;
  subtitle: string;
  color: string;
  age: number;
}

/** Alertas grandes no centro ("MEGA TUBARÃO!"). Exibidos um de cada vez. */
export class AlertBanner {
  private readonly queue: Alert[] = [];
  private current: Alert | null = null;

  constructor(
    private readonly centerX: number,
    private readonly centerY: number,
    private readonly maxWidth: number,
    private readonly durationSeconds: number,
    private readonly maxQueue = 3,
  ) {}

  /**
   * `urgent` (ex.: MEGA TUBARÃO) fura a fila e encerra o alerta atual.
   * Um título que já está na fila não é repetido (evita fila longa em rajadas).
   */
  push(title: string, subtitle: string, color: string, urgent = false): void {
    const alert = { title, subtitle, color, age: 0 };
    if (urgent) {
      this.queue.unshift(alert);
      if (this.current && this.current.title !== title) {
        this.current.age = Math.max(this.current.age, this.durationSeconds - 0.15);
      }
      return;
    }
    if (this.current?.title === title || this.queue.some((a) => a.title === title)) return;
    if (this.queue.length >= this.maxQueue) this.queue.shift();
    this.queue.push(alert);
  }

  update(dt: number): void {
    if (this.current) {
      this.current.age += dt;
      if (this.current.age >= this.durationSeconds) this.current = null;
    }
    if (!this.current) this.current = this.queue.shift() ?? null;
  }

  render(ctx: CanvasRenderingContext2D): void {
    const a = this.current;
    if (!a) return;
    const appear = Math.min(1, a.age / 0.35);
    const fade = Math.min(1, (this.durationSeconds - a.age) / 0.4);
    const scale = easeOutBack(appear);
    ctx.save();
    ctx.globalAlpha = Math.max(0, fade);
    ctx.translate(this.centerX, this.centerY);
    ctx.scale(scale, scale);
    ctx.rotate(Math.sin(a.age * 12) * 0.02);

    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(-this.centerX, -130, this.centerX * 2, 260);
    // Título nunca é cortado: a fonte diminui até caber.
    const titleSize = fitFontSize(ctx, a.title, this.maxWidth, 120);
    ctx.shadowColor = a.color;
    ctx.shadowBlur = 40;
    text(ctx, a.title, 0, -20, { size: titleSize, weight: 900, align: "center", color: a.color, stroke: 14 });
    ctx.shadowBlur = 0;
    if (a.subtitle) {
      ctx.font = font(48, 800);
      text(ctx, fitText(ctx, a.subtitle, this.maxWidth), 0, 80, { size: 48, align: "center", stroke: 8 });
    }
    ctx.restore();
  }
}
