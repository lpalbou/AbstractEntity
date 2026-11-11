/**
 * The no-image rule, in a leaf module (no import), so no load order can see it undefined (review round
 * 6b F6: verbatim_view -> episode_view -> words_line -> verbatim_view is an import cycle, and words_line
 * builds NO_IMAGE_PROPS when it loads).
 *
 * No image in text a model or a page wrote is ever loaded — not even a same-origin one: the app's /api
 * proxy carries the operator's session, so an image pointing at a diary record would read it and the
 * gateway would mark that read in his biography (adversarial review 2026-11-07). Every image renders as
 * a link.
 */
export const NO_IMAGE = (): boolean => false;

/** The same image rule as `Words`, for the kit components that draw Markdown themselves
 * (ChatMessageCard, AvatarConversation's cards): every image is a link, none ever loads. Spread it on
 * the component or into its message props. */
export const NO_IMAGE_PROPS = { images: "link", inlineImage: NO_IMAGE } as const;
