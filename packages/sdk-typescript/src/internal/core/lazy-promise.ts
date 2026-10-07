export abstract class LazyPromise<T> extends Promise<T> {
  private answer: Promise<T> | undefined;

  constructor() {
    super(() => {});
  }

  protected abstract settle(): Promise<T>;

  private answered(): Promise<T> {
    return (this.answer ??= this.settle());
  }

  override then<TResolved = T, TCaught = never>(
    onFulfilled?: ((value: T) => PromiseLike<TResolved> | TResolved) | null,
    onRejected?: ((reason: unknown) => PromiseLike<TCaught> | TCaught) | null,
  ): Promise<TCaught | TResolved> {
    return this.answered().then(onFulfilled, onRejected);
  }

  override catch<TCaught = never>(
    onRejected?: ((reason: unknown) => PromiseLike<TCaught> | TCaught) | null,
  ): Promise<T | TCaught> {
    return this.answered().catch(onRejected);
  }

  override finally(onFinally?: (() => void) | null): Promise<T> {
    return this.answered().finally(onFinally);
  }

  static override get [Symbol.species](): PromiseConstructor {
    return Promise;
  }
}

export function unattended<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => {});
  return promise;
}
