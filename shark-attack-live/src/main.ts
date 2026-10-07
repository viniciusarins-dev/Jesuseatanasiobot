import "./style.css";
import { AudioManager } from "./audio/AudioManager";
import { AUDIO_CONFIG } from "./config/audioConfig";
import { GAME_CONFIG } from "./config/gameConfig";
import { LIVE_CONFIG } from "./config/liveConfig";
import { Game } from "./game/Game";
import { GameLoop } from "./game/GameLoop";
import { InteractionManager } from "./interactions/InteractionManager";
import { MockInteractionProvider } from "./interactions/MockInteractionProvider";
import { TikTokInteractionProvider } from "./interactions/TikTokInteractionProvider";
import type { InteractionProvider } from "./interactions/types";
import { InMemoryLeaderboardStore } from "./store/LeaderboardStore";
import { DevPanel } from "./ui/DevPanel";
import { readModeFromUrl, type AppMode } from "./utils/mode";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const panelRoot = document.getElementById("dev-panel") as HTMLElement;
canvas.width = GAME_CONFIG.canvas.width;
canvas.height = GAME_CONFIG.canvas.height;
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("Canvas 2D indisponível neste navegador");

// ---- Núcleo -------------------------------------------------------------------
const audio = new AudioManager(AUDIO_CONFIG, import.meta.env.BASE_URL);
const store = new InMemoryLeaderboardStore();
const game = new Game(GAME_CONFIG, LIVE_CONFIG, audio, store);
const interactions = new InteractionManager(game, store, GAME_CONFIG.interactions, LIVE_CONFIG);

// ---- Provedores de eventos ------------------------------------------------------
const limits = {
  maxUsernameLength: GAME_CONFIG.interactions.maxUsernameLength,
  maxGiftCount: GAME_CONFIG.interactions.maxGiftCount,
};
const mock = new MockInteractionProvider(limits);
mock.connect(interactions);
const providers: InteractionProvider[] = [mock];

// Provedor externo só é ativado se a URL do bridge estiver configurada (.env).
const bridgeUrl = (import.meta.env.VITE_EVENT_BRIDGE_URL as string | undefined)?.trim();
if (bridgeUrl) {
  const bridge = new TikTokInteractionProvider(bridgeUrl, limits);
  bridge.connect(interactions);
  providers.push(bridge);
}

// ---- Loop -----------------------------------------------------------------------
const loop = new GameLoop(
  GAME_CONFIG.loop,
  (dt) => {
    interactions.process(dt);
    game.update(dt);
  },
  () => game.render(ctx),
);
loop.start();

// ---- Modo DEV / STREAM ----------------------------------------------------------
let mode: AppMode = readModeFromUrl(window.location.search);
const devPanel = new DevPanel(panelRoot, {
  mock,
  providers,
  onToggleStream: () => applyMode("stream"),
  onToggleMute: () => audio.toggleMute(),
  onForceGameOver: () => game.debugKillPlayer(),
  debugInfo: () => ({
    FPS: loop.fps,
    Fase: game.state.phase,
    Rodada: game.state.roundNumber,
    Nível: game.difficulty.level,
    Tubarões: game.state.sharks.length,
    "Na fila": game.queuedSharks,
    "Eventos pendentes": interactions.pendingCount,
    "Eventos descartados": interactions.droppedEvents,
    Partículas: game.effects.particleCount,
    Áudio: audio.isUnlocked ? "ativo" : "aguardando clique",
  }),
});

function applyMode(next: AppMode): void {
  mode = next;
  document.body.classList.toggle("stream-mode", mode === "stream");
  if (mode === "dev") devPanel.startDebugUpdates();
  else devPanel.stopDebugUpdates();
}
applyMode(mode);

window.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "d") {
    e.preventDefault();
    applyMode(mode === "dev" ? "stream" : "dev");
  }
});

// ---- Áudio ------------------------------------------------------------------------
// Navegadores exigem interação para liberar som; no OBS normalmente já é liberado.
audio.unlock();
const unlockAudio = () => audio.unlock();
window.addEventListener("pointerdown", unlockAudio);
window.addEventListener("keydown", unlockAudio);

// Acesso pelo console (somente modo dev): sharkGame.mock.gift("Ana", "crown")
if (mode === "dev") {
  (window as unknown as Record<string, unknown>).sharkGame = { game, mock, interactions, store };
}
