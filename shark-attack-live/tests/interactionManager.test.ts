import { beforeEach, describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../src/config/gameConfig";
import { InteractionManager } from "../src/interactions/InteractionManager";
import { MockInteractionProvider } from "../src/interactions/MockInteractionProvider";
import { InMemoryLeaderboardStore } from "../src/store/LeaderboardStore";
import { RecordingActions } from "./helpers";

const cfg = GAME_CONFIG.interactions;
let actions: RecordingActions;
let store: InMemoryLeaderboardStore;
let manager: InteractionManager;
let mock: MockInteractionProvider;

beforeEach(() => {
  actions = new RecordingActions();
  store = new InMemoryLeaderboardStore();
  manager = new InteractionManager(actions, store, cfg);
  mock = new MockInteractionProvider({ maxUsernameLength: cfg.maxUsernameLength, maxGiftCount: cfg.maxGiftCount });
  mock.connect(manager);
});

const step = (dt = 1 / 60) => manager.process(dt);

describe("InteractionManager", () => {
  it("eventos ficam na fila até o loop processar", () => {
    mock.follow("João");
    expect(actions.feed).toHaveLength(0);
    step();
    expect(actions.feed).toEqual(["🔥 João entrou no jogo!"]);
  });

  it("seguidor: cura, escudo, contador e ranking", () => {
    mock.follow("João");
    step();
    expect(actions.heals).toEqual([cfg.followHeal]);
    expect(actions.shields).toEqual([cfg.followShieldSeconds]);
    expect(actions.stats.followers).toBe(1);
    expect(store.top(5)[0].username).toBe("João");
  });

  it("curtidas: caos ao atingir o limite e progresso acumulado", () => {
    mock.like(60);
    step();
    expect(actions.spawns).toHaveLength(0);
    expect(actions.likeProgress).toBe(60);
    mock.like(60);
    step();
    expect(actions.spawns).toEqual([{ type: "small", count: cfg.likeChaosSmallSharks, owner: "❤️" }]);
    expect(actions.likeProgress).toBe(20);
    expect(actions.stats.likes).toBe(120);
  });

  it("curtidas em massa têm teto de ondas", () => {
    mock.like(100_000);
    step();
    expect(actions.spawns[0].count).toBe(cfg.likeChaosSmallSharks * cfg.maxChaosWavesPerEvent);
  });

  it("comentário ATAQUE ativa o ataque, com cooldown por usuário", () => {
    mock.comment("Pedro", "bora, ataque!!");
    mock.comment("Pedro", "ATAQUE");
    mock.comment("Ana", "Atáque");
    step();
    expect(actions.bursts).toEqual(["Pedro", "Ana"]);
    step(cfg.commandCooldownSeconds);
    mock.comment("Pedro", "ATAQUE");
    step();
    expect(actions.bursts).toEqual(["Pedro", "Ana", "Pedro"]);
    expect(actions.feed).toContain("💥 Pedro ativou ATAQUE!");
  });

  it("comentário comum só pontua e não aparece na tela", () => {
    mock.comment("Lucas", "oi pessoal");
    step();
    expect(actions.feed).toHaveLength(0);
    expect(actions.bursts).toHaveLength(0);
    expect(store.get("Lucas")?.points).toBe(1);
  });

  it("presentes por nível", () => {
    mock.gift("Jesus", "rose");
    step();
    expect(actions.spawns).toEqual([{ type: "small", count: 1, owner: "Jesus" }]);
    expect(actions.feed).toContain("🌹 Jesus enviou uma Rosa!");

    mock.gift("Maria", "diamond");
    step();
    expect(actions.spawns.slice(1)).toEqual([
      { type: "small", count: 3, owner: "Maria" },
      { type: "medium", count: 2, owner: "Maria" },
    ]);

    mock.gift("Carlos", "giftbox");
    step();
    expect(actions.spawns.at(-1)).toEqual({ type: "giant", count: 1, owner: "Carlos" });
    expect(actions.alerts).toContain("TUBARÃO GIGANTE!");

    mock.gift("Ana", "crown");
    step();
    expect(actions.spawns.at(-1)).toEqual({ type: "mega", count: 1, owner: "Ana" });
    expect(actions.alerts).toContain("MEGA TUBARÃO!");
    expect(actions.urgentAlerts).toEqual(["MEGA TUBARÃO!"]);
    expect(actions.special).toHaveLength(2);
    expect(actions.stats.gifts).toBe(4);
  });

  it("presente desconhecido usa o nível padrão e combo multiplica", () => {
    mock.gift("Leo", "galaxy", 4);
    step();
    expect(actions.spawns).toEqual([{ type: "small", count: 4, owner: "Leo" }]);
    expect(actions.feed[0]).toContain("x4");
  });

  it("combo de MEGA tem teto", () => {
    mock.gift("Ana", "crown", 50);
    step();
    expect(actions.spawns[0]).toEqual({ type: "mega", count: cfg.maxMegaPerEvent, owner: "Ana" });
  });

  it("limita eventos por quadro e descarta excesso da fila", () => {
    for (let i = 0; i < cfg.maxPendingEvents + 10; i++) mock.follow(`u${i}`);
    expect(manager.droppedEvents).toBe(10);
    step();
    expect(actions.feed).toHaveLength(cfg.maxEventsPerFrame);
  });

  it("ranking ordena por pontos", () => {
    mock.gift("Rara", "crown");
    mock.follow("Fiel");
    mock.gift("Rosa", "rose");
    step();
    expect(store.top(3).map((e) => e.username)).toEqual(["Rara", "Fiel", "Rosa"]);
  });
});
