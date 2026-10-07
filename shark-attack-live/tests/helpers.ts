import type { SoundName } from "../src/config/audioConfig";
import type { SharkType } from "../src/config/gameConfig";
import type { GameActions } from "../src/game/GameActions";
import type { LiveStats } from "../src/game/GameState";

/** GameActions falso que registra todas as chamadas. */
export class RecordingActions implements GameActions {
  spawns: { type: SharkType; count: number; owner?: string }[] = [];
  heals: number[] = [];
  shields: number[] = [];
  bursts: string[] = [];
  special: number[] = [];
  stats: LiveStats = { followers: 0, likes: 0, gifts: 0 };
  likeProgress = 0;
  feed: string[] = [];
  alerts: string[] = [];
  sounds: SoundName[] = [];

  spawnSharks(type: SharkType, count: number, owner?: string) { this.spawns.push({ type, count, owner }); }
  healPlayer(amount: number) { this.heals.push(amount); }
  shieldPlayer(seconds: number) { this.shields.push(seconds); }
  playerBurst(owner: string) { this.bursts.push(owner); }
  addSpecialScore(points: number) { this.special.push(points); }
  addLiveStats(d: Partial<LiveStats>) {
    this.stats.followers += d.followers ?? 0;
    this.stats.likes += d.likes ?? 0;
    this.stats.gifts += d.gifts ?? 0;
  }
  setLikeProgress(current: number) { this.likeProgress = current; }
  showFeed(text: string) { this.feed.push(text); }
  urgentAlerts: string[] = [];
  showAlert(title: string, _sub: string, _color: string, urgent?: boolean) {
    this.alerts.push(title);
    if (urgent) this.urgentAlerts.push(title);
  }
  playSound(name: SoundName) { this.sounds.push(name); }
}

export const silentAudio = { play: () => undefined };

/** RNG determinístico (LCG) para testes reproduzíveis. */
export function seededRng(seed = 42): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
