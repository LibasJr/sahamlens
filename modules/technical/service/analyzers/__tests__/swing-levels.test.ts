import { describe, expect, it } from 'vitest';
import { clusterLevels, type SwingPoint } from '../swing-levels';

function point(price: number, index: number): SwingPoint {
  return { price, index, kind: index % 2 ? 'HIGH' : 'LOW' };
}

describe('clusterLevels', () => {
  it('tidak chain-merge level yang total span-nya melewati tolerance', () => {
    // 101.4 masih 1.4% dari 100. Setelah centroid bergeser ke 100.7, implementasi lama
    // juga menerima 102.1 karena hanya 1.39% dari centroid, padahal rentang 100..102.1
    // sudah 2.1%. Audit M-12: satu level tidak boleh merayap lewat chain-merging.
    const levels = clusterLevels([point(100, 0), point(101.4, 1), point(102.1, 2)], 1.5);

    expect(levels).toHaveLength(2);
    expect(levels[0].touches).toBe(2);
    expect(levels[0].price).toBeCloseTo(100.7, 8);
    expect(levels[1]).toEqual({ price: 102.1, touches: 1 });
  });

  it('tetap menggabungkan seluruh cluster bila min-max masih dalam tolerance', () => {
    const levels = clusterLevels([point(100, 0), point(100.7, 1), point(101.4, 2)], 1.5);
    expect(levels).toHaveLength(1);
    expect(levels[0].touches).toBe(3);
    expect(levels[0].price).toBeCloseTo(100.7, 8);
  });
});
