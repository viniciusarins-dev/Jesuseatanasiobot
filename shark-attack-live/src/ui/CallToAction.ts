import { fitFontSize, roundRect, text } from "./render";

/** Faixa inferior com as chamadas para interação + progresso de curtidas. */
export class CallToAction {
  private time = 0;

  constructor(
    private readonly width: number,
    private readonly y: number,
    private readonly messages: readonly string[],
    private readonly rotateSeconds: number,
  ) {}

  update(dt: number): void {
    this.time += dt;
  }

  render(ctx: CanvasRenderingContext2D, likesTowardChaos: number, likeThreshold: number): void {
    const margin = 30;
    const w = this.width - margin * 2;

    // Barra de progresso do próximo "caos".
    const barY = this.y;
    ctx.fillStyle = "rgba(0, 18, 40, 0.7)";
    roundRect(ctx, margin, barY, w, 56, 28);
    ctx.fill();
    const ratio = Math.min(1, likesTowardChaos / likeThreshold);
    if (ratio > 0) {
      ctx.fillStyle = "#ff5c8a";
      roundRect(ctx, margin, barY, Math.max(56, w * ratio), 56, 28);
      ctx.fill();
    }
    text(ctx, `❤️ ${likesTowardChaos}/${likeThreshold} CURTIDAS PARA O CAOS`, this.width / 2, barY + 29, {
      size: 32,
      weight: 900,
      align: "center",
      stroke: 6,
    });

    if (this.messages.length === 0) return;
    const index = Math.floor(this.time / this.rotateSeconds) % this.messages.length;
    const phase = (this.time % this.rotateSeconds) / this.rotateSeconds;
    const pulse = 1 + Math.sin(this.time * 5) * 0.025;
    const fade = Math.min(1, phase * 6, (1 - phase) * 6);
    const boxY = barY + 76;
    ctx.save();
    ctx.translate(this.width / 2, boxY + 50);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = "rgba(255, 109, 0, 0.92)";
    roundRect(ctx, -w / 2, -50, w, 100, 50);
    ctx.fill();
    ctx.globalAlpha = Math.max(0, fade);
    const message = this.messages[index];
    const size = fitFontSize(ctx, message, w - 60, 44);
    text(ctx, message, 0, 2, { size, weight: 900, align: "center", stroke: 6 });
    ctx.restore();
  }
}
