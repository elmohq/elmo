/**
 * Mock for @tanstack/react-start used in Ladle stories.
 * Stubs out server-only APIs (createServerFn, createMiddleware, etc.)
 * so components that transitively import them can still render.
 */

export const createServerFn = () => () => {};
export const createMiddleware = () => ({ server: () => ({}) });
export const createStart = () => ({});
export const getRequestHeaders = () => ({});
export default {};
