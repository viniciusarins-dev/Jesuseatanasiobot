import type { GameConfig, SharkType } from "../config/gameConfig";

export interface DifficultyParams {
  level: number;
  speedMultiplier: number;
  spawnInterval: number;
  maxAlive: number;
  /** Tipos que nascem naturalmente neste nível (o MEGA nunca nasce sozinho). */
  types: Exclude<SharkType, "mega">[];
}

/** Função pura: dificuldade a partir do tempo sobrevivido. */
export function difficultyFor(survivalTime: number, cfg: GameConfig["difficulty"]): DifficultyParams {
  const level = Math.min(cfg.maxLevel, 1 + Math.floor(Math.max(0, survivalTime) / cfg.levelDuration));
  const steps = level - 1;
  const types = (Object.keys(cfg.unlockLevel) as Exclude<SharkType, "mega">[]).filter(
    (t) => level >= cfg.unlockLevel[t],
  );
  return {
    level,
    speedMultiplier: 1 + steps * cfg.speedIncreasePerLevel,
    spawnInterval: Math.max(cfg.minSpawnInterval, cfg.baseSpawnInterval * cfg.spawnIntervalFactorPerLevel ** steps),
    maxAlive: Math.min(cfg.maxAliveCap, cfg.baseMaxAlive + steps * cfg.maxAliveIncreasePerLevel),
    types,
  };
}
