import type { LeaderboardEntry } from "../store/LeaderboardStore";
import { fitText, font, panel, text } from "./render";

const MEDALS = ["🥇", "🥈", "🥉"];

/** Painel "TOP INTERAÇÕES". */
export class LeaderboardView {
  constructor(private readonly x: number, private readonly y: number, private readonly width: number) {}

  render(ctx: CanvasRenderingContext2D, entries: LeaderboardEntry[], size: number): void {
    const rowH = 52;
    const height = 80 + Math.max(1, size) * rowH;
    panel(ctx, this.x, this.y, this.width, height, 0.6);
    text(ctx, "🏆 TOP INTERAÇÕES", this.x + this.width / 2, this.y + 42, { size: 34, weight: 900, align: "center", color: "#ffd740" });
    if (entries.length === 0) {
      text(ctx, "Interaja para entrar!", this.x + this.width / 2, this.y + 80 + rowH / 2, { size: 28, align: "center", color: "#b3e5fc" });
      return;
    }
    entries.slice(0, size).forEach((entry, i) => {
      const y = this.y + 80 + i * rowH + rowH / 2;
      const prefix = MEDALS[i] ?? `${i + 1}.`;
      text(ctx, prefix, this.x + 26, y, { size: 32 });
      ctx.font = font(32, 800);
      const name = fitText(ctx, entry.username, this.width - 110);
      text(ctx, name, this.x + 80, y, { size: 32, stroke: 5 });
    });
  }
}
