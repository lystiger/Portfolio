export class WindSystem {
  static sample(time: number): { strength: number; gust: number } {
    // Multi-frequency sinusoidal synthesis
    const base = Math.sin(time * 0.7) * 0.6 + Math.sin(time * 1.5 + 1.2) * 0.3;
    const micro = Math.sin(time * 3.2 + 0.4) * 0.1;
    const strength = base + micro;
    const gust = Math.max(0, Math.sin(time * 0.35 - 0.8)) * 0.4;
    return { strength, gust };
  }
}
