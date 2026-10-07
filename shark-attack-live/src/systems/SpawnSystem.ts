import type { GameConfig, SharkType } from "../config/gameConfig";
import { MegaShark } from "../entities/MegaShark";
import { Shark } from "../entities/Shark";
import { pickWeighted, randRange, type Rng } from "../utils/math";
import type { DifficultyParams } from "./DifficultySystem";

interface SpawnRequest {
  type: SharkType;
  owner?: string;
}

/**
 * Nascimento de tubarões:
 * - naturais: pelo ritmo da dificuldade, até `maxAlive`;
 * - de eventos: entram numa fila e nascem a `queueSpawnPerSecond`, para que um
 *   pico de presentes não derrube a performance. `hardCap` nunca é excedido
 *   (exceto pelo MEGA, que é único e tem prioridade).
 */
export class SpawnSystem {
  private naturalTimer = 0;
  private queueBudget = 0;
  private readonly queue: SpawnRequest[] = [];

  constructor(
    private readonly cfg: GameConfig,
    private readonly rng: Rng = Math.random,
  ) {}

  get queuedCount(): number {
    return this.queue.length;
  }

  /** Retorna quantos pedidos foram aceitos (a fila tem limite). */
  enqueue(type: SharkType, count: number, owner?: string): number {
    let accepted = 0;
    for (let i = 0; i < count; i++) {
      if (type === "mega") {
        this.queue.unshift({ type, owner });
      } else {
        if (this.queue.length >= this.cfg.spawn.maxQueue) break;
        this.queue.push({ type, owner });
      }
      accepted++;
    }
    return accepted;
  }

  reset(): void {
    this.naturalTimer = 0;
    this.queueBudget = 0;
  }

  update(dt: number, sharks: readonly Shark[], difficulty: DifficultyParams): Shark[] {
    const spawned: Shark[] = [];
    let alive = sharks.filter((s) => !s.dead).length;

    this.naturalTimer -= dt;
    if (this.naturalTimer <= 0) {
      this.naturalTimer = difficulty.spawnInterval;
      const natural = sharks.filter((s) => !s.dead && !s.owner && !s.isMega).length;
      if (natural < difficulty.maxAlive && alive < this.cfg.spawn.hardCap) {
        const weights = Object.fromEntries(difficulty.types.map((t) => [t, this.cfg.spawn.weights[t]]));
        const type = pickWeighted<Exclude<SharkType, "mega">>(weights, this.rng);
        if (type) {
          spawned.push(this.create(type));
          alive++;
        }
      }
    }

    this.queueBudget = Math.min(this.queueBudget + this.cfg.spawn.queueSpawnPerSecond * dt, this.cfg.spawn.queueSpawnPerSecond);
    while (this.queue.length > 0 && this.queueBudget >= 1) {
      const next = this.queue[0];
      if (next.type !== "mega" && alive >= this.cfg.spawn.hardCap) break;
      this.queue.shift();
      this.queueBudget -= 1;
      spawned.push(this.create(next.type, next.owner));
      alive++;
    }
    return spawned;
  }

  private create(type: SharkType, owner?: string): Shark {
    const stats = this.cfg.sharks[type];
    const { x, y } = this.edgePosition(stats.radius);
    return type === "mega"
      ? new MegaShark(this.cfg.megaShark, this.cfg.sharks.mega, x, y, owner)
      : new Shark(type, stats, x, y, owner);
  }

  /** Posição fora da tela, numa borda aleatória da arena. */
  private edgePosition(radius: number): { x: number; y: number } {
    const { width } = this.cfg.canvas;
    const { top, bottom, spawnMargin } = this.cfg.arena;
    const off = radius + spawnMargin;
    switch (Math.floor(this.rng() * 4)) {
      case 0:
        return { x: randRange(0, width, this.rng), y: top - off };
      case 1:
        return { x: randRange(0, width, this.rng), y: bottom + off };
      case 2:
        return { x: -off, y: randRange(top, bottom, this.rng) };
      default:
        return { x: width + off, y: randRange(top, bottom, this.rng) };
    }
  }
}
