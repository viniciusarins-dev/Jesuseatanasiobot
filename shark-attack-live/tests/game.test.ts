import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../src/config/gameConfig";
import { LIVE_CONFIG } from "../src/config/liveConfig";
import { Game } from "../src/game/Game";
import { InMemoryLeaderboardStore } from "../src/store/LeaderboardStore";
import { seededRng, silentAudio } from "./helpers";

const DT = GAME_CONFIG.loop.fixedStep;
const newGame = () => new Game(GAME_CONFIG, LIVE_CONFIG, silentAudio, new InMemoryLeaderboardStore(), seededRng(7));
const run = (game: Game, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) game.update(DT);
};

describe("Game (simulação sem navegador)", () => {
  it("roda vários minutos sem erro e com dificuldade crescente", () => {
    const game = newGame();
    run(game, 90);
    expect(game.state.roundNumber + game.difficulty.level).toBeGreaterThan(1);
    expect(game.state.sharks.length).toBeLessThanOrEqual(GAME_CONFIG.spawn.hardCap);
    expect(Number.isFinite(game.state.round.score)).toBe(true);
  });

  it("jogador abate tubarões automaticamente", () => {
    const game = newGame();
    run(game, 20);
    expect(game.state.round.kills + (game.state.lastRound?.kills ?? 0)).toBeGreaterThan(0);
  });

  it("presentes viram tubarões com o nome de quem enviou", () => {
    const game = newGame();
    game.spawnSharks("mega", 1, "Ana");
    game.spawnSharks("small", 3, "João");
    run(game, 1);
    const owners = game.state.sharks.filter((s) => s.owner).map((s) => `${s.type}:${s.owner}`);
    expect(owners).toContain("mega:Ana");
    expect(owners.filter((o) => o === "small:João")).toHaveLength(3);
  });

  it("game over mostra resultado e reinicia sozinho, mantendo stats da LIVE", () => {
    const game = newGame();
    game.addLiveStats({ followers: 3, likes: 500, gifts: 2 });
    run(game, 5);
    game.debugKillPlayer();
    run(game, DT);
    expect(game.state.phase).toBe("gameover");
    expect(game.state.lastRound?.survivalTime).toBeGreaterThan(4);
    const round = game.state.roundNumber;
    run(game, GAME_CONFIG.gameOver.restartDelaySeconds + 0.1);
    expect(game.state.phase).toBe("playing");
    expect(game.state.roundNumber).toBe(round + 1);
    expect(game.state.round.score).toBeLessThan(100);
    expect(game.state.live).toEqual({ followers: 3, likes: 500, gifts: 2 });
  });

  it("ações do público durante o game over não quebram nada", () => {
    const game = newGame();
    game.debugKillPlayer();
    run(game, DT);
    game.healPlayer(10);
    game.shieldPlayer(2);
    game.playerBurst("x");
    game.addSpecialScore(500);
    expect(game.state.projectiles).toHaveLength(0);
  });

  it("ATAQUE dispara arpões em círculo e cura não passa do máximo", () => {
    const game = newGame();
    game.playerBurst("Pedro");
    expect(game.state.projectiles).toHaveLength(GAME_CONFIG.player.burstProjectiles);
    game.healPlayer(1000);
    expect(game.state.player.health).toBe(GAME_CONFIG.player.maxHealth);
  });
});

describe("AlertBanner", () => {
  it("MEGA fura a fila e títulos repetidos não se acumulam", async () => {
    const { AlertBanner } = await import("../src/ui/AlertBanner");
    const banner = new AlertBanner(0, 0, 1000, 2);
    const internals = banner as unknown as { queue: { title: string }[]; current: { title: string; age: number } | null };
    banner.push("GIGANTE", "", "#fff");
    banner.update(0.01);
    banner.push("GIGANTE", "", "#fff");
    banner.push("GIGANTE", "", "#fff");
    expect(internals.queue).toHaveLength(0);
    banner.push("MEGA", "", "#f00", true);
    banner.update(0.2);
    expect(internals.current?.title).toBe("MEGA");
  });
});

describe("Quem derrotou o jogador", () => {
  it("registra o dono do tubarão da mordida final e limpa na nova rodada", async () => {
    const { Shark } = await import("../src/entities/Shark");
    const game = newGame();
    const { player } = game.state;
    player.health = 1;
    game.state.sharks.push(new Shark("giant", GAME_CONFIG.sharks.giant, player.x, player.y, "Maria"));
    game.update(DT);
    expect(game.state.phase).toBe("gameover");
    expect(game.state.lastKiller).toEqual({ type: "giant", owner: "Maria" });
    run(game, GAME_CONFIG.gameOver.restartDelaySeconds + 0.1);
    expect(game.state.lastKiller).toBeNull();
  });

  it("texto do game over destaca o espectador", async () => {
    const { killerText } = await import("../src/ui/GameOverScreen");
    expect(killerText({ type: "mega", owner: "Ana" })).toBe("🦈 Derrotado pelo tubarão de Ana!");
    expect(killerText({ type: "small", owner: "❤️" })).toBe("🦈 Derrotado pelo tubarão-de-recife das curtidas!");
    expect(killerText({ type: "giant" })).toBe("🦈 Derrotado por um tubarão-branco");
    expect(killerText(null)).toBeNull();
  });
});
