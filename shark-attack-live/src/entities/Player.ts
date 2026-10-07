import type { GameConfig } from "../config/gameConfig";
import { clamp } from "../utils/math";
import type { Shark } from "./Shark";

export class Player {
  readonly radius: number;
  readonly maxHealth: number;
  health: number;
  fireTimer = 0;
  invulnerableTimer = 0;
  shieldTimer = 0;
  hitFlash = 0;
  healFlash = 0;
  facing = -Math.PI / 2;
  time = 0;

  constructor(
    private readonly cfg: GameConfig["player"],
    public x: number,
    public y: number,
    private readonly homeX: number,
    private readonly homeY: number,
  ) {
    this.radius = cfg.radius;
    this.maxHealth = cfg.maxHealth;
    this.health = cfg.maxHealth;
  }

  get alive(): boolean {
    return this.health > 0;
  }

  get shielded(): boolean {
    return this.shieldTimer > 0;
  }

  /** Retorna o dano efetivamente aplicado (0 se escudo/invulnerável). */
  takeDamage(amount: number): number {
    if (!this.alive || this.shielded || this.invulnerableTimer > 0) return 0;
    const applied = Math.min(this.health, amount);
    this.health -= applied;
    this.invulnerableTimer = this.cfg.invulnerableAfterHit;
    this.hitFlash = 0.25;
    return applied;
  }

  heal(amount: number): number {
    if (!this.alive) return 0;
    const applied = Math.min(this.maxHealth - this.health, amount);
    this.health += applied;
    if (applied > 0) this.healFlash = 0.6;
    return applied;
  }

  addShield(seconds: number): void {
    if (this.alive) this.shieldTimer = Math.max(this.shieldTimer, seconds);
  }

  /**
   * Movimento automático: fica perto do centro e desvia do tubarão mais
   * próximo, sem nunca sair do raio `leashRadius`.
   */
  update(dt: number, sharks: readonly Shark[]): void {
    this.time += dt;
    this.fireTimer = Math.max(0, this.fireTimer - dt);
    this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dt);
    this.shieldTimer = Math.max(0, this.shieldTimer - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.healFlash = Math.max(0, this.healFlash - dt);
    if (!this.alive) return;

    let targetX = this.homeX;
    let targetY = this.homeY;
    let nearest: Shark | null = null;
    let nearestDist = this.cfg.dodgeRange;
    for (const shark of sharks) {
      if (shark.dead) continue;
      const d = Math.hypot(shark.x - this.x, shark.y - this.y) - shark.radius;
      if (d < nearestDist) {
        nearestDist = d;
        nearest = shark;
      }
    }
    if (nearest) {
      const awayX = this.x - nearest.x;
      const awayY = this.y - nearest.y;
      const len = Math.hypot(awayX, awayY) || 1;
      targetX = this.x + (awayX / len) * this.cfg.leashRadius;
      targetY = this.y + (awayY / len) * this.cfg.leashRadius;
    }
    // Limita o alvo ao raio em torno do centro.
    const offX = targetX - this.homeX;
    const offY = targetY - this.homeY;
    const offLen = Math.hypot(offX, offY);
    if (offLen > this.cfg.leashRadius) {
      targetX = this.homeX + (offX / offLen) * this.cfg.leashRadius;
      targetY = this.homeY + (offY / offLen) * this.cfg.leashRadius;
    }
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const d = Math.hypot(dx, dy);
    if (d > 1) {
      const step = Math.min(d, this.cfg.speed * dt);
      this.x += (dx / d) * step;
      this.y += (dy / d) * step;
    }
    this.x = clamp(this.x, this.homeX - this.cfg.leashRadius, this.homeX + this.cfg.leashRadius);
    this.y = clamp(this.y, this.homeY - this.cfg.leashRadius, this.homeY + this.cfg.leashRadius);
  }
}
