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

/**
 * How a provider that is *not* stored by this plugin is classified:
 * - `custom`  — added via config / another plugin (e.g. `npm: @ai-sdk/openai-compatible`).
 * - `builtin` — shipped inside the OpenCode installation (`@opencode/ai/providers/*`).
 */
export type ExternalProviderKind = "custom" | "builtin"

/** A provider that lives outside this plugin's storage, surfaced read-only-ish for editing. */
export interface ExternalProvider {
  id: string
  name: string
  kind: ExternalProviderKind
  package: string
  /** Effective `settings.baseURL`, if the provider exposes one. */
  baseURL?: string
  /** Effective `settings.apiKey` (literal or `{env:VAR}`), if set. */
  apiKey?: string
  headers?: Record<string, string>
  modelCount: number
  /** Whether this provider currently has a plugin override applied. */
  overridden: boolean
}

/**
 * A plugin-side override for a non-plugin provider. Only present fields are applied;
 * empty/omitted fields leave the provider's original value untouched. Applied on every
 * transform via `editor.update`, so they survive reloads without editing `opencode.json`.
 */
export interface ProviderOverride {
  id: string
  name?: string
  baseURL?: string
  /** Raw API key: literal, `{env:VAR}`, or empty. */
  apiKey?: string
  headers?: Record<string, string>
}

export interface ProviderListResult {
  providers: StoredProvider[]
  /** Providers that exist outside this plugin (config-added and built-in). */
  externalProviders: ExternalProvider[]
  /** Provider IDs that exist outside this plugin (used for ID collision checks). */
  existingProviderIDs: string[]
}

/** Summary of a bulk provider import from a `.json`/`.txt` file. */
export interface ImportResult {
  /** IDs added as new plugin-stored providers. */
  added: string[]
  /** IDs of plugin-stored providers that were fully replaced. */
  updated: string[]
  /** IDs of external (config/custom/builtin) providers that got an override. */
  overridden: string[]
  /** Items that could not be imported, with a short reason. */
  skipped: { id: string; reason: string }[]
  /** File-level failures (read or parse errors), with the offending path. */
  errors: string[]
}
