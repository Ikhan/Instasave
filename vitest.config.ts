import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: { include: ['src/main/**/*.ts', 'src/shared/**/*.ts'], exclude: ['src/main/index.ts', 'src/main/ipc.ts', 'src/main/ipc-profile.ts', '**/*.test.ts'] }
  }
})
