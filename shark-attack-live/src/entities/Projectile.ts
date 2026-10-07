let nextProjectileId = 1;

export class Projectile {
  readonly id = nextProjectileId++;
  dead = false;

  constructor(
    public x: number,
    public y: number,
    public vx: number,
    public vy: number,
    public readonly damage: number,
    public readonly radius: number,
    public life: number,
    /** Arpão do comando ATAQUE (cor diferente). */
    public readonly special = false,
  ) {}

  update(dt: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  get angle(): number {
    return Math.atan2(this.vy, this.vx);
  }
}
