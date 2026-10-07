import type { RoundStats } from "../game/GameState";
import { formatScore, formatTime } from "../utils/format";
import { panel, text } from "./render";

export class GameOverScreen {
  constructor(private readonly width: number, private readonly height: number) {}

  render(ctx: CanvasRenderingContext2D, round: RoundStats, bestScore: number, secondsLeft: number): void {
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, 0, this.width, this.height);
    const w = this.width - 120;
    const x = 60;
    const y = this.height / 2 - 380;
    panel(ctx, x, y, w, 700, 0.85);
    const cx = this.width / 2;
    text(ctx, "GAME OVER", cx, y + 110, { size: 120, weight: 900, align: "center", color: "#ff1744", stroke: 12 });
    text(ctx, `SCORE: ${formatScore(round.score)}`, cx, y + 250, { size: 72, weight: 900, align: "center", color: "#ffea00", stroke: 8 });
    text(ctx, `SOBREVIVÊNCIA: ${formatTime(round.survivalTime)}`, cx, y + 350, { size: 48, align: "center", stroke: 6 });
    text(ctx, `TUBARÕES DERROTADOS: ${round.kills}`, cx, y + 420, { size: 48, align: "center", stroke: 6 });
    text(ctx, `🏆 RECORDE DA LIVE: ${formatScore(bestScore)}`, cx, y + 500, { size: 44, align: "center", color: "#ffd740", stroke: 6 });
    text(ctx, `Nova rodada em ${Math.max(1, Math.ceil(secondsLeft))}…`, cx, y + 610, { size: 50, weight: 900, align: "center", color: "#80d8ff", stroke: 6 });
  }
}
