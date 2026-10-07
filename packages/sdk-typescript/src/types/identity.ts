import type {
  ForbiddenError,
  InternalServerError,
  RateLimitError,
  UnauthorizedError,
} from './shared';

export type ApiKeyIdentity = {
  /** Brands the key is narrowed to, or null when it reaches every brand in its organization. Never an empty array — a restriction to no brands is rejected at creation rather than treated as no restriction. */
  brandIds: Array<string> | null;
  createdAt: Date | null;
  /** The key's label, as given when it was issued. Null for admin keys. */
  createdBy: string | null;
  /** When the key stops working, if it has an expiry. */
  expiresAt: Date | null;
  /** `admin` for an instance key, `organization` for a dashboard-issued key. */
  keyType: 'admin' | 'organization';
  lastUsedAt: Date | null;
  /** The organization this key acts inside. Null for admin keys. */
  organizationId: string | null;
  organizationName: string | null;
  /** The key's configured limit — generous by design: it exists to stop a runaway loop, not to meter normal use. Enforcement is a fixed window and approximate under concurrency. */
  rateLimit: {
    limit: number;
    window: 'minute' | 'hour';
  } | null;
  /** Scopes this key holds. A read-write key lists both; an admin key always does. */
  scopes: Array<'read' | 'write'>;
};

export type GetMeErrors = {
  /** Authentication required */
  401: UnauthorizedError;
  /** The key is valid but not permitted: a missing scope, an admin-only endpoint, or a write in read-only (demo) mode. */
  403: ForbiddenError;
  /** Per-key rate limit exceeded. */
  429: RateLimitError;
  /** Internal server error */
  500: InternalServerError;
};

export type GetMeResponses = {
  /** Describe the calling key */
  200: ApiKeyIdentity;
};

export type GetMeResponse = GetMeResponses[keyof GetMeResponses];
