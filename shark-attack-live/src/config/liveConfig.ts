/**
 * Textos da LIVE, mapeamento de presentes e comandos. Configuração de
 * conteúdo — mude à vontade sem tocar na lógica.
 *
 * Presentes apenas modificam o jogo. Não existe prêmio, dinheiro ou
 * vantagem fora do jogo. Os "pontos" são só para o ranking visual.
 */

import type { SharkType } from "./gameConfig";

export type GiftTier = "small" | "medium" | "large" | "rare";

export interface GiftTierEffect {
  /** Tubarões criados por presente (o nome de quem enviou aparece neles). */
  sharks: { type: SharkType; count: number }[];
  /** Mostra alerta grande no centro da tela. */
  alert?: { title: string; color: string; urgent: boolean };
  rankingPoints: number;
  sound: "gift" | "special";
}

export interface GiftDefinition {
  tier: GiftTier;
  emoji: string;
  /** Texto usado em "João enviou <label>!" */
  label: string;
}

export type CommandAction = "burst" | "shield";

export const LIVE_CONFIG = {
  title: "🦈 SHARK ATTACK LIVE",

  callToActions: [
    "🎁 ENVIE PRESENTES PARA INVOCAR TUBARÕES",
    "❤️ CURTIDAS AUMENTAM O CAOS",
    "💬 COMENTE “ATAQUE”",
    "👥 SIGA PARA ENTRAR NO RANKING",
  ],

  /** Chave = identificador do presente no evento (`gift`). */
  gifts: {
    rose: { tier: "small", emoji: "🌹", label: "uma Rosa" },
    diamond: { tier: "medium", emoji: "💎", label: "um Diamante" },
    giftbox: { tier: "large", emoji: "🎁", label: "um Presente Grande" },
    crown: { tier: "rare", emoji: "👑", label: "uma Coroa" },
  } satisfies Record<string, GiftDefinition>,

  /** Presentes não mapeados (nomes reais do TikTok) usam este nível. */
  unknownGift: { tier: "small", emoji: "🎁", label: "um presente" } satisfies GiftDefinition,

  giftTiers: {
    small: { sharks: [{ type: "small", count: 1 }], rankingPoints: 1, sound: "gift" },
    medium: {
      sharks: [{ type: "small", count: 3 }, { type: "medium", count: 2 }],
      rankingPoints: 5,
      sound: "gift",
    },
    large: {
      sharks: [{ type: "giant", count: 1 }],
      alert: { title: "TUBARÃO GIGANTE!", color: "#ffb300", urgent: false },
      rankingPoints: 20,
      sound: "special",
    },
    rare: {
      sharks: [{ type: "mega", count: 1 }],
      alert: { title: "MEGA TUBARÃO!", color: "#ff1744", urgent: true },
      rankingPoints: 100,
      sound: "special",
    },
  } satisfies Record<GiftTier, GiftTierEffect>,

  /** Comentários: palavra (sem acento, maiúscula) → ação. */
  commands: {
    ATAQUE: "burst",
    ESCUDO: "shield",
  } satisfies Record<string, CommandAction>,

  rankingPoints: { follow: 5, comment: 1, command: 2, likesPerPoint: 50 },
};
