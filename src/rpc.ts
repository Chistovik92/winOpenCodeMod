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

const emptySchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
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
          existingProviderIDs: { type: "array", items: { type: "string" } },
        },
        required: ["providers", "existingProviderIDs"],
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
  },
  events: {},
} as const satisfies Rpc.PortableDefinition
