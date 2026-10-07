import { NO_BODY } from './registry';
import type { Codec } from '../core/types';

export const jsonCodec: Codec = {
  contentType: 'application/json',
  decode: async (raw) => {
    const text = await raw.text();
    return text === '' ? NO_BODY : JSON.parse(text);
  },
  encode: (value) => JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v)),
  mediaTypes: ['application/json'],
  name: 'json',
};
