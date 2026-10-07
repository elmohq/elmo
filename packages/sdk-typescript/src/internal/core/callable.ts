import type { CallableDescriptor, Interaction } from './types';

export type CallableInput = Omit<CallableDescriptor, 'interaction'> & {
  readonly interaction?: Interaction;
};

export function callable<T extends CallableInput>(
  descriptor: T,
): T & { readonly interaction: Interaction } {
  return { interaction: 'unary', ...descriptor };
}
