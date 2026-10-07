import { unreadableValue } from '../core/errors';
import { readReply } from '../core/read-reply';
import type { CallableDescriptor, Feature, ResolvedOptions } from '../core/types';

export type Validate<TIn = unknown, TOut = TIn> = (value: TIn) => Promise<TOut> | TOut;

export async function runValidator<T>(
  validate: Validate<T, T> | undefined,
  value: T,
  options: ResolvedOptions,
  response?: Response,
): Promise<T> {
  if (!validate || options['validate'] === false) return value;
  return await readReply(validate, value, response);
}

export interface CallableValidators {
  error?: Validate;
  request?: Validate<ResolvedOptions, Partial<ResolvedOptions>>;
  response?: Validate;
}

export function validatorsOf(callable: CallableDescriptor): CallableValidators | undefined {
  return callable.validators as CallableValidators | undefined;
}

export function validateFeature(): Feature {
  return {
    name: 'validate',
    async onOptions(options, callable) {
      const validate = validatorsOf(callable)?.request;
      if (!validate || options['validate'] === false) return;
      Object.assign(options, await validate(options));
    },
    async onResult(result, request) {
      const validators = validatorsOf(request.callable);
      if (!validators) return result;
      if (result.error !== undefined && result.error !== null) {
        result.error = await runValidator(
          validators.error,
          result.error,
          request.options,
          result.response,
        );
      } else if (result.data !== undefined) {
        result.data = await runValidator(
          validators.response,
          result.data,
          request.options,
          result.response,
        );
      }
      return result;
    },
  };
}

export function decoded<TIn, TOut>(at: string, value: TIn, read: (value: TIn) => TOut): TOut {
  let result: TOut;
  try {
    result = read(value);
  } catch (cause) {
    throw unreadableValue(at, value, cause);
  }
  if (result instanceof Date && Number.isNaN(result.getTime())) throw unreadableValue(at, value);
  return result;
}

export function reviving<T>(revive: (value: T) => void): Validate {
  return (data) => {
    if (data != null) revive(data as T);
    return data;
  };
}
