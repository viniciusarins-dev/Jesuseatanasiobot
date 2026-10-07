import type { SharkType } from "../config/gameConfig";
import type { SoundName } from "../config/audioConfig";
import type { LiveStats } from "./GameState";

/**
 * O que a camada de interações pode pedir ao jogo. O InteractionManager só
 * conhece esta interface — nunca o Game diretamente nem o TikTok.
 */
export interface GameActions {
  spawnSharks(type: SharkType, count: number, owner?: string): void;
  healPlayer(amount: number): void;
  shieldPlayer(seconds: number): void;
  playerBurst(owner: string): void;
  addSpecialScore(points: number): void;
  addLiveStats(delta: Partial<LiveStats>): void;
  /** Curtidas acumuladas até o próximo evento de caos (para a barra de progresso). */
  setLikeProgress(current: number): void;
  showFeed(text: string, color?: string): void;
  /** `urgent`: interrompe o alerta atual (ex.: MEGA TUBARÃO). */
  showAlert(title: string, subtitle: string, color: string, urgent?: boolean): void;
  playSound(name: SoundName): void;
}
