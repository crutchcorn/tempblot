export class TempblotInstance<TParams = unknown> {
  params: TParams;

  constructor(params: TParams) {
    this.params = params;
  }
}

export function useParams<TParams = unknown>(): TParams;
export function useParams<TParams = unknown>(
  this: TempblotInstance<TParams>,
): TParams;
export function useParams<TParams = unknown>(
  this: TempblotInstance<TParams> | undefined,
): TParams {
  if (!(this instanceof TempblotInstance)) {
    throw new Error(
      "You can only use `useParams` from `tempblot` in a `.blot` file",
    );
  }

  return this.params;
}
