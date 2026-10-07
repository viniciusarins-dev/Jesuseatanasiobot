import type { GameConfig } from "../config/gameConfig";

/**
 * Loop com passo fixo (física estável independente do FPS) e renderização a
 * cada quadro. Erros são registrados (com limite) e o loop continua: numa
 * LIVE, uma exceção pontual não pode congelar a tela.
 */
export class GameLoop {
  private accumulator = 0;
  private last = 0;
  private frameHandle = 0;
  private running = false;
  private frames = 0;
  private fpsTimer = 0;
  private errorCount = 0;
  fps = 0;

  constructor(
    private readonly cfg: GameConfig["loop"],
    private readonly update: (dt: number) => void,
    private readonly render: () => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.frameHandle = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    const elapsed = Math.min((now - this.last) / 1000, this.cfg.maxFrameTime);
    this.last = now;
    this.accumulator += elapsed;
    try {
      while (this.accumulator >= this.cfg.fixedStep) {
        this.update(this.cfg.fixedStep);
        this.accumulator -= this.cfg.fixedStep;
      }
      this.render();
    } catch (err) {
      this.accumulator = 0;
      if (this.errorCount++ < 20) console.error("[GameLoop] erro no quadro", err);
    }
    this.frames++;
    this.fpsTimer += elapsed;
    if (this.fpsTimer >= 1) {
      this.fps = Math.round(this.frames / this.fpsTimer);
      this.frames = 0;
      this.fpsTimer = 0;
    }
    this.frameHandle = requestAnimationFrame(this.frame);
  };
}
