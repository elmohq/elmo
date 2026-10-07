import { MissingCredentialError } from '../core/errors';
import type {
  AuthRequirement,
  AuthScheme,
  AuthToken,
  Credential,
  CredentialSpec,
  CredentialValue,
  Feature,
  PlacedCredential,
  ResolvedOptions,
} from '../core/types';

export interface AuthOptions {
  readonly schemes?: Readonly<Record<string, CredentialSpec>>;
}

export function schemesOf(requirement: AuthRequirement): ReadonlyArray<AuthScheme> {
  return Array.isArray(requirement) ? requirement : [requirement as AuthScheme];
}

export function candidates(
  requirements: ReadonlyArray<AuthRequirement>,
  ..._environment: ReadonlyArray<unknown>
): ReadonlyArray<ReadonlyArray<AuthScheme>> {
  return requirements.map(schemesOf);
}

type Ask = (scheme: AuthScheme) => Promise<AuthToken>;

function formatBearer(token: string): string {
  return `Bearer ${token}`;
}

const SCHEME_FORMATS: Partial<
  Readonly<Record<NonNullable<AuthScheme['scheme']>, (token: string) => string>>
> = { bearer: formatBearer };

export function formatToken(scheme: AuthScheme, token: AuthToken, prefix?: string): AuthToken {
  if (!token) return undefined;
  if (prefix !== undefined) return `${prefix}${token}`;
  const format = scheme.scheme ? SCHEME_FORMATS[scheme.scheme] : undefined;
  return format ? format(token) : token;
}

/** What one scheme sends, given the token it was answered with. */
export function credentialFor(
  scheme: AuthScheme,
  token: AuthToken,
  options: AuthOptions | undefined,
): Credential | undefined {
  const prefix = scheme.key ? options?.schemes?.[scheme.key]?.prefix : undefined;
  const value = formatToken(scheme, token, prefix);
  if (!value) return undefined;
  return { in: scheme.in ?? 'header', name: scheme.name ?? 'Authorization', value };
}

async function credentialsFor(
  schemes: ReadonlyArray<AuthScheme>,
  ask: Ask,
  options: AuthOptions | undefined,
): Promise<ReadonlyArray<PlacedCredential> | undefined> {
  const placed: Array<PlacedCredential> = [];
  for (const scheme of schemes) {
    const credential = credentialFor(scheme, await ask(scheme), options);
    if (!credential) return undefined;
    placed.push({ credential, scheme });
  }
  return placed;
}

function keysOf(open: ReadonlyArray<ReadonlyArray<string>>): ReadonlyArray<string> {
  return [...new Set(open.flat())];
}

function labeled(key: string, options: AuthOptions | undefined): string {
  const variable = options?.schemes?.[key]?.variable;
  return variable ? `\`${key}\` (\`${variable}\`)` : `\`${key}\``;
}

function conjoined(keys: ReadonlyArray<string>, options: AuthOptions | undefined): string {
  return keys.map((key) => labeled(key, options)).join(' and ');
}

function either(alternatives: ReadonlyArray<string>): string {
  if (alternatives.length <= 2) return alternatives.join(' or ');
  return `${alternatives.slice(0, -1).join(', ')}, or ${alternatives.at(-1)}`;
}

function advice(
  open: ReadonlyArray<ReadonlyArray<string>>,
  options: AuthOptions | undefined,
): string {
  if (!open.length) return '';
  const alternatives = open.map((keys) => conjoined(keys, options));
  if (alternatives.length > 1 && open.some((keys) => keys.length > 1)) {
    return ` Either ${alternatives.map((one) => `set ${one}`).join(', or ')}.`;
  }
  return ` Set ${either(alternatives)}.`;
}

function missing(
  open: ReadonlyArray<ReadonlyArray<string>>,
  options: AuthOptions | undefined,
): string {
  return `This call needs a credential that was not set.${advice(open, options)}`;
}

function offered(
  alternatives: ReadonlyArray<ReadonlyArray<AuthScheme>>,
): ReadonlyArray<ReadonlyArray<string>> {
  return alternatives
    .map((schemes) =>
      schemes.map((scheme) => scheme.key).filter((key): key is string => key !== undefined),
    )
    .filter((keys) => keys.length > 0);
}

export function refuseRuledOut(..._ruling: ReadonlyArray<unknown>): void {}

/**
 * The credential for one scheme: what its own option holds, then whatever
 * `auth` makes of that.
 */
export async function tokenFor(
  scheme: AuthScheme,
  held: ResolvedOptions,
  options: AuthOptions | undefined,
): Promise<AuthToken> {
  const own = scheme.key !== undefined && options?.schemes?.[scheme.key]?.option !== false;
  const stated = own ? (held[scheme.key!] as CredentialValue) : undefined;
  const value = typeof stated === 'function' ? await stated() : stated;
  return typeof held.auth === 'function' ? held.auth(scheme, value) : value;
}

function unauthenticated(
  open: ReadonlyArray<ReadonlyArray<string>>,
  options: AuthOptions | undefined,
): string {
  return `This call was sent with no credential.${advice(open, options)}`;
}

export function authFeature(options?: AuthOptions): Feature {
  return {
    name: 'auth',
    async onPrepare(request, ctx) {
      const declared = request.callable.auth;
      if (!declared?.length) return;

      const { auth, environment } = request.options;
      const alternatives = candidates(declared, environment, options);
      const asked = new Map<unknown, Promise<AuthToken>>();

      function ask(scheme: AuthScheme): Promise<AuthToken> {
        const key = scheme.key ?? scheme;
        let token = asked.get(key);
        if (!token) {
          token = tokenFor(scheme, request.options, options);
          asked.set(key, token);
        }
        return token;
      }

      if (auth !== null) {
        for (const schemes of alternatives) {
          const placed = await credentialsFor(schemes, ask, options);
          if (!placed) continue;
          for (const { credential } of placed) ctx.binding.applyAuth(credential, request);
          request.placed = placed;
          return;
        }
        await refuseRuledOut(declared, alternatives, ask, environment, options);
      }

      const all = offered(declared.map(schemesOf));
      if (auth === null || request.callable.authOptional) {
        request.unauthenticated = () => unauthenticated(all, options);
        return;
      }

      throw new MissingCredentialError(missing(all, options), keysOf(all));
    },
  };
}
