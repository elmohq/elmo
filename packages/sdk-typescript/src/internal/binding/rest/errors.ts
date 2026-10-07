import { ApiError, DecodeError } from '../../core/errors';

export function unreadableBody(response: Response, cause: unknown): DecodeError {
  const where = response.url ? ` for "${response.url}"` : '';
  const contentType = response.headers.get('content-type');
  const said = contentType ? ` Its content type said "${contentType}".` : '';
  return new DecodeError(
    `The API answered ${response.status}${where} with a body this client could not read.${said}`,
    { cause, response },
  );
}

/** The API could not read the request, so it did not act on it. */
export class BadRequestError extends ApiError {
  override readonly name = 'BadRequestError';
  declare readonly status: 400;
}

/** No usable credential reached the API: it was missing, unreadable, or rejected. */
export class AuthenticationError extends ApiError {
  override readonly name = 'AuthenticationError';
  declare readonly status: 401;
}

/** The plan or the quota on this account does not cover the call. */
export class PaymentRequiredError extends ApiError {
  override readonly name = 'PaymentRequiredError';
  declare readonly status: 402;
}

/** The credential was accepted, but it does not grant this call. */
export class PermissionDeniedError extends ApiError {
  override readonly name = 'PermissionDeniedError';
  declare readonly status: 403;
}

/** Nothing is at this address, or the credential may not see what is. */
export class NotFoundError extends ApiError {
  override readonly name = 'NotFoundError';
  declare readonly status: 404;
}

/** The call collided with the resource's current state: a duplicate, or a concurrent change. */
export class ConflictError extends ApiError {
  override readonly name = 'ConflictError';
  declare readonly status: 409;
}

/** The request was read, and its contents were rejected. */
export class UnprocessableEntityError extends ApiError {
  override readonly name = 'UnprocessableEntityError';
  declare readonly status: 422;
}

/** Too many calls. {@link ApiError.retryAfter} carries how long the API asked to wait. */
export class RateLimitError extends ApiError {
  override readonly name = 'RateLimitError';
  declare readonly status: 429;
}

export type ApiErrorClass = new (
  status: number,
  body: unknown,
  response: Response,
  note?: string,
) => ApiError;

const BY_STATUS: Readonly<Record<number, ApiErrorClass>> = {
  400: BadRequestError,
  401: AuthenticationError,
  402: PaymentRequiredError,
  403: PermissionDeniedError,
  404: NotFoundError,
  409: ConflictError,
  422: UnprocessableEntityError,
  429: RateLimitError,
};

/** The API failed after accepting the call. Every status from 500 up arrives as this. */
export class InternalServerError extends ApiError {
  override readonly name = 'InternalServerError';
}

export function toApiError(
  status: number,
  error: unknown,
  response: Response,
  unauthenticated?: () => string,
): ApiError {
  const Failure = BY_STATUS[status] ?? (status >= 500 ? InternalServerError : ApiError);
  const note = status === 401 || status === 403 ? unauthenticated?.() : undefined;
  return new Failure(status, error, response, note);
}
