export interface FeeCalculation {
  execute(): Promise<unknown>;
}

export class FeeMonitor {
  private running = false;
  private pending = false;

  constructor(private readonly calculate: FeeCalculation) {}

  async trigger(): Promise<void> {
    if (this.running) {
      this.pending = true;
      return;
    }

    this.running = true;
    try {
      do {
        this.pending = false;
        await this.calculate.execute();
      } while (this.pending);
    } finally {
      this.running = false;
    }
  }
}
