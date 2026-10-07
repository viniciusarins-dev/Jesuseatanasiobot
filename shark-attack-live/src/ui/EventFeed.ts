import { easeOutCubic } from "../utils/math";
import { fitText, font, roundRect, text } from "./render";

interface FeedItem {
  text: string;
  color: string;
  age: number;
}

/** Mensagens temporárias de participação ("🌹 João enviou uma Rosa!"). */
export class EventFeed {
  private items: FeedItem[] = [];

  constructor(
    private readonly x: number,
    private readonly y: number,
    private readonly maxWidth: number,
    private readonly durationSeconds: number,
    private readonly maxItems: number,
  ) {}

  push(message: string, color = "#ffffff"): void {
    this.items.unshift({ text: message, color, age: 0 });
    if (this.items.length > this.maxItems) this.items.length = this.maxItems;
  }

  update(dt: number): void {
    for (const item of this.items) item.age += dt;
    this.items = this.items.filter((i) => i.age < this.durationSeconds);
  }

  render(ctx: CanvasRenderingContext2D): void {
    const size = 34;
    const rowH = 64;
    this.items.forEach((item, index) => {
      const slideIn = easeOutCubic(Math.min(1, item.age / 0.25));
      const fadeOut = Math.min(1, (this.durationSeconds - item.age) / 0.6);
      const y = this.y + index * (rowH + 10);
      ctx.globalAlpha = Math.max(0, fadeOut);
      ctx.font = font(size, 800);
      const label = fitText(ctx, item.text, this.maxWidth - 40);
      const width = Math.min(this.maxWidth, ctx.measureText(label).width + 40);
      const x = this.x - (1 - slideIn) * (width + 40);
      ctx.fillStyle = "rgba(0, 18, 40, 0.7)";
      roundRect(ctx, x, y, width, rowH, 22);
      ctx.fill();
      ctx.fillStyle = item.color;
      roundRect(ctx, x, y, 8, rowH, 4);
      ctx.fill();
      text(ctx, label, x + 22, y + rowH / 2 + 1, { size, color: item.color, stroke: 5 });
    });
    ctx.globalAlpha = 1;
  }
}
