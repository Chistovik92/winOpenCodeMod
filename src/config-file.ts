// Safe, text-level editing of the user's `opencode.jsonc` / `opencode.json`.
//
// OpenCode configs are JSONC (JSON with comments), so round-tripping through
// `JSON.parse`/`JSON.stringify` would destroy the user's comments and formatting.
// Instead we locate the `aistar` block by scanning the raw text with a small
// string/comment-aware tokenizer and splice only the pieces we need.

import { readFile, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type { StoredModel } from "./types"

export const AISTAR_PROVIDER_ID = "aistar"

function globalConfigDir(): string {
  // Respect XDG on Linux/macOS; on Windows this is %USERPROFILE%\.config\opencode.
  const xdg = process.env.XDG_CONFIG_HOME
  return xdg ? join(xdg, "opencode") : join(homedir(), ".config", "opencode")
}

const CONFIG_NAMES = ["opencode.jsonc", "opencode.json"]

/** Return the path of the global config file that actually defines AI Star, else the preferred path. */
export async function findAISTarConfigPath(): Promise<string> {
  const dir = globalConfigDir()
  for (const name of CONFIG_NAMES) {
    const path = join(dir, name)
    if (!existsSync(path)) continue
    const text = await readFile(path, "utf8")
    if (text.includes(`"${AISTAR_PROVIDER_ID}"`) || text.includes("AI Star")) return path
  }
  // Fall back to the preferred file name so we can append a new provider.
  return join(dir, "opencode.jsonc")
}

// --- Tokenizer helpers -----------------------------------------------------

/** Index just past the closing quote of a string starting at `quoteIndex`. */
function scanString(text: string, quoteIndex: number): number {
  let i = quoteIndex + 1
  while (i < text.length) {
    const ch = text[i]
    if (ch === "\\") {
      i += 2
      continue
    }
    if (ch === '"') return i + 1
    i++
  }
  return text.length
}

/** Skip whitespace and JSONC comments, returning the next significant char index. */
function skipTrivia(text: string, start: number): number {
  let i = start
  while (i < text.length) {
    const ch = text[i]
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++
      continue
    }
    if (ch === "/" && text[i + 1] === "/") {
      const nl = text.indexOf("\n", i)
      i = nl < 0 ? text.length : nl + 1
      continue
    }
    if (ch === "/" && text[i + 1] === "*") {
      const close = text.indexOf("*/", i + 2)
      i = close < 0 ? text.length : close + 2
      continue
    }
    break
  }
  return i
}

/** Given an index at `{` or `[`, return the index of the matching close bracket. */
function matchBracket(text: string, openIndex: number): number {
  const open = text[openIndex]
  const close = open === "{" ? "}" : "]"
  let depth = 0
  let i = openIndex
  while (i < text.length) {
    const ch = text[i]
    if (ch === '"') {
      i = scanString(text, i)
      continue
    }
    if (ch === "/" && text[i + 1] === "/") {
      const nl = text.indexOf("\n", i)
      i = nl < 0 ? text.length : nl + 1
      continue
    }
    if (ch === "/" && text[i + 1] === "*") {
      const closeC = text.indexOf("*/", i + 2)
      i = closeC < 0 ? text.length : closeC + 2
      continue
    }
    if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return i
    }
    i++
  }
  return text.length - 1
}

interface PropertyRange {
  /** Index of the opening quote of the key. */
  keyStart: number
  /** Index just past the closing quote of the key. */
  keyEnd: number
  /** Index of the value start (first significant char after ':'). */
  valueStart: number
  /** Index just past the value (closing bracket/brace/quote, or last scalar char). */
  valueEnd: number
}

/**
 * Find the range of a top-level property inside the object whose open brace is at
 * `objOpen` (and close brace at `objClose`). Returns null when the key is absent.
 */
function findProperty(text: string, objOpen: number, objClose: number, key: string): PropertyRange | null {
  let i = skipTrivia(text, objOpen + 1)
  while (i < objClose) {
    if (text[i] !== '"') {
      // Shouldn't happen in well-formed JSONC; step forward defensively.
      i++
      continue
    }
    const keyEnd = scanString(text, i)
    const keyText = text.slice(i + 1, keyEnd - 1)
    const colon = skipTrivia(text, keyEnd)
    if (text[colon] !== ":") {
      i = keyEnd
      continue
    }
    const valueStart = skipTrivia(text, colon + 1)
    let valueEnd: number
    const ch = text[valueStart]
    if (ch === "{" || ch === "[") valueEnd = matchBracket(text, valueStart) + 1
    else if (ch === '"') valueEnd = scanString(text, valueStart)
    else {
      let e = valueStart
      while (e < objClose && text[e] !== "," && text[e] !== "}") e++
      valueEnd = skipTrivia(text, e)
    }
    if (keyText === key) return { keyStart: i, keyEnd, valueStart, valueEnd }
    i = skipTrivia(text, valueEnd)
    if (text[i] === ",") i = skipTrivia(text, i + 1)
  }
  return null
}

/** Locate the top-level `provider` (or v2 `providers`) object in the config text. */
function findProvidersObject(text: string): { open: number; close: number } | null {
  let i = skipTrivia(text, 0)
  if (text[i] !== "{") return null
  const rootClose = matchBracket(text, i)
  for (const key of ["provider", "providers"]) {
    const prop = findProperty(text, i, rootClose, key)
    if (prop && (text[prop.valueStart] === "{")) {
      return { open: prop.valueStart, close: matchBracket(text, prop.valueStart) }
    }
  }
  return null
}

/** Locate the `aistar` entry inside the providers object, if present. */
function findAISTarEntry(text: string, providersOpen: number, providersClose: number): PropertyRange | null {
  return findProperty(text, providersOpen, providersClose, AISTAR_PROVIDER_ID)
}

/**
 * Serialize the AI Star provider value (the object after `"aistar": `).
 * `keyIndent` is the indentation of the `"aistar"` key itself; fields inside the
 * object are one level deeper, and the object's closing brace sits back at key level.
 */
function renderAISTarValue(
  name: string,
  baseURL: string,
  apiKey: string | undefined,
  models: StoredModel[],
  keyIndent: string,
): string {
  const f = keyIndent + "  "
  const f1 = f + "  "
  const f2 = f1 + "  "
  const options: string[] = [`${f1}"baseURL": ${JSON.stringify(baseURL)}`]
  if (apiKey) options.push(`${f1}"apiKey": ${JSON.stringify(apiKey)}`)
  const modelsBlock =
    models.length > 0
      ? models.map((m) => `${f1}${JSON.stringify(m.id)}: { "name": ${JSON.stringify(m.name)} }`).join(",\n")
      : ""
  const lines: string[] = []
  lines.push(`{`)
  lines.push(`${f}"name": ${JSON.stringify(name)},`)
  lines.push(`${f}"npm": "@ai-sdk/openai-compatible",`)
  lines.push(`${f}"options": {`)
  lines.push(options.join(",\n"))
  if (modelsBlock) {
    lines.push(`${f}},`)
    lines.push(`${f}"models": {`)
    lines.push(modelsBlock)
    lines.push(`${f}}`)
  } else {
    lines.push(`${f}}`)
  }
  lines.push(`${keyIndent}}`)
  return lines.join("\n")
}

export interface WriteConfigResult {
  path: string
  /** true when the file existed and was modified; false when the file had to be created. */
  updated: boolean
  /** true when a pre-existing AI Star entry was replaced (vs. newly created). */
  replaced: boolean
}

/**
 * Write the activated AI Star data into the user's global config, replacing an
 * existing `provider.aistar` entry in place (or appending one) while preserving the
 * surrounding text and comments.
 */
export async function writeAISTarToConfig(
  name: string,
  baseURL: string,
  apiKey: string | undefined,
  models: StoredModel[],
): Promise<WriteConfigResult> {
  const path = await findAISTarConfigPath()
  const existed = existsSync(path)
  const text = existed ? await readFile(path, "utf8") : "{\n}\n"

  let next = text
  let replaced = false

  const providers = findProvidersObject(text)
  if (providers) {
    const entry = findAISTarEntry(text, providers.open, providers.close)
    if (entry) {
      // Replace only the value object, keeping the existing `"aistar": ` key prefix
      // and its surrounding indentation untouched.
      const rendered = renderAISTarValue(name, baseURL, apiKey, models, "    ")
      next = text.slice(0, entry.valueStart) + rendered + text.slice(entry.valueEnd)
      replaced = true
    } else {
      // Append the provider as a new key inside the existing providers object.
      const rendered = renderAISTarValue(name, baseURL, apiKey, models, "    ")
      const inner = text.slice(providers.open + 1, providers.close)
      const needsComma = inner.trim().length > 0
      const insert = (needsComma ? ",\n" : "\n") + `    "${AISTAR_PROVIDER_ID}": ` + rendered + "\n"
      next = text.slice(0, providers.close) + insert + text.slice(providers.close)
    }
  } else {
    // No provider/providers section at all: create one at the top level.
    const rendered = renderAISTarValue(name, baseURL, apiKey, models, "    ")
    const insert = `\n  "provider": {\n    "${AISTAR_PROVIDER_ID}": ${rendered}\n  }\n`
    // Insert before the final closing brace of the root object.
    const rootClose = text.lastIndexOf("}")
    next = text.slice(0, rootClose) + insert + text.slice(rootClose)
  }

  await writeFile(path, next, "utf8")
  return { path, updated: existed, replaced }
}

export interface RemoveModelsResult {
  path: string
  /** true when a models block was found and removed. */
  removed: boolean
}

/**
 * Remove the hardcoded `models` block from the AI Star entry in the config, so the
 * model list is sourced only from the plugin. Preserves everything else.
 */
export async function removeAISTarModelsFromConfig(): Promise<RemoveModelsResult> {
  const path = await findAISTarConfigPath()
  if (!existsSync(path)) return { path, removed: false }
  const text = await readFile(path, "utf8")

  const providers = findProvidersObject(text)
  if (!providers) return { path, removed: false }
  const entry = findAISTarEntry(text, providers.open, providers.close)
  if (!entry || text[entry.valueStart] !== "{") return { path, removed: false }

  const entryOpen = entry.valueStart
  const entryClose = matchBracket(text, entryOpen)
  const modelsProp = findProperty(text, entryOpen, entryClose, "models")
  if (!modelsProp) return { path, removed: false }

  // Remove from the start of the key through the end of its value, and clean up the
  // comma that separated it from the previous property.
  let start = modelsProp.keyStart
  // Walk back over whitespace/comments to absorb a trailing comma on the previous line.
  let p = start - 1
  while (p >= 0) {
    const ch = text[p]
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      p--
      continue
    }
    if (ch === ",") start = p
    break
  }
  const next = text.slice(0, start) + text.slice(modelsProp.valueEnd)
  await writeFile(path, next, "utf8")
  return { path, removed: true }
}
