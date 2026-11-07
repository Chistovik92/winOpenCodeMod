import { Model, Provider } from "../node_modules/@opencode/schema/dist/index.js"

// Replicate the plugin's toInfo/toModels exactly.
const OPENAI_COMPATIBLE = "@opencode/ai/providers/openai-compatible"

function toInfo(provider) {
  return {
    ...Provider.Info.empty(Provider.ID.make(provider.id)),
    name: provider.name,
    activation: "enabled",
    package: OPENAI_COMPATIBLE,
    settings: {
      baseURL: provider.baseURL,
      apiKey: provider.apiKey,
    },
  }
}

function toModels(provider) {
  const providerID = Provider.ID.make(provider.id)
  return provider.models.map((model) => ({
    ...Model.Info.default(providerID, Model.ID.make(model.id)),
    name: model.name,
  }))
}

const provider = {
  id: "myprovider",
  name: "My Provider",
  baseURL: "https://example.com/v1",
  apiKey: "sk-test",
  models: [{ id: "model-a", name: "Model A" }],
}

const info = toInfo(provider)
const models = toModels(provider)

console.log("=== Provider.Info ===")
console.log(JSON.stringify(info, null, 2))

console.log("\n=== Model.Info ===")
console.log(JSON.stringify(models, null, 2))

// Try decoding with the real schemas.
console.log("\n=== Decode Provider.Info ===")
try {
  const decoded = Provider.Info.decodeUnknownSync(info)
  console.log("OK:", JSON.stringify(decoded))
} catch (e) {
  console.log("FAIL:", e?.message ?? e)
}

console.log("\n=== Decode Model.Info ===")
try {
  const decoded = Model.Info.decodeUnknownSync(models[0])
  console.log("OK:", JSON.stringify(decoded, null, 2))
} catch (e) {
  console.log("FAIL:", e?.message ?? e)
  console.log(e)
}
