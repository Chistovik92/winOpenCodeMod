import type { Rpc } from "@opencode/plugin/rpc"

const modelSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
  },
  required: ["id", "name"],
}

const providerSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    baseURL: { type: "string" },
    apiKey: { type: "string" },
    headers: { type: "object", additionalProperties: { type: "string" } },
    models: { type: "array", items: modelSchema },
  },
  required: ["id", "name", "baseURL", "models"],
}

const externalProviderSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    kind: { type: "string", enum: ["custom", "builtin"] },
    package: { type: "string" },
    baseURL: { type: "string" },
    apiKey: { type: "string" },
    headers: { type: "object", additionalProperties: { type: "string" } },
    modelCount: { type: "number" },
    overridden: { type: "boolean" },
  },
  required: ["id", "name", "kind", "package", "modelCount", "overridden"],
}

const overrideSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    baseURL: { type: "string" },
    apiKey: { type: "string" },
    headers: { type: "object", additionalProperties: { type: "string" } },
  },
  required: ["id"],
}

const emptySchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
}

const importResultSchema = {
  type: "object",
  properties: {
    added: { type: "array", items: { type: "string" } },
    updated: { type: "array", items: { type: "string" } },
    overridden: { type: "array", items: { type: "string" } },
    skipped: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          reason: { type: "string" },
        },
        required: ["id", "reason"],
      },
    },
    errors: { type: "array", items: { type: "string" } },
  },
  required: ["added", "updated", "overridden", "skipped", "errors"],
}

/**
 * The plugin's RPC contract, shared by the server (`ctx.rpc.register`) and the
 * GUI (`ctx.client.rpc`). `as const satisfies` keeps the method names literal
 * so both sides stay typed; the JSON-schema input/output yield `unknown` at the
 * boundaries and are cast there.
 */
export const ProviderRpc = {
  id: "winopencodemod",
  methods: {
    list: {
      input: emptySchema,
      output: {
        type: "object",
        properties: {
          providers: { type: "array", items: providerSchema },
          externalProviders: { type: "array", items: externalProviderSchema },
          existingProviderIDs: { type: "array", items: { type: "string" } },
        },
        required: ["providers", "externalProviders", "existingProviderIDs"],
      },
    },
    save: {
      input: providerSchema,
      output: emptySchema,
    },
    remove: {
      input: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
      output: emptySchema,
    },
    saveOverride: {
      input: overrideSchema,
      output: emptySchema,
    },
    removeOverride: {
      input: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
      output: emptySchema,
    },
    importProviders: {
      input: {
        type: "object",
        properties: {
          paths: { type: "array", items: { type: "string" } },
        },
        required: ["paths"],
      },
      output: importResultSchema,
    },
  },
  events: {},
} as const satisfies Rpc.PortableDefinition
