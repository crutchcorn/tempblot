/**
 * Per-file instance created during compilation.
 * Future-proofed for additional per-file state.
 */
export class DoodlInstance<TParams = unknown> {
  constructor(public params: TParams) {}
}

/**
 * Returns the params passed to `compilePath` for this `.dood` file.
 * Must be called from within a `.dood` file's `<setup>` block.
 *
 * @example
 * // In a .dood file:
 * const config = useParams<{ abc: 1 }>();
 */
export function useParams<TParams = unknown>(
  this: DoodlInstance<TParams>,
): TParams {
  if (!(this instanceof DoodlInstance)) {
    throw new Error(
      "You can only use `useParams` from `doodl` in a `.dood` file",
    );
  }
  return this.params;
}
