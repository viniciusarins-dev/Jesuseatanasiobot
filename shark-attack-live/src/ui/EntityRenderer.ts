import type { Player } from "../entities/Player";
import type { Projectile } from "../entities/Projectile";
import type { Shark } from "../entities/Shark";
import { drawSharkBody } from "./art/SharkArt";
import { drawSwimmer } from "./art/SwimmerArt";
import { fitText, font, roundRect, text } from "./render";

/** Tubarão (arte em ./art/SharkArt) + nome de quem invocou e barra de vida. */
export function drawShark(ctx: CanvasRenderingContext2D, shark: Shark, time: number): void {
  drawSharkBody(ctx, shark, time);
  drawSharkLabels(ctx, shark);
}

function drawSharkLabels(ctx: CanvasRenderingContext2D, shark: Shark): void {
  const r = shark.radius;
  let y = shark.y - r - 26;

  if (shark.type !== "small" && shark.health < shark.maxHealth) {
    const w = Math.max(90, r * 1.6);
    const h = shark.isMega ? 18 : 12;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    roundRect(ctx, shark.x - w / 2, y, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = shark.isMega ? "#ff1744" : "#ff9100";
    roundRect(ctx, shark.x - w / 2, y, (w * shark.health) / shark.maxHealth, h, h / 2);
    ctx.fill();
    y -= 26;
  }

  if (shark.isMega) {
    text(ctx, "👑", shark.x, y - 20, { size: 64, align: "center" });
    y -= 70;
  }

  if (shark.owner) {
    ctx.font = font(shark.isMega ? 40 : 30);
    const label = fitText(ctx, shark.owner, 320);
    text(ctx, label, shark.x, y, {
      size: shark.isMega ? 40 : 30,
      align: "center",
      color: shark.isMega ? "#ffea00" : "#ffffff",
      stroke: 7,
    });
  }
}

/** Nadador (arte em ./art/SwimmerArt) + barra de vida. */
export function drawPlayer(ctx: CanvasRenderingContext2D, player: Player): void {
  const blink = player.invulnerableTimer > 0 && Math.floor(player.time * 20) % 2 === 0;
  ctx.save();
  if (blink) ctx.globalAlpha = 0.5;
  drawSwimmer(ctx, player);
  ctx.restore();

  const r = player.radius;
  const w = 160;
  const h = 18;
  const x = player.x - w / 2;
  const y = player.y - r * 3.4;
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  roundRect(ctx, x, y, w, h, 9);
  ctx.fill();
  const ratio = player.health / player.maxHealth;
  ctx.fillStyle = ratio > 0.5 ? "#00e676" : ratio > 0.25 ? "#ffc400" : "#ff1744";
  roundRect(ctx, x, y, w * ratio, h, 9);
  ctx.fill();
}

export function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile): void {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  ctx.strokeStyle = p.special ? "#ffea00" : "#e0f7fa";
  ctx.lineWidth = p.special ? 8 : 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-34, 0);
  ctx.lineTo(10, 0);
  ctx.stroke();
  ctx.fillStyle = p.special ? "#ff9100" : "#80deea";
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(6, -9);
  ctx.lineTo(6, 9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
