/** Helpers de desenho compartilhados pela UI. */

/**
 * Fontes de texto PRIMEIRO, emoji por último: fontes de emoji também têm
 * dígitos e espaço, e se vierem antes deixam os números "espaçados".
 */
export const FONT_FAMILY = `"Segoe UI", Roboto, "Helvetica Neue", Arial, "Liberation Sans", sans-serif, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"`;

export function font(size: number, weight = 800): string {
  return `${weight} ${size}px ${FONT_FAMILY}`;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alpha = 0.55): void {
  ctx.fillStyle = `rgba(0, 18, 40, ${alpha})`;
  roundRect(ctx, x, y, w, h, 28);
  ctx.fill();
  ctx.strokeStyle = "rgba(120, 220, 255, 0.35)";
  ctx.lineWidth = 3;
  ctx.stroke();
}

export interface TextStyle {
  size: number;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  weight?: number;
  /** Contorno escuro para leitura sobre qualquer fundo. */
  stroke?: number;
}

export function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, style: TextStyle): void {
  ctx.font = font(style.size, style.weight ?? 800);
  ctx.textAlign = style.align ?? "left";
  ctx.textBaseline = style.baseline ?? "middle";
  if (style.stroke) {
    ctx.lineJoin = "round";
    ctx.lineWidth = style.stroke;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
    ctx.strokeText(value, x, y);
  }
  ctx.fillStyle = style.color ?? "#ffffff";
  ctx.fillText(value, x, y);
}

/** Corta o texto com "…" para caber em `maxWidth` (usa a fonte atual). */
export function fitText(ctx: CanvasRenderingContext2D, value: string, maxWidth: number): string {
  if (ctx.measureText(value).width <= maxWidth) return value;
  const chars = Array.from(value);
  while (chars.length > 1 && ctx.measureText(`${chars.join("")}…`).width > maxWidth) chars.pop();
  return `${chars.join("")}…`;
}

/** Maior tamanho de fonte (até `maxSize`) em que o texto cabe em `maxWidth`. */
export function fitFontSize(ctx: CanvasRenderingContext2D, value: string, maxWidth: number, maxSize: number, weight = 900, minSize = 24): number {
  let size = maxSize;
  ctx.font = font(size, weight);
  const width = ctx.measureText(value).width;
  if (width > maxWidth) size = Math.max(minSize, Math.floor((maxSize * maxWidth) / width));
  return size;
}
