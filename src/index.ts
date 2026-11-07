import { Model, Plugin, Provider } from "@opencode/plugin"
import type { Schema } from "effect"
import { ProviderRpc } from "./rpc"
import type { ExternalProvider, ExternalProviderKind, ProviderOverride, StoredProvider } from "./types"

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

    await ctx.provider.transform((editor) => {
      const pluginIDs = new Set(providers.map((provider) => provider.id))

      // Apply plugin overrides to existing (non-plugin) providers, before we snapshot
      // them so the GUI sees effective values. Re-applied on every transform/reload.
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

      // Register plugin-stored providers.
      for (const provider of providers) {
        editor.add({ info: toInfo(provider), models: toModels(provider) })
      }

      // Snapshot external providers (config-added + built-in) with effective values.
      externalProviders = editor
        .list()
        .filter((record) => !pluginIDs.has(record.provider.id))
        .map((record) => serializeExternal(record, record.provider.id in overrides))
      existingProviderIDs = externalProviders.map((provider) => provider.id)
    })

    await ctx.rpc.register(ProviderRpc, {
      async list() {
        return { providers, externalProviders, existingProviderIDs }
      },
      async save(input) {
        const provider = input as StoredProvider
        const index = providers.findIndex((item) => item.id === provider.id)
        if (index >= 0) providers[index] = provider
        else providers.push(provider)
        await ctx.storage.set(STORAGE_KEY, providers as unknown as Schema.Json)
        await ctx.provider.reload()
        return {}
      },
      async remove(input) {
        const { id } = input as { id: string }
        providers = providers.filter((item) => item.id !== id)
        await ctx.storage.set(STORAGE_KEY, providers as unknown as Schema.Json)
        await ctx.provider.reload()
        return {}
      },
      async saveOverride(input) {
        const override = input as ProviderOverride
        overrides = { ...overrides, [override.id]: override }
        await persistOverrides()
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
        await ctx.provider.reload()
        return {}
      },
    })
  },
})
