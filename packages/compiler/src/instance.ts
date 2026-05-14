// An interface so we can interface merge in the future from external sources
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TempblotParams {}

export class TempblotInstance<TParams = TempblotParams> {
  params: TParams;

  constructor(params: TParams) {
    this.params = params;
  }
}

export function useParams<TParams = TempblotParams>(): TParams;
export function useParams<TParams = TempblotParams>(
  this: TempblotInstance<TParams>,
): TParams;
export function useParams<TParams = TempblotParams>(
  this: TempblotInstance<TParams> | undefined,
): TParams {
  if (!(this instanceof TempblotInstance)) {
    throw new Error(
      "You can only use `useParams` from `tempblot` in a `.blot` file",
    );
  }

  return this.params;
}
