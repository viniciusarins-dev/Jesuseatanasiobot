import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../src/config/gameConfig";
import { Shark } from "../src/entities/Shark";
import { Projectile } from "../src/entities/Projectile";
import { createGameState } from "../src/game/GameState";
import { resolveCollisions } from "../src/systems/CollisionSystem";
import { difficultyFor } from "../src/systems/DifficultySystem";
import { ScoreSystem } from "../src/systems/ScoreSystem";
import { SpawnSystem } from "../src/systems/SpawnSystem";
import { formatScore, formatTime } from "../src/utils/format";
import { seededRng } from "./helpers";

const cfg = GAME_CONFIG;

describe("DifficultySystem", () => {
  it("começa fácil e progride", () => {
    const d1 = difficultyFor(0, cfg.difficulty);
    expect(d1.level).toBe(1);
    expect(d1.types).toEqual(["small"]);
    const giantLevel = cfg.difficulty.unlockLevel.giant;
    const d4 = difficultyFor(cfg.difficulty.levelDuration * (giantLevel - 1), cfg.difficulty);
    expect(d4.level).toBe(giantLevel);
    expect(d4.types).toEqual(["small", "medium", "giant"]);
    expect(difficultyFor(cfg.difficulty.levelDuration * (giantLevel - 2), cfg.difficulty).types).not.toContain("giant");
    expect(d4.speedMultiplier).toBeGreaterThan(d1.speedMultiplier);
    expect(d4.spawnInterval).toBeLessThan(d1.spawnInterval);
    expect(d4.maxAlive).toBeGreaterThan(d1.maxAlive);
  });

  it("respeita os limites", () => {
    const d = difficultyFor(1e9, cfg.difficulty);
    expect(d.level).toBe(cfg.difficulty.maxLevel);
    expect(d.spawnInterval).toBeGreaterThanOrEqual(cfg.difficulty.minSpawnInterval);
    expect(d.maxAlive).toBeLessThanOrEqual(cfg.difficulty.maxAliveCap);
  });
});

describe("ScoreSystem", () => {
  it("soma tempo, abates e bônus", () => {
    const score = new ScoreSystem(cfg.score);
    const state = createGameState(cfg);
    for (let i = 0; i < 60; i++) score.tick(state.round, 1 / 60);
    expect(state.round.score).toBe(cfg.score.perSecondSurvived);
    expect(state.round.survivalTime).toBeCloseTo(1);
    score.addKill(state.round, new Shark("small", cfg.sharks.small, 0, 0));
    score.addSpecial(state.round, 500);
    expect(state.round.kills).toBe(1);
    expect(state.round.score).toBe(cfg.score.perSecondSurvived + cfg.sharks.small.score + 500);
  });
});

describe("SpawnSystem", () => {
  const easy = difficultyFor(0, cfg.difficulty);

  it("nasce fora da tela e respeita maxAlive natural", () => {
    const spawn = new SpawnSystem(cfg, seededRng());
    const sharks: Shark[] = [];
    for (let i = 0; i < 60 * 60; i++) sharks.push(...spawn.update(1 / 60, sharks, easy));
    expect(sharks.length).toBe(easy.maxAlive);
    for (const s of sharks) {
      const outside = s.x < 0 || s.x > cfg.canvas.width || s.y < cfg.arena.top || s.y > cfg.arena.bottom;
      expect(outside).toBe(true);
    }
  });

  it("fila de eventos: ritmo limitado, hardCap e MEGA com prioridade", () => {
    const spawn = new SpawnSystem(cfg, seededRng());
    spawn.enqueue("small", 500, "Spam");
    expect(spawn.queuedCount).toBe(cfg.spawn.maxQueue);
    spawn.enqueue("mega", 1, "Ana");
    const sharks: Shark[] = [];
    sharks.push(...spawn.update(1, sharks, { ...easy, maxAlive: 0 }));
    expect(sharks[0].isMega).toBe(true);
    expect(sharks.length).toBeLessThanOrEqual(cfg.spawn.queueSpawnPerSecond);
    for (let i = 0; i < 600; i++) sharks.push(...spawn.update(0.1, sharks, { ...easy, maxAlive: 0 }));
    expect(sharks.length).toBe(cfg.spawn.hardCap);
    expect(sharks.every((s) => s.owner)).toBe(true);
  });
});

describe("CollisionSystem", () => {
  it("projétil causa dano e abate", () => {
    const state = createGameState(cfg);
    const shark = new Shark("small", cfg.sharks.small, 200, 200);
    state.sharks.push(shark);
    state.projectiles.push(new Projectile(200, 200, 100, 0, 50, 10, 1));
    const events = resolveCollisions(state, cfg.sharkBehavior);
    expect(events.projectileHits).toHaveLength(1);
    expect(events.projectileHits[0].killed).toBe(true);
    expect(state.projectiles[0].dead).toBe(true);
  });

  it("mordida tira vida, respeita cooldown e escudo", () => {
    const state = createGameState(cfg);
    const { player } = state;
    const shark = new Shark("medium", cfg.sharks.medium, player.x, player.y);
    state.sharks.push(shark);
    let events = resolveCollisions(state, cfg.sharkBehavior);
    expect(events.playerHits[0].damage).toBe(cfg.sharks.medium.damage);
    expect(player.health).toBe(cfg.player.maxHealth - cfg.sharks.medium.damage);
    events = resolveCollisions(state, cfg.sharkBehavior);
    expect(events.playerHits).toHaveLength(0); // cooldown

    shark.biteCooldown = 0;
    player.invulnerableTimer = 0;
    player.addShield(2);
    events = resolveCollisions(state, cfg.sharkBehavior);
    expect(events.playerHits[0].damage).toBe(0);
  });

  it("tubarão pequeno some ao morder", () => {
    const state = createGameState(cfg);
    const shark = new Shark("small", cfg.sharks.small, state.player.x, state.player.y);
    state.sharks.push(shark);
    resolveCollisions(state, cfg.sharkBehavior);
    expect(shark.dead).toBe(true);
  });
});

it("formatação", () => {
  expect(formatScore(12450)).toBe("12.450");
  expect(formatTime(272)).toBe("04:32");
  expect(formatTime(3725)).toBe("1:02:05");
});
