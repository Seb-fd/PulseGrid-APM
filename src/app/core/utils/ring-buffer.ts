/**
 * RingBuffer<T> — fixed-capacity FIFO for streaming histories.
 * O(1) push, no Array.shift() churn, GC-friendly. Backs chart windows.
 */
export class RingBuffer<T> {
  private readonly buf: (T | undefined)[];
  private head = 0; // index of oldest
  private count = 0;

  constructor(public readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError(`RingBuffer capacity must be a positive integer, got ${capacity}`);
    }
    this.buf = new Array<T | undefined>(capacity);
  }

  get size(): number {
    return this.count;
  }

  get isFull(): boolean {
    return this.count === this.capacity;
  }

  get isEmpty(): boolean {
    return this.count === 0;
  }

  push(value: T): void {
    if (this.count < this.capacity) {
      this.buf[(this.head + this.count) % this.capacity] = value;
      this.count += 1;
    } else {
      // Overwrite oldest, advance head.
      this.buf[this.head] = value;
      this.head = (this.head + 1) % this.capacity;
    }
  }

  pushMany(values: readonly T[]): void {
    for (const v of values) this.push(v);
  }

  /** Oldest → newest snapshot. */
  toArray(): readonly T[] {
    const out: T[] = [];
    for (let i = 0; i < this.count; i++) {
      const v: T | undefined = this.buf[(this.head + i) % this.capacity];
      // Invariant: indices [head, head+count) always hold values; the guard
      // satisfies noUncheckedIndexedAccess without a non-null assertion.
      if (v !== undefined) out.push(v);
    }
    return out;
  }

  /** Newest N (or fewer), oldest → newest. */
  last(n: number): readonly T[] {
    if (n <= 0) return [];
    const take = Math.min(n, this.count);
    const out: T[] = [];
    const start = this.count - take;
    for (let i = 0; i < take; i++) {
      const v: T | undefined = this.buf[(this.head + start + i) % this.capacity];
      if (v !== undefined) out.push(v);
    }
    return out;
  }

  peekOldest(): T | undefined {
    return this.count === 0 ? undefined : this.buf[this.head];
  }

  peekNewest(): T | undefined {
    if (this.count === 0) return undefined;
    return this.buf[(this.head + this.count - 1) % this.capacity];
  }

  clear(): void {
    this.buf.fill(undefined);
    this.head = 0;
    this.count = 0;
  }
}
