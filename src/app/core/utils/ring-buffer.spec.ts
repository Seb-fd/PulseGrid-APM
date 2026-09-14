import { describe, expect, it } from 'vitest';
import { RingBuffer } from './ring-buffer';

describe('GIVEN a RingBuffer', () => {
  it('WHEN created with invalid capacity THEN throws RangeError', () => {
    expect(() => new RingBuffer(0)).toThrow(RangeError);
    expect(() => new RingBuffer(-3)).toThrow(RangeError);
    expect(() => new RingBuffer(1.5)).toThrow(RangeError);
  });

  it('WHEN empty THEN reports size 0 and undefined peeks', () => {
    const rb = new RingBuffer<number>(3);
    expect(rb.size).toBe(0);
    expect(rb.isEmpty).toBe(true);
    expect(rb.isFull).toBe(false);
    expect(rb.toArray()).toEqual([]);
    expect(rb.peekOldest()).toBeUndefined();
    expect(rb.peekNewest()).toBeUndefined();
    expect(rb.last(2)).toEqual([]);
  });

  it('WHEN pushing under capacity THEN preserves insertion order', () => {
    const rb = new RingBuffer<number>(3);
    rb.push(1);
    rb.push(2);
    expect(rb.toArray()).toEqual([1, 2]);
    expect(rb.peekOldest()).toBe(1);
    expect(rb.peekNewest()).toBe(2);
    expect(rb.size).toBe(2);
  });

  it('WHEN overflowing THEN evicts oldest FIFO without growth', () => {
    const rb = new RingBuffer<number>(3);
    rb.pushMany([1, 2, 3, 4, 5]);
    expect(rb.size).toBe(3);
    expect(rb.isFull).toBe(true);
    expect(rb.toArray()).toEqual([3, 4, 5]);
    expect(rb.peekOldest()).toBe(3);
    expect(rb.peekNewest()).toBe(5);
  });

  it('WHEN wrapping many times THEN stays bounded and ordered', () => {
    const rb = new RingBuffer<number>(4);
    for (let i = 0; i < 100; i++) rb.push(i);
    expect(rb.toArray()).toEqual([96, 97, 98, 99]);
  });

  it('WHEN last(n) requested THEN returns newest N oldest-first', () => {
    const rb = new RingBuffer<number>(5);
    rb.pushMany([10, 20, 30, 40]);
    expect(rb.last(2)).toEqual([30, 40]);
    expect(rb.last(10)).toEqual([10, 20, 30, 40]);
    expect(rb.last(0)).toEqual([]);
    expect(rb.last(-1)).toEqual([]);
  });

  it('WHEN cleared THEN resets to empty', () => {
    const rb = new RingBuffer<string>(2);
    rb.pushMany(['a', 'b', 'c']);
    rb.clear();
    expect(rb.size).toBe(0);
    expect(rb.toArray()).toEqual([]);
    rb.push('z');
    expect(rb.toArray()).toEqual(['z']);
  });

  it('WHEN capacity is 1 THEN keeps only newest', () => {
    const rb = new RingBuffer<number>(1);
    rb.push(1);
    rb.push(2);
    expect(rb.toArray()).toEqual([2]);
  });
});
