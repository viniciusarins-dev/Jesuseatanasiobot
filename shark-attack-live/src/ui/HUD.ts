import type { GameState } from "../game/GameState";
import type { DifficultyParams } from "../systems/DifficultySystem";
import { formatCompact, formatScore, formatTime } from "../utils/format";
import { fitText, font, panel, roundRect, text } from "./render";

/** Placar superior + contadores da LIVE. Textos grandes para celular. */
export class HUD {
  constructor(private readonly width: number, private readonly title: string) {}

  render(ctx: CanvasRenderingContext2D, state: GameState, difficulty: DifficultyParams): void {
    const w = this.width;
    const margin = 30;
    panel(ctx, margin, 24, w - margin * 2, 300, 0.6);

    ctx.font = font(52, 900);
    text(ctx, fitText(ctx, this.title, w - 330), margin + 36, 80, { size: 52, weight: 900, color: "#ffffff", stroke: 6 });
    // Selo de nível.
    ctx.fillStyle = "#ff6d00";
    roundRect(ctx, w - margin - 230, 48, 200, 64, 32);
    ctx.fill();
    text(ctx, `NÍVEL ${difficulty.level}`, w - margin - 130, 81, { size: 38, weight: 900, align: "center" });

    text(ctx, `SCORE: ${formatScore(state.round.score)}`, margin + 36, 160, {
      size: 70,
      weight: 900,
      color: "#ffea00",
      stroke: 8,
    });
    text(ctx, `SOBREVIVÊNCIA: ${formatTime(state.round.survivalTime)}`, margin + 36, 228, { size: 42, stroke: 6 });
    text(ctx, `TUBARÕES DERROTADOS: ${state.round.kills}`, margin + 36, 282, { size: 42, stroke: 6 });

    // Contadores da LIVE.
    const pills: [string, string][] = [
      [`❤️ ${formatCompact(state.live.likes)}`, "#ff5c8a"],
      [`👥 ${formatCompact(state.live.followers)}`, "#69f0ae"],
      [`🎁 ${formatCompact(state.live.gifts)}`, "#ffd740"],
    ];
    const pillW = (w - margin * 2 - 40) / 3;
    pills.forEach(([label, color], i) => {
      const x = margin + i * (pillW + 20);
      ctx.fillStyle = "rgba(0, 18, 40, 0.6)";
      roundRect(ctx, x, 342, pillW, 70, 35);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.stroke();
      text(ctx, label, x + pillW / 2, 378, { size: 40, align: "center", weight: 900 });
    });
  }
}
