/**
 * Shared simulation clock for the Assimilation Lens timeline.
 * t is normalized 0..1 across the observation time range.
 * Lives outside React state so useFrame loops drive it at 60fps.
 */
export const simClock = {
  t: 0,
  playing: false,
  speed: 1 as 0.5 | 1 | 2 | 4,
  /** full sweep duration in seconds at speed 1 */
  periodSec: 24,

  /** advance if playing; wrap at 1 */
  advance(dt: number): void {
    if (!this.playing) return
    this.t += (dt * this.speed) / this.periodSec
    if (this.t > 1) this.t = 0
  },

  /** map clock onto an epoch-ms range */
  normalized(min: number, max: number): number {
    void min
    void max
    return Math.min(1, Math.max(0, this.t))
  },
}
