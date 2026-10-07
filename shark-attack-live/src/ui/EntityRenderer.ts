import type { Player } from "../entities/Player";
import type { Projectile } from "../entities/Projectile";
import type { Shark } from "../entities/Shark";
import { fitText, font, roundRect, text } from "./render";

/** Tubarão em vista de cima, desenhado proceduralmente (sem imagens). */
export function drawShark(ctx: CanvasRenderingContext2D, shark: Shark, time: number): void {
  const r = shark.radius;
  const sway = Math.sin(time * 9 + shark.wobblePhase) * 0.22;

  ctx.save();
  ctx.translate(shark.x, shark.y);

  if (shark.isMega) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 6);
    const glow = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 1.9);
    glow.addColorStop(0, `rgba(255, 40, 90, ${0.35 + pulse * 0.25})`);
    glow.addColorStop(1, "rgba(255, 40, 90, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.9, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.rotate(shark.angle);
  // Sombra.
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.beginPath();
  ctx.ellipse(r * 0.1, r * 0.25, r * 1.15, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cauda.
  ctx.fillStyle = shark.bodyColor;
  ctx.beginPath();
  ctx.moveTo(-r * 0.9, 0);
  ctx.lineTo(-r * 1.75, -r * (0.65 - sway));
  ctx.lineTo(-r * 1.45, 0);
  ctx.lineTo(-r * 1.75, r * (0.65 + sway));
  ctx.closePath();
  ctx.fill();

  // Nadadeiras peitorais.
  ctx.beginPath();
  ctx.moveTo(r * 0.25, -r * 0.35);
  ctx.lineTo(-r * 0.45, -r * 1.0);
  ctx.lineTo(-r * 0.2, -r * 0.3);
  ctx.moveTo(r * 0.25, r * 0.35);
  ctx.lineTo(-r * 0.45, r * 1.0);
  ctx.lineTo(-r * 0.2, r * 0.3);
  ctx.fill();

  // Corpo com focinho.
  ctx.beginPath();
  ctx.moveTo(r * 1.3, 0);
  ctx.quadraticCurveTo(r * 0.9, -r * 0.55, -r * 0.2, -r * 0.5);
  ctx.quadraticCurveTo(-r * 0.95, -r * 0.35, -r * 1.0, 0);
  ctx.quadraticCurveTo(-r * 0.95, r * 0.35, -r * 0.2, r * 0.5);
  ctx.quadraticCurveTo(r * 0.9, r * 0.55, r * 1.3, 0);
  ctx.fill();

  // Faixa clara (barriga) e dorsal escura.
  ctx.fillStyle = shark.bellyColor;
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.ellipse(r * 0.15, 0, r * 0.75, r * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.beginPath();
  ctx.moveTo(r * 0.1, 0);
  ctx.lineTo(-r * 0.45, -r * 0.18);
  ctx.lineTo(-r * 0.45, r * 0.18);
  ctx.closePath();
  ctx.fill();

  // Olhos.
  ctx.fillStyle = shark.isMega ? "#ffea00" : "#111";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(r * 0.85, side * r * 0.24, Math.max(4, r * 0.08), 0, Math.PI * 2);
    ctx.fill();
  }

  if (shark.isMega) {
    // Listras de "perigo".
    ctx.strokeStyle = "rgba(255, 234, 0, 0.7)";
    ctx.lineWidth = r * 0.06;
    for (let i = 0; i < 3; i++) {
      const x = -r * 0.1 - i * r * 0.25;
      ctx.beginPath();
      ctx.moveTo(x, -r * 0.38);
      ctx.lineTo(x - r * 0.12, r * 0.38);
      ctx.stroke();
    }
  }

  // Flash branco ao levar dano.
  if (shark.hitFlash > 0) {
    ctx.globalAlpha = Math.min(1, shark.hitFlash * 8) * 0.7;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.2, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

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

export function drawPlayer(ctx: CanvasRenderingContext2D, player: Player): void {
  const r = player.radius;
  const blink = player.invulnerableTimer > 0 && Math.floor(player.time * 20) % 2 === 0;
  ctx.save();
  ctx.translate(player.x, player.y);

  // Halo de luz.
  const halo = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 2.4);
  halo.addColorStop(0, "rgba(255, 230, 120, 0.35)");
  halo.addColorStop(1, "rgba(255, 230, 120, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, r * 2.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = blink ? 0.45 : 1;
  // Arpão (aponta para o alvo).
  ctx.save();
  ctx.rotate(player.facing);
  ctx.fillStyle = "#37474f";
  roundRect(ctx, r * 0.4, -r * 0.14, r * 1.05, r * 0.28, 6);
  ctx.fill();
  ctx.restore();

  // Corpo (mergulhador visto de cima).
  const body = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.2, 0, 0, r);
  body.addColorStop(0, "#ffe082");
  body.addColorStop(1, "#ff8f00");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();

  // Máscara de mergulho.
  ctx.save();
  ctx.rotate(player.facing);
  ctx.fillStyle = "#00e5ff";
  roundRect(ctx, r * 0.15, -r * 0.45, r * 0.5, r * 0.9, r * 0.2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  roundRect(ctx, r * 0.42, -r * 0.35, r * 0.12, r * 0.3, 4);
  ctx.fill();
  ctx.restore();

  if (player.hitFlash > 0) {
    ctx.globalAlpha = player.hitFlash * 3;
    ctx.fillStyle = "#ff1744";
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
  }
  if (player.healFlash > 0) {
    ctx.globalAlpha = player.healFlash;
    ctx.strokeStyle = "#69f0ae";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(0, 0, r + 14, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  if (player.shielded) {
    const pulse = 0.6 + 0.4 * Math.sin(player.time * 10);
    ctx.strokeStyle = `rgba(100, 220, 255, ${pulse})`;
    ctx.fillStyle = "rgba(100, 220, 255, 0.15)";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  // Barra de vida acima do jogador.
  const w = 150;
  const h = 18;
  const x = player.x - w / 2;
  const y = player.y - r - 48;
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
