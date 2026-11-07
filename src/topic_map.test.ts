/**
 * Topic communities — when the graph asks the door again (the fetch side
 * of the topics feature; the compute is runtime's, pinned there; the
 * geometry is topic_layout.test.ts).
 */
import { describe, expect, it } from "vitest";

import { COMMUNITIES_REFRESH_MS, communitiesRefetchDelay } from "./topic_map";

describe("communitiesRefetchDelay", () => {
  const t = 1_000_000;
  it("asks again only when the life grew past the last answer", () => {
    expect(communitiesRefetchDelay({ nodeCount: 100, countAtFetch: 100, lastFetchAt: t, now: t + 10 * COMMUNITIES_REFRESH_MS })).toBeNull();
    expect(communitiesRefetchDelay({ nodeCount: 99, countAtFetch: 100, lastFetchAt: t, now: t })).toBeNull(); // scrubbed back
  });

  it("never sooner than the refresh floor", () => {
    expect(communitiesRefetchDelay({ nodeCount: 101, countAtFetch: 100, lastFetchAt: t, now: t + COMMUNITIES_REFRESH_MS })).toBe(0);
    expect(communitiesRefetchDelay({ nodeCount: 101, countAtFetch: 100, lastFetchAt: t, now: t + 30_000 })).toBe(COMMUNITIES_REFRESH_MS - 30_000);
  });
});
