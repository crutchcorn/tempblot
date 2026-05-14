declare module '*.wasm?url' {
  const url: string;
  export default url;
}

declare module '*.d.ts?raw' {
  const source: string;
  export default source;
}
