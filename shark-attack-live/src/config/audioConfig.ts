/**
 * Sons do jogo. Sem `file`, o som é sintetizado (WebAudio) e o jogo funciona
 * sem nenhum arquivo. Para trocar, coloque o arquivo em `public/assets/audio/`
 * e informe o caminho, ex.: `file: "assets/audio/hit.mp3"`.
 */

export type SoundName = "hit" | "spawn" | "death" | "gift" | "special" | "heal" | "burst" | "gameover";

export interface SoundDefinition {
  file?: string;
  volume: number; // 0..1
  /** Intervalo mínimo entre repetições (evita "metralhadora" de som). */
  minIntervalMs: number;
}

export const AUDIO_CONFIG = {
  masterVolume: 0.8,
  music: { file: undefined as string | undefined, volume: 0.25 },
  sounds: {
    hit: { volume: 0.7, minIntervalMs: 90 },
    spawn: { volume: 0.25, minIntervalMs: 120 },
    death: { volume: 0.4, minIntervalMs: 60 },
    gift: { volume: 0.6, minIntervalMs: 150 },
    special: { volume: 0.8, minIntervalMs: 800 },
    heal: { volume: 0.5, minIntervalMs: 200 },
    burst: { volume: 0.6, minIntervalMs: 200 },
    gameover: { volume: 0.8, minIntervalMs: 1000 },
  } satisfies Record<SoundName, SoundDefinition>,
};
