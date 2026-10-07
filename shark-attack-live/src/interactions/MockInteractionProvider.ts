import { parseInteractionEvent, type SchemaLimits } from "./eventSchema";
import { dispatchEvent, type InteractionHandlers, type InteractionProvider, type ProviderStatus } from "./types";

/**
 * Provedor simulado (botões do modo desenvolvedor, testes, console).
 * Monta exatamente o mesmo JSON que o bridge externo envia e passa pelo
 * mesmo validador — o caminho até o jogo é idêntico.
 */
export class MockInteractionProvider implements InteractionProvider {
  readonly name = "Simulador";
  private handlers: InteractionHandlers | null = null;

  constructor(private readonly limits: SchemaLimits) {}

  get status(): ProviderStatus {
    return this.handlers ? "connected" : "disconnected";
  }

  connect(handlers: InteractionHandlers): void {
    this.handlers = handlers;
  }

  disconnect(): void {
    this.handlers = null;
  }

  /** Envia um evento bruto (como chegaria de fora). Retorna false se inválido. */
  emit(raw: unknown): boolean {
    if (!this.handlers) return false;
    const event = parseInteractionEvent(raw, this.limits);
    if (!event) {
      console.warn("[Mock] evento inválido ignorado");
      return false;
    }
    dispatchEvent(event, this.handlers);
    return true;
  }

  follow(username: string): boolean {
    return this.emit({ type: "follow", username });
  }

  like(amount: number, username?: string): boolean {
    return this.emit({ type: "like", amount, username });
  }

  comment(username: string, message: string): boolean {
    return this.emit({ type: "comment", username, message });
  }

  gift(username: string, gift: string, count = 1): boolean {
    return this.emit({ type: "gift", username, gift, count });
  }
}
