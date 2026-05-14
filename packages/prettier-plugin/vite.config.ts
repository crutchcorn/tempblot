import { defineConfig } from 'vitest/config'
import packageJson from './package.json' with { type: 'json' }

export default defineConfig(({ mode }) => ({
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
  },
  define: {
    'import.meta.vitest': mode !== 'production',
  },
}))
