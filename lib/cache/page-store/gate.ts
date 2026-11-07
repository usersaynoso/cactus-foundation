// A limit on how many pages may be rendered at once, with a bounded line behind it.
//
// Rendering a catalogue page is mostly JavaScript on the one thread everything else
// also needs, plus about a hundred database queries. Let two hundred start together
// and each slows the rest: memory climbs to the limit and the signed-in admin and the
// checkout wait behind them. A short line finishes the same work sooner.

export type GateLimits = {
  maxActive: number
  maxQueued: number
  maxWaitMs: number
}

// Why a place was not given. Both mean "this request does not get a render".
export type GateRefusal = 'full' | 'timeout'

type Waiter = {
  admit: () => void
  refuse: (why: GateRefusal) => void
  timer: ReturnType<typeof setTimeout>
}

export class GateRefusedError extends Error {
  constructor(readonly reason: GateRefusal) {
    super(`render gate refused: ${reason}`)
  }
}

export class RenderGate {
  private active = 0
  private readonly queue: Waiter[] = []

  constructor(private readonly limits: GateLimits) {}

  get activeCount(): number {
    return this.active
  }

  get queuedCount(): number {
    return this.queue.length
  }

  /** True when a render asked for right now would start right now. */
  get hasRoom(): boolean {
    return this.active < this.limits.maxActive && this.queue.length === 0
  }

  /** Waits for a place in line. Throws GateRefusedError if there is none to be had. */
  acquire(): Promise<void> {
    if (this.hasRoom) {
      this.active += 1
      return Promise.resolve()
    }
    if (this.queue.length >= this.limits.maxQueued) return Promise.reject(new GateRefusedError('full'))

    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        admit: () => {
          clearTimeout(waiter.timer)
          this.active += 1
          resolve()
        },
        refuse: (why) => reject(new GateRefusedError(why)),
        timer: setTimeout(() => {
          const at = this.queue.indexOf(waiter)
          if (at >= 0) this.queue.splice(at, 1)
          waiter.refuse('timeout')
        }, this.limits.maxWaitMs),
      }
      waiter.timer.unref?.()
      this.queue.push(waiter)
    })
  }

  /**
   * Background work takes a place only when nobody is waiting and it would still
   * leave room, so a refresh can never push a waiting visitor further back.
   */
  tryAcquireBackground(maxBackgroundActive: number): boolean {
    if (this.queue.length > 0 || this.active >= Math.min(maxBackgroundActive, this.limits.maxActive)) return false
    this.active += 1
    return true
  }

  release(): void {
    this.active = Math.max(0, this.active - 1)
    this.queue.shift()?.admit()
  }
}
