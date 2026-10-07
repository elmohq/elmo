import type { AnyTransport, Binding, Interaction } from './types';

export interface ProtocolSetup {
  binding: Binding;
  transport: AnyTransport;
}

export type ProtocolLookup = (interaction: Interaction | undefined) => ProtocolSetup;

export function oneProtocol(setup: ProtocolSetup): ProtocolLookup {
  return () => setup;
}
