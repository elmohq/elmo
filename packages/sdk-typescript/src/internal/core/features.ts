import type {
  CallableDescriptor,
  Feature,
  FeatureContext,
  PreparedRequest,
  ResolvedOptions,
  Result,
  Send,
} from './types';

export class FeatureRunner {
  private readonly features: ReadonlyArray<Feature>;

  constructor(features: ReadonlyArray<Feature> = []) {
    this.features = features;
  }

  async options(
    options: ResolvedOptions,
    callable: CallableDescriptor,
    ctx: FeatureContext,
  ): Promise<void> {
    for (const feature of this.features) await feature.onOptions?.(options, callable, ctx);
  }

  async prepare(request: PreparedRequest, ctx: FeatureContext): Promise<void> {
    for (const feature of this.features) await feature.onPrepare?.(request, ctx);
  }

  async request(request: PreparedRequest, ctx: FeatureContext): Promise<void> {
    for (const feature of this.features) await feature.onRequest?.(request, ctx);
  }

  /** Wraps `core` in each feature's `hook`: `onSend` for a call, `onOpen` for a stream. */
  send(core: Send, ctx: FeatureContext, hook: 'onOpen' | 'onSend' = 'onSend'): Send {
    let next = core;
    for (let i = this.features.length - 1; i >= 0; i--) {
      const feature = this.features[i]!;
      if (!feature[hook]) continue;
      const downstream = next;
      next = (request) => feature[hook]!(request, downstream, ctx);
    }
    return next;
  }

  async result(result: Result, request: PreparedRequest, ctx: FeatureContext): Promise<Result> {
    let current = result;
    for (let i = this.features.length - 1; i >= 0; i--) {
      current = (await this.features[i]!.onResult?.(current, request, ctx)) ?? current;
    }
    return current;
  }

  async error(error: unknown, request: PreparedRequest, ctx: FeatureContext): Promise<unknown> {
    let current = error;
    for (let i = this.features.length - 1; i >= 0; i--) {
      current = (await this.features[i]!.onError?.(current, request, ctx)) ?? current;
    }
    return current;
  }
}
