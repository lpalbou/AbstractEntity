/**
 * The no-image rule is a leaf module (no_image.ts), so no load order can see it undefined (review round
 * 6b F6: verbatim_view -> episode_view -> words_line -> verbatim_view is an import cycle; entered at
 * verbatim_view, as timeline -> graph_canvas does, words_line used to build its props before the rule
 * existed: undefined under vitest, a TDZ ReferenceError in a native ESM bundle). This file enters the
 * cycle at verbatim_view on purpose.
 */
import { describe, expect, it } from "vitest";

import { NO_IMAGE } from "./verbatim_view";
import { NO_IMAGE_PROPS } from "./words_line";

describe("the no-image rule whatever the load order", () => {
  it("entered at verbatim_view, the kit components' props still carry the rule", () => {
    expect(typeof NO_IMAGE).toBe("function");
    expect(NO_IMAGE_PROPS.inlineImage).toBe(NO_IMAGE);
    expect(NO_IMAGE_PROPS.inlineImage()).toBe(false);
    expect(NO_IMAGE_PROPS.images).toBe("link");
  });
});
