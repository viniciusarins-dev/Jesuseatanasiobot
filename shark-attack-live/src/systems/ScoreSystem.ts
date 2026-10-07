import type { GameConfig } from "../config/gameConfig";
import type { Shark } from "../entities/Shark";
import type { RoundStats } from "../game/GameState";

export class ScoreSystem {
  private survivalAccumulator = 0;

  constructor(private readonly cfg: GameConfig["score"]) {}

  reset(): void {
    this.survivalAccumulator = 0;
  }

  /** Tempo sobrevivido + pontos por segundo. */
  tick(round: RoundStats, dt: number): void {
    round.survivalTime += dt;
    this.survivalAccumulator += this.cfg.perSecondSurvived * dt;
    // Epsilon evita perder 1 ponto por erro de ponto flutuante (60 × 1/60).
    const whole = Math.floor(this.survivalAccumulator + 1e-9);
    if (whole > 0) {
      round.score += whole;
      this.survivalAccumulator -= whole;
    }
  }

  addKill(round: RoundStats, shark: Shark): void {
    round.kills += 1;
    round.score += shark.scoreValue;
  }

  addSpecial(round: RoundStats, points: number): void {
    round.score += Math.max(0, Math.floor(points));
  }

  addDamageTaken(round: RoundStats, amount: number): void {
    round.damageTaken += amount;
  }
}
