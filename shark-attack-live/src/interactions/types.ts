/**
 * Contrato ÚNICO de eventos de interação. Tanto os botões de teste quanto o
 * provedor externo (TikTok via bridge) produzem exatamente estes objetos.
 */

export interface FollowEvent {
  type: "follow";
  username: string;
}

export interface LikeEvent {
  type: "like";
  amount: number;
  username?: string;
}

export interface CommentEvent {
  type: "comment";
  username: string;
  message: string;
}

export interface GiftEvent {
  type: "gift";
  username: string;
  gift: string;
  /** Repetições em combo (padrão 1). */
  count?: number;
}

export type InteractionEvent = FollowEvent | LikeEvent | CommentEvent | GiftEvent;

/** Quem recebe os eventos (implementado pelo InteractionManager). */
export interface InteractionHandlers {
  onFollow(event: FollowEvent): void;
  onLike(event: LikeEvent): void;
  onComment(event: CommentEvent): void;
  onGift(event: GiftEvent): void;
}

export type ProviderStatus = "disconnected" | "connecting" | "connected";

/** Fonte de eventos: simulada (Mock) ou externa (TikTok via bridge). */
export interface InteractionProvider {
  readonly name: string;
  readonly status: ProviderStatus;
  connect(handlers: InteractionHandlers): void;
  disconnect(): void;
}

/** Encaminha um evento já validado para o método correspondente. */
export function dispatchEvent(event: InteractionEvent, handlers: InteractionHandlers): void {
  switch (event.type) {
    case "follow":
      handlers.onFollow(event);
      break;
    case "like":
      handlers.onLike(event);
      break;
    case "comment":
      handlers.onComment(event);
      break;
    case "gift":
      handlers.onGift(event);
      break;
  }
}
