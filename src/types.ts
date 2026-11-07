// Shared types for the custom-provider plugin. Plain TypeScript only, so both
// the server half (`src/index.ts`) and the GUI bundle can import them.

export interface StoredModel {
  id: string
  name: string
}

export interface StoredProvider {
  id: string
  name: string
  baseURL: string
  /** Raw API key: a literal key, `{env:VAR}`, or empty/omitted for none. */
  apiKey?: string
  headers?: Record<string, string>
  models: StoredModel[]
}

export interface ProviderListResult {
  providers: StoredProvider[]
  /** Provider IDs that exist outside this plugin (built-ins and other plugins). */
  existingProviderIDs: string[]
}
