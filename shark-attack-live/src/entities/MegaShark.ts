import type { GameConfig } from "../config/gameConfig";
import { Shark } from "./Shark";

/** Só aparece por evento especial. Faz investidas periódicas. */
export class MegaShark extends Shark {
  private chargeTimer: number;
  private chargeLeft = 0;

  constructor(
    private readonly megaConfig: GameConfig["megaShark"],
    stats: GameConfig["sharks"]["mega"],
    x: number,
    y: number,
    owner?: string,
  ) {
    super("mega", stats, x, y, owner);
    this.chargeTimer = megaConfig.chargeInterval;
  }

  get charging(): boolean {
    return this.chargeLeft > 0;
  }

  protected override currentSpeed(speedMultiplier: number): number {
    const base = super.currentSpeed(speedMultiplier);
    return this.charging ? base * this.megaConfig.chargeSpeedMultiplier : base;
  }

  override update(dt: number, targetX: number, targetY: number, speedMultiplier: number, knockbackDecay: number): void {
    if (this.chargeLeft > 0) {
      this.chargeLeft -= dt;
    } else {
      this.chargeTimer -= dt;
      if (this.chargeTimer <= 0) {
        this.chargeTimer = this.megaConfig.chargeInterval;
        this.chargeLeft = this.megaConfig.chargeDuration;
      }
    }
    super.update(dt, targetX, targetY, speedMultiplier, knockbackDecay);
  }
}
