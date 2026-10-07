import type { SharkStats, SharkType } from "../config/gameConfig";

let nextSharkId = 1;

export class Shark {
  readonly id = nextSharkId++;
  readonly radius: number;
  readonly maxHealth: number;
  readonly damage: number;
  readonly scoreValue: number;
  readonly baseSpeed: number;
  readonly bodyColor: string;
  readonly bellyColor: string;
  health: number;
  angle = 0;
  /** Velocidade extra de empurrão (decai com o tempo). */
  knockX = 0;
  knockY = 0;
  hitFlash = 0;
  biteCooldown = 0;
  /** 0 = boca fechada, 1 = escancarada (só visual). */
  mouthOpen = 0;
  /** Tempo restante da animação de mordida. */
  biteAnim = 0;
  age = 0;
  dead = false;
  readonly wobblePhase = Math.random() * Math.PI * 2;

  constructor(
    readonly type: SharkType,
    stats: SharkStats,
    public x: number,
    public y: number,
    /** Nome de quem invocou (presente/curtidas). Sem dono = tubarão natural. */
    readonly owner?: string,
  ) {
    this.radius = stats.radius;
    this.maxHealth = stats.health;
    this.health = stats.health;
    this.damage = stats.damage;
    this.scoreValue = stats.score;
    this.baseSpeed = stats.speed;
    this.bodyColor = stats.bodyColor;
    this.bellyColor = stats.bellyColor;
  }

  get isMega(): boolean {
    return this.type === "mega";
  }

  /** Velocidade atual (sobrescrito pelo MegaShark durante a investida). */
  protected currentSpeed(speedMultiplier: number): number {
    return this.baseSpeed * speedMultiplier;
  }

  update(
    dt: number,
    targetX: number,
    targetY: number,
    speedMultiplier: number,
    knockbackDecay: number,
    mouthOpenRange = 3,
  ): void {
    this.age += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.biteCooldown = Math.max(0, this.biteCooldown - dt);

    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const len = Math.hypot(dx, dy) || 1;
    // Leve zigue-zague para parecer nado, perpendicular à direção do alvo.
    const wobble = Math.sin(this.age * 3 + this.wobblePhase) * 0.35;
    const dirX = dx / len - (dy / len) * wobble;
    const dirY = dy / len + (dx / len) * wobble;
    const speed = this.currentSpeed(speedMultiplier);

    this.x += (dirX * speed + this.knockX) * dt;
    this.y += (dirY * speed + this.knockY) * dt;
    const decay = Math.exp(-knockbackDecay * dt);
    this.knockX *= decay;
    this.knockY *= decay;
    this.angle = Math.atan2(dirY, dirX);

    // Boca: entreabre perto do alvo, escancara durante a mordida.
    this.biteAnim = Math.max(0, this.biteAnim - dt);
    const near = len < this.radius * mouthOpenRange ? 0.55 : 0;
    const target = this.biteAnim > 0 ? 1 : near;
    this.mouthOpen += (target - this.mouthOpen) * Math.min(1, dt * 12);
  }

  /** Aplica dano; retorna true se morreu agora. */
  hit(damage: number, knockX = 0, knockY = 0): boolean {
    if (this.dead) return false;
    this.health -= damage;
    this.hitFlash = 0.12;
    this.knockX += knockX;
    this.knockY += knockY;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      return true;
    }
    return false;
  }
}
