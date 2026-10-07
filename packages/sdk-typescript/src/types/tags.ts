import type {
  ForbiddenError,
  InternalServerError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
} from './shared';

export type Tag = {
  /** The tag, normalized to lower case. */
  name: string;
  /** Prompts in this brand carrying the tag. */
  promptCount: number;
  /** True for `branded` and `unbranded`, which Elmo computes from the prompt text. A system tag always appears here; applying it to a prompt as a user tag overrides the computed classification rather than creating a new tag. */
  system: boolean;
};

export type TagList = {
  brandId: string;
  /** System tags first, then user tags alphabetically — the order the dashboard's filter shows. */
  data: Array<Tag>;
};

export type ListBrandTagsErrors = {
  /** Authentication required */
  401: UnauthorizedError;
  /** The key is valid but not permitted: a missing scope, an admin-only endpoint, or a write in read-only (demo) mode. */
  403: ForbiddenError;
  /** Resource not found */
  404: NotFoundError;
  /** Per-key rate limit exceeded. */
  429: RateLimitError;
  /** Internal server error */
  500: InternalServerError;
};

export type ListBrandTagsResponses = {
  /** List a brand's tags */
  200: TagList;
};

export type ListBrandTagsResponse = ListBrandTagsResponses[keyof ListBrandTagsResponses];
