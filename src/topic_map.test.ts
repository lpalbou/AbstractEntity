/**
 * Topic map — packing determinism and overlap-freedom (the render half
 * of the communities feature; the compute is runtime's, pinned there).
 */
import { describe, expect, it } from "vitest";

import { packCircles, type TopicCommunity } from "./topic_map";

function comm(id: number, size: number): TopicCommunity {
  return {
    id,
    label: `topic ${id}`,
    keywords: ["k"],
    exemplar_id: `ex:e${id}`,
    exemplar_title: `exemplar ${id}`,
    size,
    kinds: { episode: size },
    member_ids: Array.from({ length: size }, (_, i) => `ex:m${id}-${i}`),
  };
}

describe("packCircles", () => {
  it("is deterministic (same input, same layout)", () => {
    const cs = [comm(0, 40), comm(1, 12), comm(2, 7), comm(3, 3)];
    expect(packCircles(cs)).toEqual(packCircles(cs));
  });

  it("never overlaps bubbles", () => {
    const cs = Array.from({ length: 14 }, (_, i) => comm(i, 3 + ((i * 7) % 40)));
    const packed = packCircles(cs);
    for (let i = 0; i < packed.length; i++) {
      for (let j = i + 1; j < packed.length; j++) {
        const a = packed[i];
        const b = packed[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        expect(d).toBeGreaterThanOrEqual(a.r + b.r);
      }
    }
  });

  it("places the biggest community at the center", () => {
    const packed = packCircles([comm(5, 2), comm(9, 90), comm(1, 10)]);
    expect(packed[0].c.id).toBe(9);
    expect(packed[0].x).toBe(0);
    expect(packed[0].y).toBe(0);
  });

  it("handles empty and single inputs", () => {
    expect(packCircles([])).toEqual([]);
    const one = packCircles([comm(1, 5)]);
    expect(one).toHaveLength(1);
  });
});
