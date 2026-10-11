import { defineConfig } from 'drizzle-kit'

// SQL生成専用。適用は `wrangler d1 migrations apply` で行う
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './migrations',
})
