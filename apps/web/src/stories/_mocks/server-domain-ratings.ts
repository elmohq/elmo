/**
 * Mock for @/server/domain-ratings used in Storybook stories. The real module
 * imports node:sqlite + pg via the DR cache, which are not browser-safe.
 */

export const getDomainRatingsFn = async (..._args: unknown[]) => undefined;
