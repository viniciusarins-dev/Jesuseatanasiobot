import type { GameConfig } from "../config/gameConfig";
import { Projectile } from "../entities/Projectile";
import type { Player } from "../entities/Player";
import type { Shark } from "../entities/Shark";

/** Disparo automático do jogador e o ataque em círculo (comando ATAQUE). */
export class CombatSystem {
  constructor(private readonly cfg: GameConfig["player"]) {}

  /** Mira no tubarão vivo mais próximo dentro do alcance. */
  autoFire(player: Player, sharks: readonly Shark[]): Projectile | null {
    if (!player.alive || player.fireTimer > 0) return null;
    let target: Shark | null = null;
    let best = this.cfg.range * this.cfg.range;
    for (const shark of sharks) {
      if (shark.dead) continue;
      const d = (shark.x - player.x) ** 2 + (shark.y - player.y) ** 2;
      if (d < best) {
        best = d;
        target = shark;
      }
    }
    if (!target) return null;
    player.fireTimer = this.cfg.fireInterval;
    const angle = Math.atan2(target.y - player.y, target.x - player.x);
    player.facing = angle;
    return this.projectile(player, angle, this.cfg.projectileDamage, false);
  }

  burst(player: Player): Projectile[] {
    if (!player.alive) return [];
    const shots: Projectile[] = [];
    for (let i = 0; i < this.cfg.burstProjectiles; i++) {
      const angle = (i / this.cfg.burstProjectiles) * Math.PI * 2;
      shots.push(this.projectile(player, angle, this.cfg.burstDamage, true));
    }
    return shots;
  }

  private projectile(player: Player, angle: number, damage: number, special: boolean): Projectile {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new Projectile(
      player.x + cos * player.radius,
      player.y + sin * player.radius,
      cos * this.cfg.projectileSpeed,
      sin * this.cfg.projectileSpeed,
      damage,
      this.cfg.projectileRadius,
      this.cfg.projectileLife,
      special,
    );
  }
}
