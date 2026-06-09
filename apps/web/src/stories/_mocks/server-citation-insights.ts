/**
 * Mock for @/server/citation-insights used in Storybook stories. The real module
 * imports node:sqlite + pg via the DR cache / DB, which are not browser-safe.
 */

export const getCitationInsightsFn = async (..._args: unknown[]) => undefined;
