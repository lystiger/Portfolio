export interface ActivityState {
  lastInteractionTime: number;
  isHeroVisible: boolean;
  isTabVisible: boolean;
  markInteraction: () => void;
  isInteractive: () => boolean;
}

export const activityState: ActivityState = {
  lastInteractionTime: typeof performance !== 'undefined' ? performance.now() : 0,
  isHeroVisible: true,
  isTabVisible: true,
  markInteraction() {
    this.lastInteractionTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  },
  isInteractive() {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return (now - this.lastInteractionTime) < 500;
  }
};
