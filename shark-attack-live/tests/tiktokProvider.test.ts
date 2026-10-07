import { afterEach, describe, expect, it, vi } from "vitest";
import { TikTokInteractionProvider } from "../src/interactions/TikTokInteractionProvider";
import type { InteractionHandlers } from "../src/interactions/types";

class FakeSocket {
  onopen: ((ev: Event) => unknown) | null = null;
  onclose: ((ev: CloseEvent) => unknown) | null = null;
  onerror: ((ev: Event) => unknown) | null = null;
  onmessage: ((ev: MessageEvent) => unknown) | null = null;
  closed = false;
  close() { this.closed = true; }
}

const limits = { maxUsernameLength: 18, maxGiftCount: 50 };

function setup() {
  const sockets: FakeSocket[] = [];
  const received: string[] = [];
  const handlers: InteractionHandlers = {
    onFollow: (e) => received.push(`follow:${e.username}`),
    onLike: (e) => received.push(`like:${e.amount}`),
    onComment: (e) => received.push(`comment:${e.message}`),
    onGift: (e) => received.push(`gift:${e.gift}`),
  };
  const provider = new TikTokInteractionProvider("ws://bridge", limits, { reconnectBaseMs: 100, reconnectMaxMs: 400 }, () => {
    const s = new FakeSocket();
    sockets.push(s);
    return s;
  });
  provider.connect(handlers);
  return { provider, sockets, received };
}

afterEach(() => vi.useRealTimers());

describe("TikTokInteractionProvider (bridge)", () => {
  it("valida e despacha mensagens normalizadas, inclusive arrays", () => {
    const { provider, sockets, received } = setup();
    sockets[0].onopen?.(new Event("open"));
    expect(provider.status).toBe("connected");
    provider.handleMessage(JSON.stringify({ type: "gift", username: "Ana", gift: "rose" }));
    provider.handleMessage(JSON.stringify([{ type: "follow", username: "Bia" }, { type: "like", amount: 5 }]));
    expect(received).toEqual(["gift:rose", "follow:Bia", "like:5"]);
  });

  it("ignora lixo sem lançar exceção", () => {
    const { provider, received } = setup();
    provider.handleMessage("não é json");
    provider.handleMessage(JSON.stringify({ type: "gift" }));
    provider.handleMessage(42);
    expect(received).toEqual([]);
    expect(provider.invalidMessages).toBe(2);
  });

  it("reconecta com backoff e para ao desconectar", () => {
    vi.useFakeTimers();
    const { provider, sockets } = setup();
    sockets[0].onclose?.({} as CloseEvent);
    expect(provider.status).toBe("disconnected");
    vi.advanceTimersByTime(100);
    expect(sockets).toHaveLength(2);
    sockets[1].onclose?.({} as CloseEvent);
    vi.advanceTimersByTime(199);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);
    provider.disconnect();
    expect(sockets[2].closed).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(sockets).toHaveLength(3);
  });
});
