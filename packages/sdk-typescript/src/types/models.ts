import type {
  ForbiddenError,
  InternalServerError,
  RateLimitError,
  UnauthorizedError,
} from './shared';

export type ModelList = {
  data: Array<Model>;
};

export type Model = {
  /** Whether this deployment is actually wired to reach it. */
  configured: boolean;
  /** Identifier used by the `model` filter, e.g. `chatgpt`. */
  id: string;
  /** Human-readable name. */
  label: string;
  /** Whether this model can be tracked grounded, spending a premium pairing. */
  premiumCapable: boolean;
};

export type ListModelsErrors = {
  /** Authentication required */
  401: UnauthorizedError;
  /** The key is valid but not permitted: a missing scope, an admin-only endpoint, or a write in read-only (demo) mode. */
  403: ForbiddenError;
  /** Per-key rate limit exceeded. */
  429: RateLimitError;
  /** Internal server error */
  500: InternalServerError;
};

export type ListModelsResponses = {
  /** List trackable models */
  200: ModelList;
};

export type ListModelsResponse = ListModelsResponses[keyof ListModelsResponses];
