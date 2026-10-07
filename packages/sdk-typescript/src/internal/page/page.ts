import { awaitedResult } from '../core/call-promise';
import type { Client } from '../core/client';
import { ApiError, ElmoError } from '../core/errors';
import { LazyPromise, unattended } from '../core/lazy-promise';
import type {
  CallableDescriptor,
  ErrorMode,
  PageEnvelope,
  PageResult,
  PaginationDescriptor,
  PaginationStyle,
  ResolvedOptions,
  Result,
} from '../core/types';

/**
 * One page of a paginated call.
 *
 * Iterating a page walks from it to the end of the collection, so iterating the
 * first one covers everything.
 */
export interface Page<TItem = unknown, TBody = unknown> extends AsyncIterable<TItem> {
  /** The whole reply body, counts and all. */
  readonly body: TBody;
  /** The items on this page, read out of the body. */
  readonly data: ReadonlyArray<TItem>;
  /** The next page. Throws if `hasNextPage()` is `false`. */
  getNextPage(): Promise<Page<TItem, TBody>>;
  /** Whether a page follows this one. It sends no request: this page's reply holds the answer. */
  hasNextPage(): boolean;
  /**
   * Where the page after this one begins, or `undefined` when none follows: a
   * cursor, an offset, a page number or a link. Pass it back as `pageParam` to
   * resume from a stored position.
   */
  readonly nextPageParam: unknown;
  /** The HTTP status of the reply that carried this page. */
  readonly status: number;
}

interface Walk {
  readonly cursor: unknown;
  readonly descriptor: CallableDescriptor;
  readonly options: ResolvedOptions;
  readonly position: number;
}

function readPath(value: unknown, path: string | undefined): unknown {
  if (!path) return value;
  let current = value;
  for (const key of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function readItems(data: unknown, pagination: PaginationDescriptor): ReadonlyArray<unknown> {
  const items = readPath(data, pagination.items);
  return Array.isArray(items) ? items : [];
}

function withPosition(
  options: ResolvedOptions,
  pagination: PaginationDescriptor,
  value: unknown,
): ResolvedOptions {
  const name = pagination.param;
  if (!name) return options;
  if ((pagination.in ?? 'query') === 'body') {
    return { ...options, body: { ...(options.body as object | undefined), [name]: value } };
  }
  return { ...options, query: { ...options.query, [name]: value } };
}

function resumeAt(walk: Walk, pagination: PaginationDescriptor, param: unknown): Walk {
  if (pagination.style === 'link') {
    const options = { ...walk.options };
    delete options.query;
    return { ...walk, descriptor: { ...walk.descriptor, address: param as string }, options };
  }
  const options = withPosition(walk.options, pagination, param);
  if (pagination.style === 'cursor') return { ...walk, cursor: param, options };
  return { ...walk, options, position: param as number };
}

function readCount(data: unknown, path: string | undefined): number | undefined {
  if (!path) return undefined;
  const value = readPath(data, path);
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return value;
}

function startOf(pagination: PaginationDescriptor): number {
  return pagination.start ?? (pagination.style === 'page' ? 1 : 0);
}

function stepCounted(
  walk: Walk,
  pagination: PaginationDescriptor,
  result: Result,
  count: number,
  limit: number | undefined,
): unknown {
  if (!count) return undefined;

  const size = readCount(result.data, pagination.size) ?? limit;
  const position = walk.position + (pagination.style === 'page' ? 1 : size || count);
  const start = startOf(pagination);

  const pages = pagination.style === 'page' ? readCount(result.data, pagination.pages) : undefined;
  const total = readCount(result.data, pagination.total);
  if (pages === undefined && total === undefined && size !== undefined && count < size) {
    return undefined;
  }
  if (pages !== undefined && position - start >= pages) return undefined;
  if (total !== undefined) {
    const read = pagination.style === 'page' ? (position - start) * (size ?? count) : position;
    if (read >= total) return undefined;
  }

  return position;
}

type Stepper = (
  walk: Walk,
  pagination: PaginationDescriptor,
  result: Result,
  count: number,
  limit: number | undefined,
) => unknown;

const STEPPERS: Partial<Readonly<Record<PaginationStyle, Stepper>>> = { page: stepCounted };

function saysMore(data: unknown, pagination: PaginationDescriptor): boolean {
  return !pagination.more || readPath(data, pagination.more) !== false;
}

function stepWalk(
  walk: Walk,
  pagination: PaginationDescriptor,
  result: Result,
  count: number,
  limit: number | undefined,
): unknown {
  const step = STEPPERS[pagination.style];
  if (!step) {
    throw new ElmoError(
      `Cannot walk "${walk.descriptor.address}": this client does not page by "${pagination.style}".`,
    );
  }
  if (!saysMore(result.data, pagination)) return undefined;
  return step(walk, pagination, result, count, limit);
}

async function* walkFrom<TItem>(page: Page<TItem>, maxPages: number): AsyncGenerator<TItem> {
  let current = page;
  for (let index = 1; ; index++) {
    for (const item of current.data) yield item;
    if (index >= maxPages || !current.hasNextPage()) return;
    current = await current.getNextPage();
  }
}

async function loadPage<TItem, TBody>(
  client: Client,
  walk: Walk,
  pagination: PaginationDescriptor,
  limit: number | undefined,
  maxPages: number,
): Promise<Page<TItem, TBody>> {
  const result = (await client.call(walk.descriptor, walk.options)) as Result;
  if (result.error !== undefined) throw result.error;

  const data = readItems(result.data, pagination) as ReadonlyArray<TItem>;
  const param = stepWalk(walk, pagination, result, data.length, limit);

  const page: Page<TItem, TBody> = {
    [Symbol.asyncIterator]: () => walkFrom(page, maxPages),
    body: result.data as TBody,
    data,
    getNextPage: () => {
      if (param === undefined) {
        return Promise.reject(
          new ElmoError(
            `"${walk.descriptor.address}" has no page after this one. Check \`hasNextPage()\` first.`,
          ),
        );
      }
      return loadPage<TItem, TBody>(
        client,
        resumeAt(walk, pagination, param),
        pagination,
        limit,
        maxPages,
      );
    },
    hasNextPage: () => param !== undefined,
    nextPageParam: param,
    status: result.status as number,
  };

  return page;
}

const DEFAULT_MAX_PAGES = 1000;

function maxPagesFor(client: Client, options: ResolvedOptions): number {
  return (options['maxPages'] ?? client.setup.defaults['maxPages'] ?? DEFAULT_MAX_PAGES) as number;
}

function openedAt(options: ResolvedOptions, pagination: PaginationDescriptor): unknown {
  if (!pagination.param) return undefined;
  const layer = options[pagination.in ?? 'query'] as Record<string, unknown> | undefined;
  return layer?.[pagination.param];
}

function paginationOf(callable: CallableDescriptor): PaginationDescriptor {
  if (callable.pagination) return callable.pagination;
  throw new ElmoError(`"${callable.address}" is not a paged call, so it has no pages to walk.`);
}

function openWalk(callable: CallableDescriptor, options: ResolvedOptions): Walk {
  const pagination = paginationOf(callable);
  const opened = openedAt(options, pagination);
  return {
    cursor: pagination.style === 'cursor' ? opened : undefined,
    descriptor: callable,
    options: { ...options, raw: true },
    position: typeof opened === 'number' && Number.isFinite(opened) ? opened : startOf(pagination),
  };
}

function pageStream<TItem, TBody>(
  load: () => Promise<Page<TItem, TBody>>,
  maxPages: number,
): AsyncIterable<Page<TItem, TBody>> {
  return {
    async *[Symbol.asyncIterator](): AsyncGenerator<Page<TItem, TBody>> {
      let current = await load();
      for (let index = 1; ; index++) {
        yield current;
        if (index >= maxPages || !current.hasNextPage()) return;
        current = await current.getNextPage();
      }
    },
  };
}

function requestedLimit(
  options: ResolvedOptions,
  pagination: PaginationDescriptor,
): number | undefined {
  if (!pagination.limitParam) return undefined;
  const layer = options[pagination.in ?? 'query'] as Record<string, unknown> | undefined;
  const limit = Number(layer?.[pagination.limitParam]);
  return Number.isFinite(limit) && limit > 0 ? limit : undefined;
}

/**
 * A paginated call already sent. Awaiting it gives the first page, or its
 * result envelope under the `'return'` error mode. Iterating it gives every
 * item across every page, and throws a failed page under either mode. Both
 * read the same request.
 */
export class PagePromise<
  TItem = unknown,
  TBody = unknown,
  TErrors = unknown,
  TAwaited = Page<TItem, TBody>,
  TMode extends ErrorMode = 'throw',
>
  extends LazyPromise<PageResult<TAwaited, TErrors, TMode>>
  implements AsyncIterable<TItem>
{
  private envelope: Promise<PageEnvelope<TAwaited, TErrors>> | undefined;

  private readonly callable: CallableDescriptor;
  private readonly client: Client;
  private readonly limit: number | undefined;
  private readonly maxPages: number;
  private readonly options: ResolvedOptions;
  private readonly pagination: PaginationDescriptor;
  private readonly project: (page: Page<TItem, TBody>) => TAwaited;

  private readonly first: Promise<Page<TItem, TBody>>;

  constructor(
    client: Client,
    callable: CallableDescriptor,
    options: ResolvedOptions,
    project: (page: Page<TItem, TBody>) => TAwaited,
  ) {
    super();
    this.callable = callable;
    this.client = client;
    this.options = options;
    this.pagination = paginationOf(callable);
    this.limit = requestedLimit(options, this.pagination);
    this.maxPages = maxPagesFor(client, options);
    this.project = project;
    const opened = openWalk(this.callable, this.options);
    const param = options['pageParam'];
    this.first = unattended(
      loadPage<TItem, TBody>(
        this.client,
        param === undefined ? opened : resumeAt(opened, this.pagination, param),
        this.pagination,
        this.limit,
        this.maxPages,
      ),
    );
  }

  /** Every item, page after page, up to `maxPages`. */
  async *[Symbol.asyncIterator](): AsyncGenerator<TItem> {
    yield* walkFrom(await this.first, this.maxPages);
  }

  /** The pages themselves, for reading what each one carries beside its items. */
  iterPages(): AsyncIterable<Page<TItem, TBody>> {
    return pageStream(() => this.first, this.maxPages);
  }

  /** The whole result envelope. A failure is returned on it, not thrown. */
  result(): Promise<PageEnvelope<TAwaited, TErrors>> {
    return (this.envelope ??= this.read());
  }

  /** The page alone, with a failure thrown rather than handed back. */
  async unwrap(): Promise<TAwaited> {
    const result = await this.result();
    if (result.ok === false) throw result.error;
    return result.data;
  }

  private async read(): Promise<PageEnvelope<TAwaited, TErrors>> {
    try {
      const page = await this.first;
      return { data: this.project(page), ok: true, status: page.status };
    } catch (error) {
      if (!(error instanceof ElmoError)) throw error;
      const status = error instanceof ApiError ? error.status : undefined;
      return { error, ok: false, status } as PageEnvelope<TAwaited, TErrors>;
    }
  }

  protected override settle(): Promise<PageResult<TAwaited, TErrors, TMode>> {
    return this.result().then((result) => awaitedResult(this.client, this.options, result));
  }
}

export function pages<
  TItem = unknown,
  TBody = unknown,
  TErrors = unknown,
  TMode extends ErrorMode = 'throw',
>(
  client: Client,
  callable: CallableDescriptor,
  options: ResolvedOptions = {},
): PagePromise<TItem, TBody, TErrors, Page<TItem, TBody>, TMode> {
  return new PagePromise<TItem, TBody, TErrors, Page<TItem, TBody>, TMode>(
    client,
    callable,
    options,
    (page) => page,
  );
}
