import { describe, expect, it } from 'vitest';
import { haversineKm, indexLine, locateOnLine, pointAtKm, resample, simplify, type Line } from '../shared/geo.ts';

const line: Line = [[4.8357, 45.764], [4.8924, 44.9334], [4.7509, 44.5581]]; // Lyon → Valence → Montélimar

describe('geo', () => {
  it('haversine Lyon → Barcelona ≈ 530 km', () => {
    expect(haversineKm({ lat: 45.764, lng: 4.8357 }, { lat: 41.3874, lng: 2.1686 })).toBeGreaterThan(520);
    expect(haversineKm({ lat: 45.764, lng: 4.8357 }, { lat: 41.3874, lng: 2.1686 })).toBeLessThan(545);
  });

  it('locates a point on and off the route', () => {
    const il = indexLine(line);
    const onValence = locateOnLine({ lat: 44.9334, lng: 4.8924 }, il);
    expect(onValence.offRouteKm).toBeLessThan(0.01);
    expect(onValence.kmAlong).toBeCloseTo(il.cum[1]!, 1);
    const off = locateOnLine({ lat: 45.3, lng: 4.98 }, il);
    expect(off.offRouteKm).toBeGreaterThan(3);
    expect(off.offRouteKm).toBeLessThan(10);
  });

  it('pointAtKm walks the line', () => {
    const il = indexLine(line);
    const p = pointAtKm(il, il.totalKm);
    expect(p.lat).toBeCloseTo(44.5581, 4);
    expect(resample(il, 10).length).toBeGreaterThan(il.totalKm / 10);
  });

  it('simplify keeps endpoints and drops collinear points', () => {
    const l: Line = [[0, 0], [0.5, 0.0001], [1, 0], [2, 1]];
    const s = simplify(l, 0.1);
    expect(s[0]).toEqual([0, 0]);
    expect(s[s.length - 1]).toEqual([2, 1]);
    expect(s.length).toBe(3);
  });
});
