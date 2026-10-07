import type { GameConfig } from "../config/gameConfig";
import type { Shark } from "../entities/Shark";
import type { GameState } from "../game/GameState";
import { distSq } from "../utils/math";

export interface ProjectileHit {
  shark: Shark;
  damage: number;
  x: number;
  y: number;
  killed: boolean;
}

export interface PlayerHit {
  shark: Shark;
  /** 0 quando bloqueado por escudo/invulnerabilidade. */
  damage: number;
}

export interface CollisionEvents {
  projectileHits: ProjectileHit[];
  playerHits: PlayerHit[];
}

/** Resolve colisões, aplica dano e devolve os eventos para efeitos/pontuação. */
export function resolveCollisions(state: GameState, behavior: GameConfig["sharkBehavior"]): CollisionEvents {
  const events: CollisionEvents = { projectileHits: [], playerHits: [] };
  const { player } = state;

  for (const projectile of state.projectiles) {
    if (projectile.dead) continue;
    for (const shark of state.sharks) {
      if (shark.dead) continue;
      const r = projectile.radius + shark.radius;
      if (distSq(projectile.x, projectile.y, shark.x, shark.y) > r * r) continue;
      const speed = Math.hypot(projectile.vx, projectile.vy) || 1;
      const killed = shark.hit(
        projectile.damage,
        (projectile.vx / speed) * behavior.knockbackOnHit,
        (projectile.vy / speed) * behavior.knockbackOnHit,
      );
      projectile.dead = true;
      events.projectileHits.push({ shark, damage: projectile.damage, x: projectile.x, y: projectile.y, killed });
      break;
    }
  }

  if (player.alive) {
    for (const shark of state.sharks) {
      if (shark.dead || shark.biteCooldown > 0) continue;
      const r = player.radius + shark.radius;
      if (distSq(player.x, player.y, shark.x, shark.y) > r * r) continue;
      const damage = player.takeDamage(shark.damage);
      shark.biteCooldown = behavior.biteCooldown;
      const dx = shark.x - player.x;
      const dy = shark.y - player.y;
      const len = Math.hypot(dx, dy) || 1;
      shark.knockX += (dx / len) * behavior.knockbackOnBite;
      shark.knockY += (dy / len) * behavior.knockbackOnBite;
      if (shark.type === "small" && behavior.smallDiesOnBite) shark.dead = true;
      events.playerHits.push({ shark, damage });
    }
  }
  return events;
}
