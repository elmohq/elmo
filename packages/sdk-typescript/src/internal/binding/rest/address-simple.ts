import type { ResolveAddress } from './address';
import { joinAddress } from './address';
import { encodeName, encodeValue } from './path';
import { emptyPathParameter } from '../../core/errors';

const ABSOLUTE_URL_RE = /^[a-z][a-z\d+.-]*:\/\//i;

const PATH_PARAM_RE = /\{([^{}]+)\}/g;

function pathValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(encodeValue).join(',');
  if (typeof value === 'object' && value !== null && !(value instanceof Date)) {
    return Object.entries(value)
      .flatMap(([key, item]) => [encodeURIComponent(key), encodeValue(item)])
      .join(',');
  }
  return encodeValue(value);
}

export const simpleAddress: ResolveAddress = ({ address, baseUrl, path, query }) => {
  const absolute = ABSOLUTE_URL_RE.test(address);
  const pathUrl = absolute || address.startsWith('/') ? address : `/${address}`;
  let url = absolute ? pathUrl : joinAddress(baseUrl, pathUrl);

  if (path) {
    url = url.replace(PATH_PARAM_RE, (_match, name: string) => {
      const value = path[name];
      if (value === undefined || value === null || value === '') {
        throw emptyPathParameter(name, address);
      }
      return pathValue(value);
    });
  }

  if (!query) return url;

  const search: Array<string> = [];
  for (const [name, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) {
          search.push(`${encodeName(name)}=${encodeValue(item)}`);
        }
      }
      continue;
    }
    if (typeof value === 'object' && !(value instanceof Date)) {
      for (const [key, item] of Object.entries(value)) {
        if (item !== undefined && item !== null) {
          search.push(`${encodeName(key)}=${encodeValue(item)}`);
        }
      }
      continue;
    }
    search.push(`${encodeName(name)}=${encodeValue(value)}`);
  }

  if (!search.length) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${search.join('&')}`;
};
