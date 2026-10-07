import type { GameConfig } from "../config/gameConfig";
import { LIVE_CONFIG, type CommandAction, type GiftDefinition } from "../config/liveConfig";
import type { GameActions } from "../game/GameActions";
import type { LeaderboardStore } from "../store/LeaderboardStore";
import { normalizeCommandText } from "./eventSchema";
import type { CommentEvent, FollowEvent, GiftEvent, InteractionEvent, InteractionHandlers, LikeEvent } from "./types";

type LiveConfig = typeof LIVE_CONFIG;

const COLORS = { follow: "#69f0ae", like: "#ff5c8a", command: "#ffd740", gift: "#ffffff" };

/**
 * Traduz eventos abstratos em ações do jogo. Não sabe nada do TikTok e não
 * acessa o Game diretamente — só a interface `GameActions`.
 *
 * Os eventos entram numa fila e são processados no loop do jogo (no máximo
 * `maxEventsPerFrame` por frame), então rajadas de eventos não travam a tela.
 */
export class InteractionManager implements InteractionHandlers {
  private readonly pending: InteractionEvent[] = [];
  private readonly lastCommandAt = new Map<string, number>();
  private likesTowardChaos = 0;
  private time = 0;
  droppedEvents = 0;

  constructor(
    private readonly actions: GameActions,
    private readonly store: LeaderboardStore,
    private readonly cfg: GameConfig["interactions"],
    private readonly live: LiveConfig = LIVE_CONFIG,
  ) {}

  get pendingCount(): number {
    return this.pending.length;
  }

  // ---- InteractionHandlers: só enfileiram -------------------------------------
  onFollow(event: FollowEvent): void {
    this.enqueue(event);
  }
  onLike(event: LikeEvent): void {
    this.enqueue(event);
  }
  onComment(event: CommentEvent): void {
    this.enqueue(event);
  }
  onGift(event: GiftEvent): void {
    this.enqueue(event);
  }

  private enqueue(event: InteractionEvent): void {
    if (this.pending.length >= this.cfg.maxPendingEvents) {
      this.droppedEvents++;
      return;
    }
    this.pending.push(event);
  }

  /** Chamado a cada passo do loop do jogo. */
  process(dt: number): void {
    this.time += dt;
    const n = Math.min(this.pending.length, this.cfg.maxEventsPerFrame);
    for (let i = 0; i < n; i++) {
      const event = this.pending.shift()!;
      try {
        this.handle(event);
      } catch (err) {
        // Um evento defeituoso nunca pode derrubar a LIVE.
        console.error("[Interactions] falha ao processar evento", event.type, err);
      }
    }
  }

  private handle(event: InteractionEvent): void {
    switch (event.type) {
      case "follow":
        return this.handleFollow(event);
      case "like":
        return this.handleLike(event);
      case "comment":
        return this.handleComment(event);
      case "gift":
        return this.handleGift(event);
    }
  }

  private handleFollow(e: FollowEvent): void {
    this.store.addPoints(e.username, this.live.rankingPoints.follow, this.time);
    this.actions.addLiveStats({ followers: 1 });
    this.actions.healPlayer(this.cfg.followHeal);
    this.actions.shieldPlayer(this.cfg.followShieldSeconds);
    this.actions.playSound("heal");
    this.actions.showFeed(`🔥 ${e.username} entrou no jogo!`, COLORS.follow);
  }

  private handleLike(e: LikeEvent): void {
    this.actions.addLiveStats({ likes: e.amount });
    if (e.username) {
      const points = Math.floor(e.amount / this.live.rankingPoints.likesPerPoint);
      if (points > 0) this.store.addPoints(e.username, points, this.time);
    }
    this.likesTowardChaos += e.amount;
    const waves = Math.floor(this.likesTowardChaos / this.cfg.likeThreshold);
    this.likesTowardChaos %= this.cfg.likeThreshold;
    this.actions.setLikeProgress(this.likesTowardChaos);
    // Muitas curtidas de uma vez não viram centenas de ondas.
    const effectiveWaves = Math.min(waves, this.cfg.maxChaosWavesPerEvent);
    if (effectiveWaves > 0) {
      this.actions.spawnSharks("small", this.cfg.likeChaosSmallSharks * effectiveWaves, "❤️");
      this.actions.playSound("gift");
      this.actions.showFeed(`❤️ ${this.cfg.likeThreshold * waves} CURTIDAS! CAOS!`, COLORS.like);
    }
  }

  private handleComment(e: CommentEvent): void {
    const command = this.findCommand(e.message);
    if (!command) {
      // Comentário comum só soma no ranking; o texto nunca é exibido na tela.
      this.store.addPoints(e.username, this.live.rankingPoints.comment, this.time);
      return;
    }
    const [word, action] = command;
    const key = `${e.username.toLowerCase()}|${word}`;
    const last = this.lastCommandAt.get(key);
    if (last !== undefined && this.time - last < this.cfg.commandCooldownSeconds) return;
    this.lastCommandAt.set(key, this.time);

    this.store.addPoints(e.username, this.live.rankingPoints.command, this.time);
    if (action === "burst") {
      this.actions.playerBurst(e.username);
      this.actions.showFeed(`💥 ${e.username} ativou ${word}!`, COLORS.command);
    } else {
      this.actions.shieldPlayer(this.cfg.commandShieldSeconds);
      this.actions.playSound("heal");
      this.actions.showFeed(`🛡️ ${e.username} ativou ${word}!`, COLORS.command);
    }
  }

  private findCommand(message: string): [string, CommandAction] | null {
    const words = new Set(normalizeCommandText(message).split(/[^A-Z0-9]+/).filter(Boolean));
    for (const [word, action] of Object.entries(this.live.commands) as [string, CommandAction][]) {
      if (words.has(word)) return [word, action];
    }
    return null;
  }

  private handleGift(e: GiftEvent): void {
    const definition: GiftDefinition =
      (this.live.gifts as Record<string, GiftDefinition>)[e.gift] ?? this.live.unknownGift;
    const effect = this.live.giftTiers[definition.tier];
    const count = e.count ?? 1;

    this.actions.addLiveStats({ gifts: count });
    this.store.addPoints(e.username, effect.rankingPoints * count, this.time);
    for (const shark of effect.sharks) {
      const total = shark.type === "mega" ? Math.min(count, this.cfg.maxMegaPerEvent) : shark.count * count;
      this.actions.spawnSharks(shark.type, total, e.username);
    }
    if ("alert" in effect && effect.alert) {
      this.actions.showAlert(effect.alert.title, `invocado por ${e.username}`, effect.alert.color, effect.alert.urgent);
      this.actions.addSpecialScore(this.cfg.specialEventScore);
    }
    this.actions.playSound(effect.sound);
    const combo = count > 1 ? ` x${count}` : "";
    this.actions.showFeed(`${definition.emoji} ${e.username} enviou ${definition.label}!${combo}`, COLORS.gift);
  }
}
