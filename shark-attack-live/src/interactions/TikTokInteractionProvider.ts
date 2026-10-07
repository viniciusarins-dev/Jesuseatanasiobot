import { parseInteractionEvent, type SchemaLimits } from "./eventSchema";
import { dispatchEvent, type InteractionHandlers, type InteractionProvider, type ProviderStatus } from "./types";

/**
 * Provedor para eventos reais da LIVE — recebidos de um BRIDGE externo.
 *
 * Por que um bridge? O jogo roda no navegador e NÃO deve conter tokens nem
 * depender de uma API específica. Um processo separado (o "bridge") é quem
 * conecta ao TikTok — pela forma de acesso que estiver disponível para você
 * (API/ferramenta oficial liberada para a sua conta, ou um serviço de
 * terceiros) — e repassa os eventos JÁ NORMALIZADOS por WebSocket:
 *
 *   {"type":"gift","username":"Ana","gift":"rose","count":1}
 *   {"type":"follow","username":"Ana"}
 *   {"type":"like","amount":15,"username":"Ana"}
 *   {"type":"comment","username":"Ana","message":"ATAQUE"}
 *
 * Também aceita um array desses objetos numa única mensagem.
 * Este arquivo NÃO implementa nenhuma API do TikTok — só o contrato acima.
 * Sem bridge configurado, o jogo funciona normalmente com o simulador.
 */
export interface BridgeOptions {
  reconnectBaseMs: number;
  reconnectMaxMs: number;
}

type SocketLike = Pick<WebSocket, "close"> & {
  onopen: ((ev: Event) => unknown) | null;
  onclose: ((ev: CloseEvent) => unknown) | null;
  onerror: ((ev: Event) => unknown) | null;
  onmessage: ((ev: MessageEvent) => unknown) | null;
};

export class TikTokInteractionProvider implements InteractionProvider {
  readonly name = "TikTok (bridge)";
  private currentStatus: ProviderStatus = "disconnected";
  private socket: SocketLike | null = null;
  private handlers: InteractionHandlers | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private stopped = true;
  invalidMessages = 0;

  constructor(
    private readonly url: string,
    private readonly limits: SchemaLimits,
    private readonly options: BridgeOptions = { reconnectBaseMs: 1000, reconnectMaxMs: 30_000 },
    private readonly socketFactory: (url: string) => SocketLike = (u) => new WebSocket(u),
  ) {}

  get status(): ProviderStatus {
    return this.currentStatus;
  }

  connect(handlers: InteractionHandlers): void {
    this.handlers = handlers;
    this.stopped = false;
    this.open();
  }

  disconnect(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.close();
    this.socket = null;
    this.currentStatus = "disconnected";
  }

  private open(): void {
    this.currentStatus = "connecting";
    let socket: SocketLike;
    try {
      socket = this.socketFactory(this.url);
    } catch (err) {
      console.warn("[Bridge] URL inválida ou WebSocket indisponível", err);
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      this.attempts = 0;
      this.currentStatus = "connected";
      console.info("[Bridge] conectado");
    };
    socket.onmessage = (ev) => this.handleMessage(ev.data);
    socket.onerror = () => console.warn("[Bridge] erro de conexão");
    socket.onclose = () => {
      this.currentStatus = "disconnected";
      this.socket = null;
      if (!this.stopped) this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    this.currentStatus = "disconnected";
    if (this.stopped) return;
    const delay = Math.min(this.options.reconnectBaseMs * 2 ** this.attempts, this.options.reconnectMaxMs);
    this.attempts++;
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  /** Público para testes. Nunca lança exceção. */
  handleMessage(data: unknown): void {
    if (!this.handlers || typeof data !== "string") return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      this.invalidMessages++;
      return;
    }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items) {
      const event = parseInteractionEvent(item, this.limits);
      if (event) dispatchEvent(event, this.handlers);
      else this.invalidMessages++;
    }
  }
}
