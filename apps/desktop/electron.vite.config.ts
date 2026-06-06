import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

// Deps that must be BUNDLED into the main chunk rather than externalized (the default).
//  - `@scure/bip39` + `@scure/base` + `@noble/hashes`: ESM-only, so a `require()` from the
//    CJS main bundle throws ERR_REQUIRE_ESM and crashes on launch.
//  - `@cairn/*` workspace packages: published as raw TypeScript source (no dist build), so
//    a `require()` of their `src/index.ts` throws "Unexpected token 'export'". Bundling lets
//    Vite compile them in. The vault/session wiring pulls these into the startup graph.
const BUNDLED_MAIN_DEPS = [
  '@scure/bip39',
  '@scure/base',
  '@noble/hashes',
  '@cairn/shared-types',
  '@cairn/shared-zod',
  '@cairn/sync-protocol',
  '@cairn/billing-types',
]

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: BUNDLED_MAIN_DEPS })],
    build: {
      lib: {
        entry: resolve(__dirname, 'electron/main.ts'),
      },
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, 'electron/preload.ts'),
      },
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared'),
      },
    },
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'index.html'),
        },
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'shared'),
      },
    },
  },
})
