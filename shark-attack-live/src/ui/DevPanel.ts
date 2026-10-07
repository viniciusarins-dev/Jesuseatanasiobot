import type { MockInteractionProvider } from "../interactions/MockInteractionProvider";
import type { InteractionProvider } from "../interactions/types";

export interface DevPanelDeps {
  mock: MockInteractionProvider;
  providers: InteractionProvider[];
  onToggleStream: () => void;
  onToggleMute: () => boolean;
  onForceGameOver: () => void;
  /** Informações técnicas exibidas só no modo desenvolvedor. */
  debugInfo: () => Record<string, string | number>;
}

const RANDOM_NAMES = ["João", "Maria", "Pedro", "Ana", "Lucas", "Carla", "Rafa", "Bia", "Gui", "Leo"];

/**
 * Controles de teste (DOM). Os botões geram os MESMOS eventos que o provedor
 * externo enviará — via MockInteractionProvider.
 */
export class DevPanel {
  private readonly nameInput: HTMLInputElement;
  private readonly debugBox: HTMLElement;
  private debugTimer: ReturnType<typeof setInterval> | null = null;

  constructor(root: HTMLElement, private readonly deps: DevPanelDeps) {
    root.innerHTML = "";
    root.append(this.heading("🛠️ DEVELOPER MODE"));

    const label = document.createElement("label");
    label.textContent = "Nome do jogador:";
    label.htmlFor = "dev-username";
    this.nameInput = document.createElement("input");
    this.nameInput.id = "dev-username";
    this.nameInput.value = "Jesus";
    this.nameInput.maxLength = 40;
    this.nameInput.autocomplete = "off";
    const random = this.button("🎲 Nome aleatório", () => {
      this.nameInput.value = RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
    }, "secondary");
    root.append(label, this.nameInput, random);

    root.append(this.heading("Eventos simulados"));
    const { mock } = deps;
    const name = () => this.nameInput.value;
    root.append(
      this.button("+ SEGUIDOR", () => mock.follow(name()), "", "follow"),
      this.button("+ 100 CURTIDAS", () => mock.like(100, name()), "", "like"),
      this.button("COMENTÁRIO: ATAQUE", () => mock.comment(name(), "ATAQUE"), "", "comment-attack"),
      this.button("COMENTÁRIO: ESCUDO", () => mock.comment(name(), "ESCUDO"), "", "comment-shield"),
      this.button("🌹 PRESENTE", () => mock.gift(name(), "rose"), "", "gift-rose"),
      this.button("💎 PRESENTE MÉDIO", () => mock.gift(name(), "diamond"), "", "gift-diamond"),
      this.button("🎁 PRESENTE GRANDE", () => mock.gift(name(), "giftbox"), "", "gift-giftbox"),
      this.button("👑 PRESENTE RARO", () => mock.gift(name(), "crown"), "", "gift-crown"),
    );

    root.append(this.heading("Testes"));
    root.append(
      this.button("⚡ Estresse: 50 eventos", () => this.stress(), "secondary", "stress"),
      this.button("💀 Forçar GAME OVER", deps.onForceGameOver, "secondary", "force-gameover"),
    );

    root.append(this.heading("Transmissão"));
    const mute = this.button("🔊 Som: ligado", () => {
      const muted = deps.onToggleMute();
      mute.textContent = muted ? "🔇 Som: desligado" : "🔊 Som: ligado";
    }, "secondary", "mute");
    root.append(
      mute,
      this.button("📺 Ativar STREAM MODE", deps.onToggleStream, "secondary", "stream"),
      this.hint("Volta ao modo dev: Ctrl+Shift+D"),
    );

    this.debugBox = document.createElement("pre");
    this.debugBox.className = "debug";
    root.append(this.heading("Diagnóstico"), this.debugBox);
  }

  startDebugUpdates(): void {
    if (this.debugTimer) return;
    const refresh = () => {
      const info = this.deps.debugInfo();
      const providers = this.deps.providers.map((p) => `${p.name}: ${p.status}`);
      this.debugBox.textContent = [...Object.entries(info).map(([k, v]) => `${k}: ${v}`), ...providers].join("\n");
    };
    refresh();
    this.debugTimer = setInterval(refresh, 500);
  }

  stopDebugUpdates(): void {
    if (this.debugTimer) clearInterval(this.debugTimer);
    this.debugTimer = null;
  }

  private stress(): void {
    const { mock } = this.deps;
    const gifts = ["rose", "rose", "rose", "diamond", "giftbox"];
    for (let i = 0; i < 50; i++) {
      const user = RANDOM_NAMES[i % RANDOM_NAMES.length];
      const roll = i % 5;
      if (roll === 0) mock.follow(user);
      else if (roll === 1) mock.like(37, user);
      else if (roll === 2) mock.comment(user, "ataque!!");
      else mock.gift(user, gifts[i % gifts.length]);
    }
  }

  private heading(textContent: string): HTMLElement {
    const h = document.createElement("h3");
    h.textContent = textContent;
    return h;
  }

  private hint(textContent: string): HTMLElement {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = textContent;
    return p;
  }

  private button(label: string, onClick: () => unknown, variant = "", testId = ""): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    if (variant) b.className = variant;
    if (testId) b.dataset.testid = testId;
    b.addEventListener("click", () => {
      onClick();
    });
    return b;
  }
}
