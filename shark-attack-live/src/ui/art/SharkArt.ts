import type { SharkType } from "../../config/gameConfig";
import type { Shark } from "../../entities/Shark";

/**
 * Arte procedural dos tubarões (vista de cima). Cada tipo tem uma "espécie"
 * visual. As cores vêm do gameConfig; aqui ficam só as formas.
 *
 * O corpo é construído ao longo de uma "espinha" que ondula (nado), então
 * cabeça quase parada e cauda balançando — como um tubarão de verdade.
 */

interface Species {
  /** Largura máxima do corpo em relação ao raio. */
  bulk: number;
  /** Comprimento do corpo em relação ao raio. */
  length: number;
  head: "normal" | "hammer";
  /** Cor das pontas das nadadeiras (null = sem destaque). */
  finTip: string | null;
  scars: boolean;
  spikes: boolean;
  /** Amplitude e velocidade do nado. */
  swayAmp: number;
  swaySpeed: number;
}

const SPECIES: Record<SharkType, Species> = {
  // Tubarão-de-recife: esguio, rápido, pontas pretas.
  small: { bulk: 0.36, length: 2.85, head: "normal", finTip: "#1b2631", scars: false, spikes: false, swayAmp: 0.42, swaySpeed: 11 },
  // Tubarão-martelo.
  medium: { bulk: 0.38, length: 2.75, head: "hammer", finTip: null, scars: false, spikes: false, swayAmp: 0.36, swaySpeed: 8 },
  // Tubarão-branco: robusto, com cicatrizes.
  giant: { bulk: 0.5, length: 2.7, head: "normal", finTip: null, scars: true, spikes: false, swayAmp: 0.26, swaySpeed: 5 },
  // Monstro do evento especial.
  mega: { bulk: 0.54, length: 2.7, head: "normal", finTip: "#ffea00", scars: true, spikes: true, swayAmp: 0.24, swaySpeed: 5 },
};

const SEGMENTS = 14;
const OUTLINE = "rgba(0, 18, 38, 0.55)";

interface Spine {
  /** Pontos da espinha do focinho (0) à base da cauda (SEGMENTS). */
  xs: number[];
  ys: number[];
  /** Meia-largura do corpo em cada ponto. */
  hw: number[];
}

/**
 * Meia-largura ao longo do corpo (t=0 focinho, t=1 base da cauda):
 * torpedo suave, mais largo em ~1/3 e afinando até o pedúnculo da cauda.
 */
function profile(t: number): number {
  // Pico em ~40% do corpo; focinho afilado e arredondado; pedúnculo fino.
  return 0.1 + 0.9 * Math.sin(Math.PI * Math.min(1, t ** 0.78 * 0.98 + 0.02));
}

function buildSpine(r: number, sp: Species, sway: number): Spine {
  const nose = r * sp.length * 0.54;
  const len = r * sp.length;
  const xs: number[] = [];
  const ys: number[] = [];
  const hw: number[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS;
    xs.push(nose - t * len);
    // Cauda balança muito; cabeça faz um leve contra-movimento.
    ys.push(sway * r * sp.swayAmp * t * t - sway * r * 0.04 * (1 - t));
    hw.push(r * sp.bulk * profile(t));
  }
  return { xs, ys, hw };
}

/** Contorno suave do corpo (curvas pelos pontos médios das bordas). */
function bodyPath(s: Spine): Path2D {
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    left.push([s.xs[i], s.ys[i] - s.hw[i]]);
    right.push([s.xs[i], s.ys[i] + s.hw[i]]);
  }
  const pts = [...left, ...right.reverse()];
  const path = new Path2D();
  const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(pts[pts.length - 1], pts[0]);
  path.moveTo(start[0], start[1]);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const m = mid(p, pts[(i + 1) % pts.length]);
    path.quadraticCurveTo(p[0], p[1], m[0], m[1]);
  }
  path.closePath();
  return path;
}

/** Pinta a ponta de uma nadadeira sem sair do contorno dela. */
function paintTip(ctx: CanvasRenderingContext2D, path: Path2D, color: string, spots: number[][]): void {
  ctx.save();
  ctx.clip(path);
  ctx.fillStyle = color;
  for (const [x, y, rad] of spots) {
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amount > 0 ? (255 - c) * amount : c * amount))));
  return `rgb(${f((n >> 16) & 255)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

export function drawSharkBody(ctx: CanvasRenderingContext2D, shark: Shark, time: number): void {
  const sp = SPECIES[shark.type];
  const r = shark.radius;
  const charging = shark.isMega && "charging" in shark && (shark as { charging: boolean }).charging;
  const swayPhase = time * sp.swaySpeed * (charging ? 2.2 : 1) + shark.wobblePhase;
  const sway = Math.sin(swayPhase);
  const spine = buildSpine(r, sp, sway);
  const body = bodyPath(spine);
  const dark = shade(shark.bodyColor, -0.45);
  const fin = shade(shark.bodyColor, -0.2);
  const at = (t: number) => Math.round(t * SEGMENTS);

  ctx.save();
  ctx.translate(shark.x, shark.y);

  if (shark.isMega) drawMegaAura(ctx, r, time);

  // Sombra projetada no "fundo" (deslocamento fixo no mundo).
  ctx.save();
  ctx.translate(r * 0.18, r * 0.35);
  ctx.rotate(shark.angle);
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "#001020";
  ctx.fill(body);
  ctx.restore();

  ctx.rotate(shark.angle);

  drawWake(ctx, spine, r, time, shark.wobblePhase);
  drawCaudalFin(ctx, spine, r, fin, sp.finTip, sway);

  // Nadadeiras pélvicas (pequenas, perto da cauda).
  drawFinPair(ctx, spine, at(0.66), r * 0.22, r * 0.2, fin, sp.finTip, sway * 0.1);
  // Nadadeiras peitorais (grandes, batendo levemente).
  drawFinPair(ctx, spine, at(0.3), r * 0.62, r * 0.55, fin, sp.finTip, Math.sin(swayPhase * 0.5) * 0.12);

  // Corpo com sombreamento: dorso escuro no centro, laterais claras.
  const maxW = r * sp.bulk;
  const grad = ctx.createLinearGradient(0, -maxW, 0, maxW);
  grad.addColorStop(0, shark.bellyColor);
  grad.addColorStop(0.2, shark.bodyColor);
  grad.addColorStop(0.5, dark);
  grad.addColorStop(0.8, shark.bodyColor);
  grad.addColorStop(1, shark.bellyColor);
  ctx.fillStyle = grad;
  ctx.fill(body);
  ctx.lineWidth = Math.max(2.5, r * 0.05);
  ctx.strokeStyle = OUTLINE;
  ctx.stroke(body);

  // Brilho ao longo do dorso.
  ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
  ctx.lineWidth = r * 0.06;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let i = at(0.08); i <= at(0.7); i++) {
    const y = spine.ys[i] - spine.hw[i] * 0.35;
    if (i === at(0.08)) ctx.moveTo(spine.xs[i], y);
    else ctx.lineTo(spine.xs[i], y);
  }
  ctx.stroke();

  drawGills(ctx, spine, r);
  if (sp.scars) drawScars(ctx, spine, r);
  drawDorsalFin(ctx, spine, r, dark, sp.finTip);
  if (sp.spikes) drawSpikes(ctx, spine, r, time);

  if (sp.head === "hammer") {
    drawHammerHead(ctx, spine, r, shark.bodyColor, dark);
    drawMouth(ctx, spine, r, shark.mouthOpen, 0.16);
  } else {
    drawMouth(ctx, spine, r, shark.mouthOpen, 0.06);
    drawEyes(ctx, spine, r, shark.isMega, time);
  }

  // Flash branco ao levar dano.
  if (shark.hitFlash > 0) {
    ctx.globalAlpha = Math.min(1, shark.hitFlash * 8) * 0.75;
    ctx.fillStyle = "#ffffff";
    ctx.fill(body);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/**
 * Boca aberta com dentes, no focinho. `open` 0..1 (perto do alvo ~0.55,
 * mordendo = 1). `t` = posição ao longo do corpo.
 */
function drawMouth(ctx: CanvasRenderingContext2D, s: Spine, r: number, open: number, t: number): void {
  if (open < 0.08) return;
  const i = Math.round(t * SEGMENTS);
  const cx = s.xs[i] - r * 0.02;
  const cy = s.ys[i];
  const rx = r * (0.04 + 0.11 * open);
  const ry = Math.max(s.hw[Math.min(SEGMENTS, i + 2)] * 0.7, r * 0.11) * (0.55 + 0.45 * open);

  const inside = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
  inside.addColorStop(0, "#c62828");
  inside.addColorStop(0.6, "#5d0b0b");
  inside.addColorStop(1, "#1a0000");
  ctx.fillStyle = inside;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  // Dentes triangulares em volta da abertura, apontando para dentro.
  const teeth = 10;
  const size = Math.max(3.5, r * 0.075) * (0.6 + 0.4 * open);
  ctx.fillStyle = "#fafafa";
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  for (let k = 0; k < teeth; k++) {
    const a = (k / teeth) * Math.PI * 2;
    const ex = cx + Math.cos(a) * rx;
    const ey = cy + Math.sin(a) * ry;
    const ix = cx + Math.cos(a) * (rx - size * 1.6);
    const iy = cy + Math.sin(a) * (ry - size * 1.6);
    const px = -Math.sin(a) * size * 0.6;
    const py = Math.cos(a) * size * 0.6;
    ctx.beginPath();
    ctx.moveTo(ex + px, ey + py);
    ctx.lineTo(ex - px, ey - py);
    ctx.lineTo(ix, iy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.lineWidth = Math.max(2, r * 0.035);
  ctx.strokeStyle = OUTLINE;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawMegaAura(ctx: CanvasRenderingContext2D, r: number, time: number): void {
  const pulse = 0.5 + 0.5 * Math.sin(time * 6);
  const glow = ctx.createRadialGradient(0, 0, r * 0.4, 0, 0, r * 2.1);
  glow.addColorStop(0, `rgba(255, 30, 80, ${0.4 + pulse * 0.25})`);
  glow.addColorStop(0.6, `rgba(160, 0, 255, ${0.15 + pulse * 0.1})`);
  glow.addColorStop(1, "rgba(160, 0, 255, 0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, r * 2.1, 0, Math.PI * 2);
  ctx.fill();
}

/** Bolhinhas saindo da cauda. */
function drawWake(ctx: CanvasRenderingContext2D, s: Spine, r: number, time: number, phase: number): void {
  const tx = s.xs[SEGMENTS];
  const ty = s.ys[SEGMENTS];
  ctx.fillStyle = "rgba(220, 245, 255, 0.5)";
  for (let i = 0; i < 4; i++) {
    const k = (time * 1.4 + i / 4 + phase) % 1;
    const x = tx - k * r * 1.4;
    const y = ty + Math.sin((k + i) * 7) * r * 0.18;
    ctx.globalAlpha = 0.55 * (1 - k);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.5, r * 0.07 * (1 - k * 0.6)), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Cauda em meia-lua, seguindo o ângulo da ponta da espinha. */
function drawCaudalFin(
  ctx: CanvasRenderingContext2D,
  s: Spine,
  r: number,
  color: string,
  tip: string | null,
  sway: number,
): void {
  const bx = s.xs[SEGMENTS];
  const by = s.ys[SEGMENTS];
  const angle = Math.atan2(by - s.ys[SEGMENTS - 1], bx - s.xs[SEGMENTS - 1]) + sway * 0.35;
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(angle);
  const path = new Path2D();
  path.moveTo(-r * 0.05, 0);
  path.quadraticCurveTo(r * 0.25, -r * 0.2, r * 0.62, -r * 0.62); // lobo superior (maior)
  path.quadraticCurveTo(r * 0.42, -r * 0.18, r * 0.3, 0); // entalhe
  path.quadraticCurveTo(r * 0.4, r * 0.14, r * 0.5, r * 0.45); // lobo inferior
  path.quadraticCurveTo(r * 0.2, r * 0.16, -r * 0.05, 0);
  ctx.fillStyle = color;
  ctx.fill(path);
  if (tip) {
    paintTip(ctx, path, tip, [
      [r * 0.62, -r * 0.62, r * 0.22],
      [r * 0.5, r * 0.45, r * 0.16],
    ]);
  }
  ctx.lineWidth = Math.max(2, r * 0.04);
  ctx.strokeStyle = OUTLINE;
  ctx.stroke(path);
  ctx.restore();
}

/** Par de nadadeiras varridas para trás, ancoradas no segmento `i`. */
function drawFinPair(
  ctx: CanvasRenderingContext2D,
  s: Spine,
  i: number,
  reach: number,
  sweep: number,
  color: string,
  tip: string | null,
  flap: number,
): void {
  const x = s.xs[i];
  for (const side of [-1, 1]) {
    const y = s.ys[i] + side * s.hw[i] * 0.85;
    const tipX = x - sweep;
    const tipY = y + side * reach * (1 + flap * side);
    const path = new Path2D();
    path.moveTo(x + reach * 0.15, y);
    path.quadraticCurveTo(x - sweep * 0.1, tipY - side * reach * 0.1, tipX, tipY);
    path.quadraticCurveTo(x - sweep * 0.55, y + side * reach * 0.35, x - sweep * 0.55, y);
    path.closePath();
    ctx.fillStyle = color;
    ctx.fill(path);
    if (tip) paintTip(ctx, path, tip, [[tipX, tipY, reach * 0.38]]);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke(path);
  }
}

/** Nadadeira dorsal vista de cima: lâmina escura sobre a espinha. */
function drawDorsalFin(ctx: CanvasRenderingContext2D, s: Spine, r: number, color: string, tip: string | null): void {
  const i = Math.round(0.36 * SEGMENTS);
  const x = s.xs[i];
  const y = s.ys[i];
  const path = new Path2D();
  path.moveTo(x + r * 0.22, y);
  path.quadraticCurveTo(x - r * 0.05, y - r * 0.13, x - r * 0.42, y + r * 0.02);
  path.quadraticCurveTo(x - r * 0.05, y + r * 0.1, x + r * 0.22, y);
  ctx.fillStyle = color;
  ctx.fill(path);
  if (tip) paintTip(ctx, path, tip, [[x - r * 0.42, y + r * 0.02, r * 0.16]]);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + r * 0.15, y - r * 0.02);
  ctx.quadraticCurveTo(x - r * 0.05, y - r * 0.08, x - r * 0.3, y);
  ctx.stroke();
}

/** Fendas branquiais (5 de cada lado). */
function drawGills(ctx: CanvasRenderingContext2D, s: Spine, r: number): void {
  ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
  ctx.lineWidth = Math.max(1.5, r * 0.025);
  ctx.lineCap = "round";
  for (let g = 0; g < 5; g++) {
    const t = 0.2 + g * 0.026;
    const i = t * SEGMENTS;
    const i0 = Math.floor(i);
    const x = s.xs[i0] - (i - i0) * (s.xs[i0] - s.xs[i0 + 1]);
    for (const side of [-1, 1]) {
      const y = s.ys[i0] + side * s.hw[i0] * 0.62;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x - r * 0.04, y + side * s.hw[i0] * 0.2, x, y + side * s.hw[i0] * 0.33);
      ctx.stroke();
    }
  }
}

function drawScars(ctx: CanvasRenderingContext2D, s: Spine, r: number): void {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = Math.max(2, r * 0.025);
  const marks = [
    [0.45, -0.5, 0.18],
    [0.5, -0.35, 0.14],
    [0.58, 0.45, 0.16],
  ];
  for (const [t, side, len] of marks) {
    const i = Math.round(t * SEGMENTS);
    const x = s.xs[i];
    const y = s.ys[i] + side * s.hw[i];
    ctx.beginPath();
    ctx.moveTo(x + r * len, y - r * 0.05);
    ctx.lineTo(x - r * len, y + r * 0.06);
    ctx.stroke();
  }
}

/** Espinhos brilhantes ao longo do dorso (MEGA). */
function drawSpikes(ctx: CanvasRenderingContext2D, s: Spine, r: number, time: number): void {
  const glow = 0.6 + 0.4 * Math.sin(time * 8);
  ctx.fillStyle = `rgba(255, 234, 0, ${glow})`;
  ctx.strokeStyle = "rgba(60, 0, 40, 0.6)";
  ctx.lineWidth = 2;
  for (let k = 0; k < 6; k++) {
    const i = Math.round((0.12 + k * 0.1) * SEGMENTS);
    if (Math.abs(i - Math.round(0.36 * SEGMENTS)) < 1) continue; // não cobre a dorsal
    const x = s.xs[i];
    const y = s.ys[i];
    const size = r * (0.12 - k * 0.01);
    ctx.beginPath();
    ctx.moveTo(x + size, y);
    ctx.lineTo(x - size * 0.6, y - size * 0.7);
    ctx.lineTo(x - size * 0.6, y + size * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  // Listras laterais luminosas.
  ctx.strokeStyle = `rgba(255, 64, 129, ${0.5 + glow * 0.4})`;
  ctx.lineWidth = r * 0.045;
  ctx.lineCap = "round";
  for (const t of [0.42, 0.52, 0.62]) {
    const i = Math.round(t * SEGMENTS);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s.xs[i] + r * 0.05, s.ys[i] + side * s.hw[i] * 0.35);
      ctx.lineTo(s.xs[i] - r * 0.08, s.ys[i] + side * s.hw[i] * 0.85);
      ctx.stroke();
    }
  }
}

function drawEyes(ctx: CanvasRenderingContext2D, s: Spine, r: number, mega: boolean, time: number): void {
  const i = Math.round(0.14 * SEGMENTS);
  const x = s.xs[i] + r * 0.02;
  const eyeR = Math.max(4, r * 0.075);
  for (const side of [-1, 1]) {
    const y = s.ys[i] + side * s.hw[i] * 0.72;
    if (mega) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, eyeR * 3);
      g.addColorStop(0, `rgba(255, 30, 30, ${0.7 + 0.3 * Math.sin(time * 10)})`);
      g.addColorStop(1, "rgba(255, 30, 30, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, eyeR * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = mega ? "#ff1744" : "#0b0f14";
    ctx.beginPath();
    ctx.ellipse(x, y, eyeR * 1.15, eyeR, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = mega ? "#ffea00" : "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(x + eyeR * 0.35, y - side * eyeR * 0.3, eyeR * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
  // Narinas.
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  const n = Math.round(0.05 * SEGMENTS);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s.xs[n], s.ys[n] + side * s.hw[n] * 0.5, r * 0.035, r * 0.015, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Cabeça em "T" do tubarão-martelo, com olhos nas pontas. */
function drawHammerHead(ctx: CanvasRenderingContext2D, s: Spine, r: number, color: string, dark: string): void {
  const i = Math.round(0.07 * SEGMENTS);
  const x = s.xs[i];
  const y = s.ys[i];
  const half = r * 0.85;
  const depth = r * 0.36;
  const path = new Path2D();
  path.moveTo(x + depth * 0.6, y - half * 0.2);
  path.quadraticCurveTo(x + depth * 0.9, y - half, x + depth * 0.1, y - half);
  path.quadraticCurveTo(x - depth * 0.8, y - half * 0.95, x - depth * 0.7, y - half * 0.35);
  path.lineTo(x - depth * 0.7, y + half * 0.35);
  path.quadraticCurveTo(x - depth * 0.8, y + half * 0.95, x + depth * 0.1, y + half);
  path.quadraticCurveTo(x + depth * 0.9, y + half, x + depth * 0.6, y + half * 0.2);
  path.quadraticCurveTo(x + depth * 1.1, y, x + depth * 0.6, y - half * 0.2);
  path.closePath();
  const grad = ctx.createLinearGradient(x, y - half, x, y + half);
  grad.addColorStop(0, color);
  grad.addColorStop(0.5, dark);
  grad.addColorStop(1, color);
  ctx.fillStyle = grad;
  ctx.fill(path);
  ctx.lineWidth = Math.max(2.5, r * 0.05);
  ctx.strokeStyle = OUTLINE;
  ctx.stroke(path);
  const eyeR = Math.max(4, r * 0.08);
  for (const side of [-1, 1]) {
    const ey = y + side * (half - eyeR * 1.4);
    ctx.fillStyle = "#0b0f14";
    ctx.beginPath();
    ctx.arc(x, ey, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(x + eyeR * 0.35, ey - side * eyeR * 0.3, eyeR * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
}
