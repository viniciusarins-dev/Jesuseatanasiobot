import type { SharkType } from "../config/gameConfig";
import type { RoundStats } from "../game/GameState";
import { formatScore, formatTime } from "../utils/format";
import { fitFontSize, panel, text } from "./render";

export interface Killer {
  type: SharkType;
  owner?: string;
}

const SPECIES_NAME: Record<SharkType, string> = {
  small: "tubarão-de-recife",
  medium: "tubarão-martelo",
  giant: "tubarão-branco",
  mega: "MEGA TUBARÃO",
};

/** Texto de quem derrubou o jogador (destaca o espectador que invocou). */
export function killerText(killer: Killer | null): string | null {
  if (!killer) return null;
  if (killer.owner === "❤️") return `🦈 Derrotado pelo ${SPECIES_NAME[killer.type]} das curtidas!`;
  if (killer.owner) return `🦈 Derrotado pelo tubarão de ${killer.owner}!`;
  return `🦈 Derrotado por um ${SPECIES_NAME[killer.type]}`;
}

export class GameOverScreen {
  constructor(private readonly width: number, private readonly height: number) {}

  render(
    ctx: CanvasRenderingContext2D,
    round: RoundStats,
    bestScore: number,
    secondsLeft: number,
    killer: Killer | null = null,
  ): void {
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, 0, this.width, this.height);
    const w = this.width - 120;
    const x = 60;
    const y = this.height / 2 - 400;
    panel(ctx, x, y, w, 760, 0.85);
    const cx = this.width / 2;
    text(ctx, "GAME OVER", cx, y + 105, { size: 120, weight: 900, align: "center", color: "#ff1744", stroke: 12 });

    const byLine = killerText(killer);
    if (byLine) {
      const size = fitFontSize(ctx, byLine, w - 60, 46);
      text(ctx, byLine, cx, y + 210, { size, weight: 900, align: "center", color: "#ff9e80", stroke: 7 });
    }
    text(ctx, `SCORE: ${formatScore(round.score)}`, cx, y + 320, { size: 72, weight: 900, align: "center", color: "#ffea00", stroke: 8 });
    text(ctx, `SOBREVIVÊNCIA: ${formatTime(round.survivalTime)}`, cx, y + 415, { size: 48, align: "center", stroke: 6 });
    text(ctx, `TUBARÕES DERROTADOS: ${round.kills}`, cx, y + 485, { size: 48, align: "center", stroke: 6 });
    text(ctx, `🏆 RECORDE DA LIVE: ${formatScore(bestScore)}`, cx, y + 565, { size: 44, align: "center", color: "#ffd740", stroke: 6 });
    text(ctx, `Nova rodada em ${Math.max(1, Math.ceil(secondsLeft))}…`, cx, y + 675, { size: 50, weight: 900, align: "center", color: "#80d8ff", stroke: 6 });
  }
}
