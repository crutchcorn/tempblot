#!/usr/bin/env node
import {createRequire} from 'node:module'
import process from 'node:process'
import {URL, fileURLToPath} from 'node:url'
import {build} from 'esbuild'

const require = createRequire(import.meta.url)

const debug = process.argv.includes('debug')

await build({
  bundle: true,
  entryPoints: {
    'out/extension': require.resolve('../src/extension.ts'),
    'out/language-server': require.resolve('@tempblot/language-server'),
    'node_modules/@tempblot/typescript-plugin': require.resolve(
      '../../typescript-plugin/lib/index.cjs'
    )
  },
  external: ['vscode'],
  logLevel: 'info',
  mainFields: ['module', 'main'],
  minify: !debug,
  outdir: fileURLToPath(new URL('../', import.meta.url)),
  platform: 'node',
  sourcemap: debug
})
