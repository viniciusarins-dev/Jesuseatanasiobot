import type { GameConfig, SharkType } from "../config/gameConfig";
import { Player } from "../entities/Player";
import type { Projectile } from "../entities/Projectile";
import type { Shark } from "../entities/Shark";

/** Estatísticas da rodada atual (zeram a cada reinício). */
export interface RoundStats {
  score: number;
  survivalTime: number;
  kills: number;
  damageTaken: number;
}

/** Estatísticas da LIVE (acumulam entre rodadas). */
export interface LiveStats {
  followers: number;
  likes: number;
  gifts: number;
}

export type GamePhase = "playing" | "gameover";

export interface GameState {
  phase: GamePhase;
  roundNumber: number;
  round: RoundStats;
  live: LiveStats;
  /** Curtidas acumuladas desde o último evento de "caos". */
  likesTowardChaos: number;
  player: Player;
  sharks: Shark[];
  projectiles: Projectile[];
  gameOverTimer: number;
  lastRound: RoundStats | null;
  /** Quem derrubou o jogador na última rodada (nome de quem invocou o tubarão). */
  lastKiller: { type: SharkType; owner?: string } | null;
  bestScore: number;
}

export function createRoundStats(): RoundStats {
  return { score: 0, survivalTime: 0, kills: 0, damageTaken: 0 };
}

export function arenaCenter(cfg: GameConfig): { x: number; y: number } {
  return { x: cfg.canvas.width / 2, y: (cfg.arena.top + cfg.arena.bottom) / 2 };
}

export function createPlayer(cfg: GameConfig): Player {
  const c = arenaCenter(cfg);
  return new Player(cfg.player, c.x, c.y, c.x, c.y);
}

export function createGameState(cfg: GameConfig): GameState {
  return {
    phase: "playing",
    roundNumber: 1,
    round: createRoundStats(),
    live: { followers: 0, likes: 0, gifts: 0 },
    likesTowardChaos: 0,
    player: createPlayer(cfg),
    sharks: [],
    projectiles: [],
    gameOverTimer: 0,
    lastRound: null,
    lastKiller: null,
    bestScore: 0,
  };
}
