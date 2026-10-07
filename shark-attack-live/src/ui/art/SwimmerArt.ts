import type { Player } from "../../entities/Player";

/**
 * Mergulhador visto de cima, desenhado proceduralmente:
 * nadadeiras batendo (pernada alternada), roupa de neoprene, cilindro nas
 * costas, braços segurando o arpão, máscara, snorkel e bolhas.
 * O corpo aponta para `player.bodyAngle` (frente = +x no espaço local).
 */

const COLORS = {
  suit: "#1d3b5c",
  suitLight: "#3f6b94",
  stripe: "#ff6d00",
  skin: "#f1c27d",
  hair: "#4e342e",
  flipper: "#ffca28",
  flipperDark: "#f57f17",
  tank: "#ffd54f",
  tankDark: "#f9a825",
  metal: "#90a4ae",
  gun: "#37474f",
  glass: "#4dd0e1",
  outline: "rgba(0, 18, 38, 0.7)",
  /** Contorno claro externo: destaca a silhueta sobre o fundo azul. */
  rim: "rgba(210, 245, 255, 0.75)",
};

/** Escala do desenho em relação ao raio de colisão. */
const SCALE = 1.25;

export function drawSwimmer(ctx: CanvasRenderingContext2D, player: Player): void {
  const r = player.radius * SCALE;
  const t = player.time;
  // Pernada mais rápida quando está se deslocando.
  const kickSpeed = 9 + Math.min(10, player.swimSpeed / 25);
  const kick = Math.sin(t * kickSpeed);
  const breathe = 1 + Math.sin(t * 2) * 0.015;

  drawSpotlight(ctx, player);
  drawSnorkelBubbles(ctx, player, r, t);

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.bodyAngle);
  ctx.scale(breathe, breathe);

  // Sombra no fundo.
  ctx.save();
  ctx.rotate(-player.bodyAngle);
  ctx.translate(r * 0.2, r * 0.4);
  ctx.rotate(player.bodyAngle);
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = "#001020";
  ctx.beginPath();
  ctx.ellipse(-r * 0.4, 0, r * 1.7, r * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawRim(ctx, r, kick);
  for (const side of [-1, 1]) drawLeg(ctx, r, side, kick * side);
  drawTorso(ctx, r);
  drawTank(ctx, r);
  drawArmsAndGun(ctx, r, player.fireTimer <= 0.08);
  drawHead(ctx, r);

  ctx.restore();
  drawStatusEffects(ctx, player);
}

function drawSpotlight(ctx: CanvasRenderingContext2D, player: Player): void {
  const r = player.radius;
  const halo = ctx.createRadialGradient(player.x, player.y, r * 0.3, player.x, player.y, r * 3);
  halo.addColorStop(0, "rgba(255, 236, 150, 0.32)");
  halo.addColorStop(1, "rgba(255, 236, 150, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(player.x, player.y, r * 3, 0, Math.PI * 2);
  ctx.fill();
}

/** Silhueta clara e grossa por trás do corpo (legibilidade na transmissão). */
function drawRim(ctx: CanvasRenderingContext2D, r: number, kick: number): void {
  ctx.save();
  ctx.strokeStyle = COLORS.rim;
  ctx.fillStyle = COLORS.rim;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const pad = r * 0.12;
  for (const side of [-1, 1]) {
    const k = kick * side;
    ctx.lineWidth = r * 0.27 + pad * 2;
    strokePolyline(ctx, [legPoints(r, side, k).hip, legPoints(r, side, k).knee, legPoints(r, side, k).ankle]);
    ctx.lineWidth = r * 0.2 + pad * 2;
    strokePolyline(ctx, armPoints(r, side));
  }
  ctx.beginPath();
  ctx.ellipse(-r * 0.05, 0, r * 0.66 + pad, r * 0.44 + pad, 0, 0, Math.PI * 2);
  ctx.arc(r * 0.62, 0, r * 0.28 + pad, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function legPoints(r: number, side: number, k: number) {
  return {
    hip: [-r * 0.5, side * r * 0.24],
    knee: [-r * 1.0, side * r * 0.33 + k * r * 0.06],
    ankle: [-r * 1.45, side * r * 0.36 + k * r * 0.16],
  };
}

function armPoints(r: number, side: number): number[][] {
  return [
    [r * 0.3, side * r * 0.38],
    [r * 0.72, side * r * 0.36],
    [r * 1.05, side * r * 0.1],
  ];
}

function drawLeg(ctx: CanvasRenderingContext2D, r: number, side: number, k: number): void {
  const { hip, knee, ankle } = legPoints(r, side, k);

  // Nadadeira (pé de pato) — segue a direção da canela + batida.
  const angle = Math.atan2(ankle[1] - knee[1], ankle[0] - knee[0]) + k * 0.35;
  ctx.save();
  ctx.translate(ankle[0], ankle[1]);
  ctx.rotate(angle);
  const fin = new Path2D();
  fin.moveTo(0, -r * 0.1);
  fin.lineTo(r * 0.85, -r * 0.22);
  fin.quadraticCurveTo(r * 0.92, 0, r * 0.85, r * 0.22);
  fin.lineTo(0, r * 0.1);
  fin.closePath();
  const g = ctx.createLinearGradient(0, 0, r * 0.9, 0);
  g.addColorStop(0, COLORS.flipperDark);
  g.addColorStop(1, COLORS.flipper);
  ctx.fillStyle = g;
  ctx.fill(fin);
  ctx.strokeStyle = COLORS.outline;
  ctx.lineWidth = 3;
  ctx.stroke(fin);
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 2;
  for (const y of [-0.1, 0.1]) {
    ctx.beginPath();
    ctx.moveTo(r * 0.15, y * r * 0.6);
    ctx.lineTo(r * 0.78, y * r * 1.8);
    ctx.stroke();
  }
  ctx.restore();

  // Perna.
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = COLORS.outline;
  ctx.lineWidth = r * 0.34;
  strokePolyline(ctx, [hip, knee, ankle]);
  ctx.strokeStyle = COLORS.suit;
  ctx.lineWidth = r * 0.27;
  strokePolyline(ctx, [hip, knee, ankle]);
}

function drawTorso(ctx: CanvasRenderingContext2D, r: number): void {
  const torso = new Path2D();
  torso.ellipse(-r * 0.05, 0, r * 0.66, r * 0.44, 0, 0, Math.PI * 2);
  const g = ctx.createLinearGradient(0, -r * 0.44, 0, r * 0.44);
  g.addColorStop(0, COLORS.suitLight);
  g.addColorStop(0.5, COLORS.suit);
  g.addColorStop(1, COLORS.suitLight);
  ctx.fillStyle = g;
  ctx.fill(torso);
  ctx.strokeStyle = COLORS.outline;
  ctx.lineWidth = 3;
  ctx.stroke(torso);
  // Faixas laranja nas laterais da roupa.
  ctx.save();
  ctx.clip(torso);
  ctx.fillStyle = COLORS.stripe;
  ctx.fillRect(-r * 0.7, -r * 0.44, r * 1.3, r * 0.08);
  ctx.fillRect(-r * 0.7, r * 0.36, r * 1.3, r * 0.08);
  ctx.restore();
}

function drawTank(ctx: CanvasRenderingContext2D, r: number): void {
  // Alças.
  ctx.strokeStyle = "#111";
  ctx.lineWidth = r * 0.07;
  for (const x of [-r * 0.3, r * 0.12]) {
    ctx.beginPath();
    ctx.moveTo(x, -r * 0.42);
    ctx.lineTo(x, r * 0.42);
    ctx.stroke();
  }
  // Cilindro.
  const tank = new Path2D();
  roundedRect(tank, -r * 0.62, -r * 0.17, r * 0.85, r * 0.34, r * 0.17);
  const g = ctx.createLinearGradient(0, -r * 0.17, 0, r * 0.17);
  g.addColorStop(0, COLORS.tank);
  g.addColorStop(0.35, "#fff3c4");
  g.addColorStop(1, COLORS.tankDark);
  ctx.fillStyle = g;
  ctx.fill(tank);
  ctx.strokeStyle = COLORS.outline;
  ctx.lineWidth = 3;
  ctx.stroke(tank);
  // Válvula.
  ctx.fillStyle = COLORS.metal;
  ctx.beginPath();
  ctx.arc(r * 0.27, 0, r * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawArmsAndGun(ctx: CanvasRenderingContext2D, r: number, loaded: boolean): void {
  // Arpão (por baixo das mãos).
  const gun = new Path2D();
  roundedRect(gun, r * 0.8, -r * 0.08, r * 1.15, r * 0.16, r * 0.06);
  ctx.fillStyle = COLORS.gun;
  ctx.fill(gun);
  ctx.strokeStyle = COLORS.outline;
  ctx.lineWidth = 2.5;
  ctx.stroke(gun);
  // Elásticos.
  ctx.strokeStyle = COLORS.stripe;
  ctx.lineWidth = r * 0.05;
  ctx.beginPath();
  ctx.moveTo(r * 1.85, -r * 0.1);
  ctx.quadraticCurveTo(r * 1.45, -r * 0.18, r * 1.25, -r * 0.05);
  ctx.moveTo(r * 1.85, r * 0.1);
  ctx.quadraticCurveTo(r * 1.45, r * 0.18, r * 1.25, r * 0.05);
  ctx.stroke();
  if (loaded) {
    ctx.strokeStyle = "#eceff1";
    ctx.lineWidth = r * 0.05;
    ctx.beginPath();
    ctx.moveTo(r * 1.0, 0);
    ctx.lineTo(r * 2.3, 0);
    ctx.stroke();
    ctx.fillStyle = "#eceff1";
    ctx.beginPath();
    ctx.moveTo(r * 2.45, 0);
    ctx.lineTo(r * 2.25, -r * 0.08);
    ctx.lineTo(r * 2.25, r * 0.08);
    ctx.closePath();
    ctx.fill();
  }

  // Braços: ombro → cotovelo → mão no arpão.
  for (const side of [-1, 1]) {
    const [shoulder, elbow, hand] = armPoints(r, side);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = r * 0.27;
    strokePolyline(ctx, [shoulder, elbow, hand]);
    ctx.strokeStyle = COLORS.suit;
    ctx.lineWidth = r * 0.2;
    strokePolyline(ctx, [shoulder, elbow, hand]);
    // Luva.
    ctx.fillStyle = "#212121";
    ctx.beginPath();
    ctx.arc(hand[0], hand[1], r * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHead(ctx: CanvasRenderingContext2D, r: number): void {
  const hx = r * 0.62;
  const hr = r * 0.28;
  // Pescoço/pele.
  ctx.fillStyle = COLORS.skin;
  ctx.beginPath();
  ctx.arc(hx - hr * 0.6, 0, hr * 0.55, 0, Math.PI * 2);
  ctx.fill();
  // Cabelo (topo da cabeça visto de cima).
  const head = new Path2D();
  head.arc(hx, 0, hr, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(hx - hr * 0.3, -hr * 0.3, hr * 0.1, hx, 0, hr);
  g.addColorStop(0, "#795548");
  g.addColorStop(1, COLORS.hair);
  ctx.fillStyle = g;
  ctx.fill(head);
  ctx.strokeStyle = COLORS.outline;
  ctx.lineWidth = 3;
  ctx.stroke(head);
  // Alça da máscara.
  ctx.strokeStyle = "#111";
  ctx.lineWidth = r * 0.06;
  ctx.beginPath();
  ctx.ellipse(hx, 0, hr * 0.55, hr * 1.02, 0, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  // Visor da máscara (na frente do rosto).
  const mask = new Path2D();
  roundedRect(mask, hx + hr * 0.55, -hr * 0.75, hr * 0.5, hr * 1.5, hr * 0.25);
  ctx.fillStyle = COLORS.glass;
  ctx.fill(mask);
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 3;
  ctx.stroke(mask);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillRect(hx + hr * 0.75, -hr * 0.6, hr * 0.12, hr * 0.5);
  // Snorkel.
  ctx.strokeStyle = COLORS.stripe;
  ctx.lineWidth = r * 0.08;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(hx + hr * 0.5, -hr * 0.85);
  ctx.quadraticCurveTo(hx, -hr * 1.35, hx - hr * 0.9, -hr * 1.2);
  ctx.stroke();
}

/** Bolhas saindo do snorkel e subindo (espaço do mundo). */
function drawSnorkelBubbles(ctx: CanvasRenderingContext2D, player: Player, r: number, t: number): void {
  const cos = Math.cos(player.bodyAngle);
  const sin = Math.sin(player.bodyAngle);
  const lx = r * 0.36;
  const ly = -r * 0.34;
  const sx = player.x + lx * cos - ly * sin;
  const sy = player.y + lx * sin + ly * cos;
  ctx.strokeStyle = "rgba(220, 245, 255, 0.8)";
  ctx.fillStyle = "rgba(220, 245, 255, 0.25)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const k = (t * 0.7 + i / 4) % 1;
    ctx.globalAlpha = 1 - k;
    ctx.beginPath();
    ctx.arc(sx + Math.sin((k + i) * 9) * 10, sy - k * 110, 4 + k * 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawStatusEffects(ctx: CanvasRenderingContext2D, player: Player): void {
  const r = player.radius;
  ctx.save();
  ctx.translate(player.x, player.y);
  if (player.hitFlash > 0) {
    const a = Math.min(1, player.hitFlash * 3);
    const g = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 2.2);
    g.addColorStop(0, `rgba(255, 23, 68, ${0.55 * a})`);
    g.addColorStop(1, "rgba(255, 23, 68, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (player.healFlash > 0) {
    ctx.globalAlpha = player.healFlash;
    ctx.strokeStyle = "#69f0ae";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (player.shielded) {
    const pulse = 0.6 + 0.4 * Math.sin(player.time * 10);
    const g = ctx.createRadialGradient(-r * 0.8, -r * 0.8, r * 0.2, 0, 0, r * 3);
    g.addColorStop(0, "rgba(255, 255, 255, 0.25)");
    g.addColorStop(0.7, "rgba(100, 220, 255, 0.12)");
    g.addColorStop(1, "rgba(100, 220, 255, 0.3)");
    ctx.fillStyle = g;
    ctx.strokeStyle = `rgba(120, 230, 255, ${pulse})`;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(0, 0, r * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Reflexo da bolha.
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.65, Math.PI * 1.1, Math.PI * 1.45);
    ctx.stroke();
  }
  ctx.restore();
}

function strokePolyline(ctx: CanvasRenderingContext2D, pts: number[][]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}

function roundedRect(path: Path2D, x: number, y: number, w: number, h: number, rad: number): void {
  const k = Math.min(rad, w / 2, h / 2);
  path.moveTo(x + k, y);
  path.arcTo(x + w, y, x + w, y + h, k);
  path.arcTo(x + w, y + h, x, y + h, k);
  path.arcTo(x, y + h, x, y, k);
  path.arcTo(x, y, x + w, y, k);
  path.closePath();
}
