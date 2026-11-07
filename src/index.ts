import { Model, Plugin, Provider } from "@opencode/plugin"
import type { Schema } from "effect"
import { ProviderRpc } from "./rpc"
import type { StoredProvider } from "./types"

const STORAGE_KEY = "providers"
const OPENAI_COMPATIBLE = "@opencode/ai/providers/openai-compatible"

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

export default Plugin.define({
  id: "winopencodemod",
  async setup(ctx) {
    let providers: StoredProvider[] = []
    let existingProviderIDs: string[] = []

    const raw = await ctx.storage.get(STORAGE_KEY)
    if (Array.isArray(raw)) providers = raw as unknown as StoredProvider[]

    await ctx.provider.transform((editor) => {
      existingProviderIDs = editor.list().map((record) => record.provider.id)
      for (const provider of providers) {
        editor.add({ info: toInfo(provider), models: toModels(provider) })
      }
    })

    await ctx.rpc.register(ProviderRpc, {
      async list() {
        return { providers, existingProviderIDs }
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
    })
  },
})
