import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './dist/database/schema/index.js',
  out: './src/database/migrations',
  dbCredentials: {
    // @ts-expect-error
    url: process.env.POSTGRES_CONNECTION_STRING as string,
  },
  verbose: true,
  strict: true,
})
