/**
 * Mock for @/server/citations used in Storybook stories. The real module
 * imports pg via @workspace/lib/db, which is not browser-safe.
 */

export const getCitationsFn = async (..._args: unknown[]) => undefined;
export const getCitationUrlsFn = async (..._args: unknown[]) => ({ items: [], total: 0 });
export const getCitationDomainsFn = async (..._args: unknown[]) => ({ items: [], total: 0 });
