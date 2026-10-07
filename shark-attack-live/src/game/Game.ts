import type { SoundName } from "../config/audioConfig";
import type { GameConfig, SharkType } from "../config/gameConfig";
import type { LIVE_CONFIG } from "../config/liveConfig";
import type { SoundPlayer } from "../audio/AudioManager";
import type { Shark } from "../entities/Shark";
import type { LeaderboardStore } from "../store/LeaderboardStore";
import { CombatSystem } from "../systems/CombatSystem";
import { resolveCollisions, type CollisionEvents } from "../systems/CollisionSystem";
import { difficultyFor, type DifficultyParams } from "../systems/DifficultySystem";
import { EffectsSystem } from "../systems/EffectsSystem";
import { ScoreSystem } from "../systems/ScoreSystem";
import { SpawnSystem } from "../systems/SpawnSystem";
import { AlertBanner } from "../ui/AlertBanner";
import { Background } from "../ui/Background";
import { CallToAction } from "../ui/CallToAction";
import { drawPlayer, drawProjectile, drawShark } from "../ui/EntityRenderer";
import { EventFeed } from "../ui/EventFeed";
import { GameOverScreen } from "../ui/GameOverScreen";
import { HUD } from "../ui/HUD";
import { LeaderboardView } from "../ui/Leaderboard";
import type { Rng } from "../utils/math";
import type { GameActions } from "./GameActions";
import { createGameState, createPlayer, createRoundStats, type GameState, type LiveStats } from "./GameState";

type LiveConfig = typeof LIVE_CONFIG;

const SHARK_DRAW_ORDER: Record<SharkType, number> = { small: 0, medium: 1, giant: 2, mega: 3 };

/**
 * Orquestra estado, systems, efeitos e UI. Implementa `GameActions`, que é a
 * única porta de entrada para as interações do público.
 */
export class Game implements GameActions {
  readonly state: GameState;
  readonly effects: EffectsSystem;
  difficulty: DifficultyParams;
  private readonly spawn: SpawnSystem;
  private readonly score: ScoreSystem;
  private readonly combat: CombatSystem;
  private readonly background: Background;
  private readonly hud: HUD;
  private readonly feed: EventFeed;
  private readonly leaderboard: LeaderboardView;
  private readonly alerts: AlertBanner;
  private readonly cta: CallToAction;
  private readonly gameOverScreen: GameOverScreen;
  private time = 0;

  constructor(
    private readonly cfg: GameConfig,
    live: LiveConfig,
    private readonly audio: SoundPlayer,
    private readonly store: LeaderboardStore,
    rng: Rng = Math.random,
  ) {
    const { width, height } = cfg.canvas;
    this.state = createGameState(cfg);
    this.spawn = new SpawnSystem(cfg, rng);
    this.score = new ScoreSystem(cfg.score);
    this.combat = new CombatSystem(cfg.player);
    this.effects = new EffectsSystem(cfg.effects);
    this.difficulty = difficultyFor(0, cfg.difficulty);
    this.background = new Background(width, height, cfg.effects);
    this.hud = new HUD(width, live.title);
    this.feed = new EventFeed(30, 440, 600, cfg.ui.feedDurationSeconds, cfg.ui.feedMaxItems);
    this.leaderboard = new LeaderboardView(width - 30 - 360, 440, 360);
    this.alerts = new AlertBanner(width / 2, height / 2 - 120, width - 80, cfg.ui.alertDurationSeconds);
    this.cta = new CallToAction(width, cfg.arena.bottom + 20, live.callToActions, cfg.ui.ctaRotateSeconds);
    this.gameOverScreen = new GameOverScreen(width, height);
  }

  get queuedSharks(): number {
    return this.spawn.queuedCount;
  }

  // =========================================================================
  // Atualização
  // =========================================================================

  update(dt: number): void {
    this.time += dt;
    this.background.update(dt);
    this.effects.update(dt);
    this.feed.update(dt);
    this.alerts.update(dt);
    this.cta.update(dt);
    if (this.state.phase === "playing") this.updatePlaying(dt);
    else this.updateGameOver(dt);
  }

  private updatePlaying(dt: number): void {
    const { state, cfg } = this;
    this.score.tick(state.round, dt);

    const previousLevel = this.difficulty.level;
    this.difficulty = difficultyFor(state.round.survivalTime, cfg.difficulty);
    if (this.difficulty.level > previousLevel) {
      this.showAlert(`NÍVEL ${this.difficulty.level}`, "Os tubarões estão mais fortes!", "#40c4ff");
    }

    for (const shark of this.spawn.update(dt, state.sharks, this.difficulty)) this.onSharkSpawned(shark);

    state.player.update(dt, state.sharks);
    const shot = this.combat.autoFire(state.player, state.sharks);
    if (shot) state.projectiles.push(shot);

    this.moveSharks(dt);
    for (const p of state.projectiles) p.update(dt);

    this.applyCollisions(resolveCollisions(state, cfg.sharkBehavior));
    this.cleanup();

    if (!state.player.alive) this.enterGameOver();
  }

  private updateGameOver(dt: number): void {
    // Os tubarões continuam rondando o local enquanto a tela de game over aparece.
    this.moveSharks(dt);
    this.state.gameOverTimer -= dt;
    if (this.state.gameOverTimer <= 0) this.restart();
  }

  private moveSharks(dt: number): void {
    const { player } = this.state;
    for (const shark of this.state.sharks) {
      shark.update(dt, player.x, player.y, this.difficulty.speedMultiplier, this.cfg.sharkBehavior.knockbackDecay);
    }
  }

  private onSharkSpawned(shark: Shark): void {
    this.state.sharks.push(shark);
    if (shark.isMega) {
      this.effects.shake(18, 0.8);
      this.effects.flash("#ff1744", 0.5);
    }
    this.audio.play("spawn");
  }

  private applyCollisions(events: CollisionEvents): void {
    const { state } = this;
    for (const hit of events.projectileHits) {
      this.effects.burst(hit.x, hit.y, "#b3e5fc", 6, 260, 7);
      this.effects.floatingText(hit.x, hit.y - 20, `-${hit.damage}`, "#ffffff", 36);
      if (hit.killed) this.onSharkKilled(hit.shark);
    }
    for (const bite of events.playerHits) {
      const { player } = state;
      if (bite.damage > 0) {
        this.score.addDamageTaken(state.round, bite.damage);
        this.effects.floatingText(player.x, player.y - player.radius - 70, `-${bite.damage}`, "#ff1744", 64);
        this.effects.burst(player.x, player.y, "#ff5252", 22, 420, 10);
        this.effects.shake(bite.shark.isMega ? 22 : 10, 0.3);
        this.effects.flash("#ff0000", 0.25);
        this.audio.play("hit");
      } else {
        this.effects.floatingText(player.x, player.y - player.radius - 70, "BLOQUEADO!", "#80d8ff", 44);
      }
    }
  }

  private onSharkKilled(shark: Shark): void {
    const { state } = this;
    this.score.addKill(state.round, shark);
    const big = shark.radius > 80;
    this.effects.burst(shark.x, shark.y, shark.bodyColor, big ? 50 : 18, big ? 700 : 400, big ? 16 : 10);
    this.effects.burst(shark.x, shark.y, "#e1f5fe", big ? 30 : 10, 300, 6);
    this.effects.ring(shark.x, shark.y, shark.radius * 2.5, "#ffffff", 0.5, 8);
    this.effects.floatingText(shark.x, shark.y - shark.radius, `+${shark.scoreValue}`, "#ffea00", big ? 72 : 46);
    this.audio.play("death");
    if (shark.isMega) {
      this.showAlert("MEGA TUBARÃO DERROTADO!", shark.owner ? `invocado por ${shark.owner}` : "", "#00e676", true);
      this.effects.shake(25, 0.8);
    }
  }

  private cleanup(): void {
    const { width, height } = this.cfg.canvas;
    const pad = 300;
    this.state.projectiles = this.state.projectiles.filter(
      (p) => !p.dead && p.x > -pad && p.x < width + pad && p.y > -pad && p.y < height + pad,
    );
    this.state.sharks = this.state.sharks.filter((s) => !s.dead);
  }

  private enterGameOver(): void {
    const { state } = this;
    state.phase = "gameover";
    state.gameOverTimer = this.cfg.gameOver.restartDelaySeconds;
    state.lastRound = { ...state.round };
    state.bestScore = Math.max(state.bestScore, state.round.score);
    state.projectiles = [];
    this.effects.burst(state.player.x, state.player.y, "#ff8f00", 60, 600, 14);
    this.effects.shake(25, 0.6);
    this.audio.play("gameover");
  }

  /** Nova rodada. Tubarões de presentes ainda na fila nascem na rodada nova. */
  restart(): void {
    const { state } = this;
    state.phase = "playing";
    state.roundNumber += 1;
    state.round = createRoundStats();
    state.player = createPlayer(this.cfg);
    state.sharks = [];
    state.projectiles = [];
    this.spawn.reset();
    this.score.reset();
    this.difficulty = difficultyFor(0, this.cfg.difficulty);
    this.showFeed(`🔄 RODADA ${state.roundNumber} COMEÇOU!`, "#80d8ff");
  }

  /** Somente para o modo desenvolvedor. */
  debugKillPlayer(): void {
    if (this.state.phase !== "playing") return;
    this.state.player.health = 0;
  }

  // =========================================================================
  // GameActions — chamadas pelo InteractionManager
  // =========================================================================

  spawnSharks(type: SharkType, count: number, owner?: string): void {
    this.spawn.enqueue(type, count, owner);
  }

  healPlayer(amount: number): void {
    const { player } = this.state;
    if (this.state.phase !== "playing") return;
    const healed = player.heal(amount);
    if (healed > 0) {
      this.effects.floatingText(player.x, player.y - player.radius - 70, `+${healed} ❤️`, "#69f0ae", 52);
      this.effects.ring(player.x, player.y, player.radius * 3, "#69f0ae");
    }
  }

  shieldPlayer(seconds: number): void {
    const { player } = this.state;
    if (this.state.phase !== "playing") return;
    player.addShield(seconds);
    this.effects.ring(player.x, player.y, player.radius * 3.5, "#40c4ff");
  }

  playerBurst(_owner: string): void {
    const { player } = this.state;
    if (this.state.phase !== "playing") return;
    this.state.projectiles.push(...this.combat.burst(player));
    this.effects.ring(player.x, player.y, 500, "#ffea00", 0.7, 16);
    this.effects.shake(8, 0.25);
    this.audio.play("burst");
  }

  addSpecialScore(points: number): void {
    if (this.state.phase !== "playing") return;
    this.score.addSpecial(this.state.round, points);
    const { player } = this.state;
    this.effects.floatingText(player.x, player.y + player.radius + 70, `+${points} BÔNUS`, "#ffea00", 50);
  }

  addLiveStats(delta: Partial<LiveStats>): void {
    const live = this.state.live;
    live.followers += delta.followers ?? 0;
    live.likes += delta.likes ?? 0;
    live.gifts += delta.gifts ?? 0;
  }

  setLikeProgress(current: number): void {
    this.state.likesTowardChaos = current;
  }

  showFeed(text: string, color?: string): void {
    this.feed.push(text, color);
  }

  showAlert(title: string, subtitle: string, color: string, urgent = false): void {
    this.alerts.push(title, subtitle, color, urgent);
  }

  playSound(name: SoundName): void {
    this.audio.play(name);
  }

  // =========================================================================
  // Renderização
  // =========================================================================

  render(ctx: CanvasRenderingContext2D): void {
    const { width, height } = this.cfg.canvas;
    const { state } = this;
    this.background.render(ctx);

    const shake = this.effects.shakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);
    const sharks = [...state.sharks].sort((a, b) => SHARK_DRAW_ORDER[a.type] - SHARK_DRAW_ORDER[b.type]);
    for (const shark of sharks) drawShark(ctx, shark, this.time);
    for (const p of state.projectiles) drawProjectile(ctx, p);
    if (state.phase === "playing") drawPlayer(ctx, state.player);
    this.effects.renderWorld(ctx);
    ctx.restore();

    this.hud.render(ctx, state, this.difficulty);
    this.feed.render(ctx);
    this.leaderboard.render(ctx, this.store.top(this.cfg.ui.leaderboardSize), this.cfg.ui.leaderboardSize);
    this.cta.render(ctx, state.likesTowardChaos, this.cfg.interactions.likeThreshold);
    if (state.phase === "gameover" && state.lastRound) {
      // Alertas não cobrem o resultado da rodada.
      this.gameOverScreen.render(ctx, state.lastRound, state.bestScore, state.gameOverTimer);
    } else {
      this.alerts.render(ctx);
    }
    this.effects.renderScreen(ctx, width, height);
  }
}
