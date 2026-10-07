import type { InteractionEvent } from "./types";

export interface SchemaLimits {
  maxUsernameLength: number;
  maxGiftCount: number;
}

const MAX_MESSAGE_LENGTH = 200;
const MAX_GIFT_ID_LENGTH = 40;
const MAX_LIKE_AMOUNT = 100_000;
const FALLBACK_USERNAME = "Anônimo";

/** Remove caracteres de controle, normaliza espaços e corta o tamanho. */
export function sanitizeUsername(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return FALLBACK_USERNAME;
  // Espaços/quebras de linha viram um espaço; os demais caracteres de controle
  // (e marcas invisíveis de direção de texto) são removidos.
  const clean = value
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e]/g, "")
    .trim();
  if (!clean) return FALLBACK_USERNAME;
  const chars = Array.from(clean); // não quebra emojis ao meio
  return chars.length > maxLength ? `${chars.slice(0, maxLength - 1).join("")}…` : clean;
}

function toPositiveInt(value: unknown, fallback: number, max: number): number | null {
  if (value === undefined) return fallback;
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const int = Math.floor(n);
  if (int < 1) return null;
  return Math.min(int, max);
}

/**
 * Valida qualquer entrada externa e devolve um evento seguro, ou `null`.
 * Usado por TODOS os provedores — os botões de teste passam pelo mesmo caminho.
 */
export function parseInteractionEvent(raw: unknown, limits: SchemaLimits): InteractionEvent | null {
  if (typeof raw !== "object" || raw === null) return null;
  const data = raw as Record<string, unknown>;

  switch (data.type) {
    case "follow":
      return { type: "follow", username: sanitizeUsername(data.username, limits.maxUsernameLength) };

    case "like": {
      const amount = toPositiveInt(data.amount, 1, MAX_LIKE_AMOUNT);
      if (amount === null) return null;
      const event: InteractionEvent = { type: "like", amount };
      if (data.username !== undefined) event.username = sanitizeUsername(data.username, limits.maxUsernameLength);
      return event;
    }

    case "comment": {
      if (typeof data.message !== "string") return null;
      return {
        type: "comment",
        username: sanitizeUsername(data.username, limits.maxUsernameLength),
        message: data.message.slice(0, MAX_MESSAGE_LENGTH),
      };
    }

    case "gift": {
      if (typeof data.gift !== "string" || !data.gift.trim()) return null;
      const count = toPositiveInt(data.count, 1, limits.maxGiftCount);
      if (count === null) return null;
      return {
        type: "gift",
        username: sanitizeUsername(data.username, limits.maxUsernameLength),
        gift: data.gift.trim().toLowerCase().slice(0, MAX_GIFT_ID_LENGTH),
        count,
      };
    }

    default:
      return null;
  }
}

/** "ataque!" / "Atáque" → "ATAQUE" — para comparar comandos. */
export function normalizeCommandText(message: string): string {
  return message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}
