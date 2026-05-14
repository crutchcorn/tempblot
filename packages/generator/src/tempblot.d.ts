declare module "tempblot" {
  export function compilePath<TParams = unknown>(
    sourcePath: string,
    params: TParams,
  ): Promise<string>;

  export function loadSetupPath<TParams = unknown>(
    sourcePath: string,
    params: TParams,
  ): Promise<Record<string, unknown>>;
}
