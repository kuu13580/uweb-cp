import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/transports/index.ts'],
  platform: 'browser',
  dts: true,
  clean: true,
  treeshake: true,
})
