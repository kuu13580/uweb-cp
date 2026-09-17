import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    entry: ['src/index.ts', 'src/transports/index.ts'],
    platform: 'browser',
    dts: true,
    clean: true,
    treeshake: true,
  },
})
