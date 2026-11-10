import { readFile } from "node:fs/promises"
import { Model, Plugin, Provider } from "@opencode/plugin"
import type { Schema } from "effect"
import { ProviderRpc } from "./rpc"
import type {
  ExternalProvider,
  ExternalProviderKind,
  ImportResult,
  ProviderOverride,
  StoredModel,
  StoredProvider,
} from "./types"

const STORAGE_KEY = "providers"
const OVERRIDES_KEY = "overrides"
const OPENAI_COMPATIBLE = "@opencode/ai/providers/openai-compatible"
const BUILTIN_PREFIX = "@opencode/ai/providers/"

// `{env:VAR}` resolves to the variable's value at transform time; an empty key
// becomes `false`, which skips bearer auth so header-managed providers work.
function resolveApiKey(raw: string | undefined): string | false {
  if (!raw) return false
  const env = raw.match(/^\{env:([^}]+)\}$/)?.[1]?.trim()
  return env ? (process.env[env] ?? false) : raw
}

function toInfo(provider: StoredProvider): Provider.Info {
  const hasHeaders = provider.headers && Object.keys(provider.headers).length > 0
  return {
    ...Provider.Info.empty(Provider.ID.make(provider.id)),
    name: provider.name,
    activation: "enabled",
    package: OPENAI_COMPATIBLE,
    settings: {
      baseURL: provider.baseURL,
      apiKey: resolveApiKey(provider.apiKey),
    },
    ...(hasHeaders ? { headers: provider.headers } : {}),
  }
}

function toModels(provider: StoredProvider): Model.Info[] {
  const providerID = Provider.ID.make(provider.id)
  return provider.models.map((model) => ({
    ...Model.Info.default(providerID, Model.ID.make(model.id)),
    name: model.name,
  })) as unknown as Model.Info[]
}

// Classify a provider that lives outside this plugin's storage. Config-added
// `openai-compatible` providers carry their own id in `settings.provider` (set by
// opencode's aisdk→native rewrite), which is the reliable "custom" signal; the
// generic `@opencode/ai/providers/openai-compatible` package is only ever used for
// those. Everything else under the `@opencode/ai/providers/` prefix is a built-in.
function classifyKind(info: Provider.Info): ExternalProviderKind {
  const settings = info.settings as Record<string, unknown> | undefined
  if (typeof settings?.provider === "string") return "custom"
  if (info.package === OPENAI_COMPATIBLE) return "custom"
  return info.package.startsWith(BUILTIN_PREFIX) ? "builtin" : "custom"
}

function serializeExternal(
  record: { provider: Provider.Info; models: ReadonlyMap<string, Model.Info> },
  overridden: boolean,
): ExternalProvider {
  const info = record.provider
  const settings = info.settings as Record<string, unknown> | undefined
  const baseURL = settings?.baseURL
  const apiKey = settings?.apiKey
  return {
    id: info.id,
    name: info.name,
    kind: classifyKind(info),
    package: info.package,
    ...(typeof baseURL === "string" ? { baseURL } : {}),
    ...(typeof apiKey === "string" ? { apiKey } : {}),
    ...(info.headers ? { headers: info.headers as Record<string, string> } : {}),
    modelCount: record.models.size,
    overridden,
  }
}

// --- Bulk import from a .json / .txt file ---

/** Parses file text into a list of raw provider objects. Accepts a JSON array or a single object. */
function parseProviderFile(text: string): unknown[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  const data = JSON.parse(trimmed)
  if (Array.isArray(data)) return data
  if (data && typeof data === "object") return [data]
  throw new Error("expected a JSON array or object")
}

/** Normalizes one parsed entry into a `StoredProvider`; returns null when it lacks a valid id or name. */
function normalizeImportedProvider(raw: unknown): StoredProvider | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  const id = typeof obj.id === "string" ? obj.id.trim() : ""
  const name = typeof obj.name === "string" ? obj.name.trim() : ""
  if (!id || !name) return null

  const baseURL = typeof obj.baseURL === "string" ? obj.baseURL.trim() : ""
  const apiKey = typeof obj.apiKey === "string" ? obj.apiKey : undefined

  let headers: Record<string, string> | undefined
  if (obj.headers && typeof obj.headers === "object" && !Array.isArray(obj.headers)) {
    const entries: Record<string, string> = {}
    for (const [key, value] of Object.entries(obj.headers as Record<string, unknown>)) {
      const headerKey = typeof key === "string" ? key.trim() : ""
      if (headerKey && typeof value === "string" && value.trim()) entries[headerKey] = value.trim()
    }
    if (Object.keys(entries).length > 0) headers = entries
  }

  let models: StoredModel[] = []
  if (Array.isArray(obj.models)) {
    models = obj.models
      .filter((model): model is Record<string, unknown> => !!model && typeof model === "object")
      .map((model) => ({
        id: typeof model.id === "string" ? model.id.trim() : "",
        name: typeof model.name === "string" ? model.name.trim() : "",
      }))
      .filter((model) => model.id && model.name)
  }

  return {
    id,
    name,
    baseURL,
    ...(apiKey ? { apiKey } : {}),
    ...(headers ? { headers } : {}),
    models,
  }
}

/**
 * Builds a `ProviderOverride` from an imported provider. Overrides only carry the
 * editable surface (name/baseURL/apiKey/headers) and omit empty fields so the
 * provider's own values stay untouched.
 */
function toProviderOverride(item: StoredProvider): ProviderOverride {
  const override: ProviderOverride = { id: item.id, name: item.name }
  if (item.baseURL) override.baseURL = item.baseURL
  if (item.apiKey) override.apiKey = item.apiKey
  if (item.headers && Object.keys(item.headers).length > 0) override.headers = item.headers
  return override
}

export default Plugin.define({
  id: "winopencodemod",
  async setup(ctx) {
    let providers: StoredProvider[] = []
    let overrides: Record<string, ProviderOverride> = {}
    let externalProviders: ExternalProvider[] = []
    let existingProviderIDs: string[] = []

    const rawProviders = await ctx.storage.get(STORAGE_KEY)
    if (Array.isArray(rawProviders)) providers = rawProviders as unknown as StoredProvider[]
    const rawOverrides = await ctx.storage.get(OVERRIDES_KEY)
    if (rawOverrides && typeof rawOverrides === "object" && !Array.isArray(rawOverrides)) {
      overrides = rawOverrides as unknown as Record<string, ProviderOverride>
    }

    const persistOverrides = () => ctx.storage.set(OVERRIDES_KEY, overrides as unknown as Schema.Json)

    // Transform A: register plugin-stored providers. This runs in the plugin's own
    // activation phase (before `opencode.config.provider`), so config providers overlay
    // onto these without removing them.
    await ctx.provider.transform((editor) => {
      for (const provider of providers) {
        editor.add({ info: toInfo(provider), models: toModels(provider) })
      }
    })

    // Transform B: apply overrides to non-plugin providers and snapshot them.
    //
    // Config providers are created by `opencode.config.provider`, a post-phase plugin
    // that activates *after* this plugin. If this transform were registered eagerly it
    // would always run before config and never see (or override) those providers. It is
    // therefore registered lazily — from RPC handlers and a best-effort startup timer,
    // which run after activation has settled. Disposing any prior registration before
    // re-adding keeps it last in the transform order, self-healing a cold-start timer
    // that landed too early.
    let overridesRegistration: { dispose: () => Promise<void> } | undefined
    let registerChain: Promise<void> = Promise.resolve()
    const registerOverrides = () => {
      registerChain = registerChain.then(async () => {
        await overridesRegistration?.dispose()
        overridesRegistration = await ctx.provider.transform((editor) => {
          const pluginIDs = new Set(providers.map((provider) => provider.id))

          for (const [id, override] of Object.entries(overrides)) {
            if (!editor.get(id)) continue
            editor.update(id, (info) => {
              const target = info as unknown as {
                name: string
                settings?: Record<string, unknown>
                headers?: Record<string, string>
              }
              if (override.name !== undefined) target.name = override.name
              if (override.baseURL !== undefined || override.apiKey !== undefined) {
                const settings = (target.settings ??= {})
                if (override.baseURL !== undefined) settings.baseURL = override.baseURL
                if (override.apiKey !== undefined) settings.apiKey = resolveApiKey(override.apiKey)
              }
              if (override.headers !== undefined) target.headers = override.headers
            })
          }

          externalProviders = editor
            .list()
            .filter((record) => !pluginIDs.has(record.provider.id))
            .map((record) => serializeExternal(record, record.provider.id in overrides))
          existingProviderIDs = externalProviders.map((provider) => provider.id)
        })
      })
      return registerChain
    }

    await ctx.rpc.register(ProviderRpc, {
      async list() {
        await registerOverrides()
        return { providers, externalProviders, existingProviderIDs }
      },
      async save(input) {
        const provider = input as StoredProvider
        const index = providers.findIndex((item) => item.id === provider.id)
        if (index >= 0) providers[index] = provider
        else providers.push(provider)
        await ctx.storage.set(STORAGE_KEY, providers as unknown as Schema.Json)
        await registerOverrides()
        await ctx.provider.reload()
        return {}
      },
      async remove(input) {
        const { id } = input as { id: string }
        providers = providers.filter((item) => item.id !== id)
        await ctx.storage.set(STORAGE_KEY, providers as unknown as Schema.Json)
        await registerOverrides()
        await ctx.provider.reload()
        return {}
      },
      async saveOverride(input) {
        const override = input as ProviderOverride
        overrides = { ...overrides, [override.id]: override }
        await persistOverrides()
        await registerOverrides()
        await ctx.provider.reload()
        return {}
      },
      async removeOverride(input) {
        const { id } = input as { id: string }
        if (id in overrides) {
          const next: Record<string, ProviderOverride> = {}
          for (const [key, value] of Object.entries(overrides)) {
            if (key !== id) next[key] = value
          }
          overrides = next
        }
        await persistOverrides()
        await registerOverrides()
        await ctx.provider.reload()
        return {}
      },
      async importProviders(input) {
        const { paths } = input as { paths: string[] }
        // Refresh the external-provider snapshot so id classification is current.
        await registerOverrides()

        const result: ImportResult = { added: [], updated: [], overridden: [], skipped: [], errors: [] }
        const pluginIDs = new Set(providers.map((provider) => provider.id))
        const externalIDs = new Set(existingProviderIDs)
        let providersChanged = false
        let overridesChanged = false

        for (const path of paths) {
          let rawItems: unknown[]
          try {
            rawItems = parseProviderFile(await readFile(path, "utf8"))
          } catch (err) {
            result.errors.push(`${path}: ${err instanceof Error ? err.message : String(err)}`)
            continue
          }

          for (const raw of rawItems) {
            const item = normalizeImportedProvider(raw)
            if (!item) {
              const rawID =
                raw && typeof raw === "object" && typeof (raw as Record<string, unknown>).id === "string"
                  ? ((raw as Record<string, unknown>).id as string)
                  : ""
              result.skipped.push({ id: rawID || "(unknown)", reason: "missing id or name" })
              continue
            }

            if (pluginIDs.has(item.id)) {
              // Plugin-stored: full replace, models included.
              const index = providers.findIndex((provider) => provider.id === item.id)
              providers[index] = item
              result.updated.push(item.id)
              providersChanged = true
            } else if (externalIDs.has(item.id)) {
              // External (config/custom/builtin): override editable fields only.
              overrides = { ...overrides, [item.id]: toProviderOverride(item) }
              result.overridden.push(item.id)
              overridesChanged = true
            } else {
              providers.push(item)
              pluginIDs.add(item.id)
              result.added.push(item.id)
              providersChanged = true
            }
          }
        }

        if (providersChanged) await ctx.storage.set(STORAGE_KEY, providers as unknown as Schema.Json)
        if (overridesChanged) await persistOverrides()
        if (providersChanged || overridesChanged) {
          await registerOverrides()
          await ctx.provider.reload()
        }

        return result
      },
    })

    // Best-effort startup registration: once the current microtask/activation has
    // settled, apply overrides so a cold start already has them in place. If this
    // lands before `opencode.config.provider` activates, the next RPC call re-registers
    // (dispose + re-add) and moves the transform back to the end, self-healing.
    setTimeout(() => {
      registerOverrides().catch(() => {})
    }, 0)
  },
})
