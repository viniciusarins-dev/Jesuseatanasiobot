/**
 * Todos os números do jogo ficam aqui. Ajuste livremente — nada disso está
 * espalhado pelo código.
 */

export type SharkType = "small" | "medium" | "giant" | "mega";

export interface SharkStats {
  radius: number;
  speed: number; // px/s
  health: number;
  damage: number; // dano ao encostar no jogador
  score: number; // pontos ao ser derrotado
  bodyColor: string;
  bellyColor: string;
}

export const GAME_CONFIG = {
  canvas: { width: 1080, height: 1920 },

  /** Faixa vertical onde os tubarões nascem/circulam (abaixo do HUD superior). */
  arena: { top: 420, bottom: 1640, spawnMargin: 90 },

  player: {
    maxHealth: 120,
    speed: 240,
    radius: 48,
    /** Distância máxima que o jogador se afasta do centro ao desviar. */
    leashRadius: 200,
    /** Distância em que ele começa a desviar do tubarão mais próximo. */
    dodgeRange: 320,
    invulnerableAfterHit: 0.5,
    fireInterval: 0.3,
    range: 900,
    projectileSpeed: 1150,
    projectileDamage: 12,
    projectileRadius: 12,
    projectileLife: 1.2,
    /** Arpões disparados em círculo pelo comando ATAQUE. */
    burstProjectiles: 28,
    burstDamage: 20,
  },

  /** Pequeno = tubarão-de-recife, médio = martelo, gigante = branco, MEGA = monstro. */
  sharks: {
    small: { radius: 40, speed: 210, health: 12, damage: 6, score: 50, bodyColor: "#4f86b5", bellyColor: "#e3f2fd" },
    medium: { radius: 58, speed: 150, health: 40, damage: 12, score: 150, bodyColor: "#8a8f7c", bellyColor: "#eceade" },
    giant: { radius: 92, speed: 85, health: 140, damage: 25, score: 500, bodyColor: "#5d6d7a", bellyColor: "#f5f7f8" },
    mega: { radius: 150, speed: 70, health: 900, damage: 35, score: 3000, bodyColor: "#4a148c", bellyColor: "#e1bee7" },
  } satisfies Record<SharkType, SharkStats>,

  sharkBehavior: {
    /** Tempo entre mordidas do mesmo tubarão. */
    biteCooldown: 1.0,
    knockbackOnBite: 420,
    knockbackOnHit: 140,
    knockbackDecay: 4,
    /** Tubarão pequeno é destruído ao morder (não conta como abate do jogador). */
    smallDiesOnBite: true,
    /** Distância (em raios do tubarão) em que ele começa a abrir a boca. */
    mouthOpenRange: 3,
    /** Duração da boca escancarada após uma mordida (s). */
    biteAnimSeconds: 0.35,
  },

  megaShark: {
    chargeInterval: 4,
    chargeDuration: 0.9,
    chargeSpeedMultiplier: 3,
  },

  spawn: {
    /** Pesos de sorteio dos tubarões "naturais" (só tipos já liberados). */
    weights: { small: 60, medium: 30, giant: 10 },
    /** Teto absoluto de tubarões vivos (proteção de performance contra spam). */
    hardCap: 60,
    /** Tubarões vindos de eventos entram em fila e nascem neste ritmo. */
    queueSpawnPerSecond: 6,
    maxQueue: 120,
  },

  difficulty: {
    levelDuration: 30, // segundos por nível
    maxLevel: 20,
    baseSpawnInterval: 0.8,
    minSpawnInterval: 0.25,
    spawnIntervalFactorPerLevel: 0.9,
    speedIncreasePerLevel: 0.07,
    baseMaxAlive: 10,
    maxAliveIncreasePerLevel: 2,
    maxAliveCap: 30,
    /** Nível em que cada tipo passa a nascer naturalmente. */
    unlockLevel: { small: 1, medium: 2, giant: 5 },
  },

  score: {
    perSecondSurvived: 10,
  },

  gameOver: { restartDelaySeconds: 7 },

  interactions: {
    followHeal: 10,
    followShieldSeconds: 2.5,
    likeThreshold: 100,
    likeChaosSmallSharks: 3,
    /** Curtidas em massa num único evento geram no máximo esta quantidade de ondas. */
    maxChaosWavesPerEvent: 3,
    commandShieldSeconds: 3,
    /** Combo de presentes raros: no máximo N MEGA por evento. */
    maxMegaPerEvent: 2,
    /** Pontos extras na rodada quando um evento especial (alerta) acontece. */
    specialEventScore: 500,
    /** Cooldown por usuário para comandos de comentário (anti-spam). */
    commandCooldownSeconds: 5,
    /** Máximo de eventos processados por frame (picos não travam o jogo). */
    maxEventsPerFrame: 20,
    maxPendingEvents: 500,
    /** Limite de repetições de um presente em combo. */
    maxGiftCount: 50,
    maxUsernameLength: 18,
  },

  ui: {
    feedDurationSeconds: 4.5,
    feedMaxItems: 6,
    leaderboardSize: 5,
    alertDurationSeconds: 2.6,
    ctaRotateSeconds: 4,
  },

  effects: {
    maxParticles: 700,
    maxFloatingTexts: 80,
    bubbleCount: 45,
  },

  loop: { fixedStep: 1 / 60, maxFrameTime: 0.25 },
};

export type GameConfig = typeof GAME_CONFIG;
