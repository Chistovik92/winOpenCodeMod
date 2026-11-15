// AI Star authentication and model management module
// Handles activation via access code and model catalog fetching

import { fetch } from "undici"

export const AI_STAR_BASE_URL = "https://ai.starimg.ru"
export const AI_STAR_API_BASE = "https://ai.starimg.ru"

export interface AIStarModel {
  id: string
  display_name: string
  context_window: string
  multiplier: number
  modalities: string
  isNew: boolean
  uptime: number
  quality: number | null
  effort: string[]
  pricing: {
    multiplier: number
    cached_discount: number
    fast_multiplier: number
    cc_max_multiplier: number
    claude_max_multiplier: number
  } | null
  mediaKind: string
  category: string
  category_label: string
  category_label_en: string
}

export interface AIStarModelCategory {
  id: string
  label: string
  labelEn: string
  models: AIStarModel[]
}

export interface AIStarModelCatalog {
  data: {
    object: "model_catalogue"
    generated_at: string
    count: number
    source: string
    data: AIStarModel[]
    categories: AIStarModelCategory[]
    models: AIStarModel[]
  }
}

export interface AIStarBootstrap {
  csrf?: string
  models: AIStarModelCategory[]
  state?: {
    activated?: boolean
    err?: string
    key?: AIStarActivationResponse
  }
}

export interface AIStarActivationResponse {
  access_code: string
  api_key: string
  service: string
  limit: number
  used: number
  activated_at: string
  base_url: string
}

export interface AIStarModelsResponse {
  data: AIStarModel[]
}

/**
 * Extract bootstrap data from the AI Star HTML page
 */
function readBootstrap(html: string): AIStarBootstrap {
  const marker = "window.__STARIMG_BOOTSTRAP__="
  const start = html.indexOf(marker)
  const end = start < 0 ? -1 : html.indexOf(";</script>", start + marker.length)
  if (start < 0 || end < 0) throw new Error("Could not find bootstrap data in AI Star page")
  return JSON.parse(html.slice(start + marker.length, end)) as AIStarBootstrap
}

export async function fetchBootstrapModels(): Promise<AIStarModel[]> {
  const response = await fetch(AI_STAR_BASE_URL)
  const html = await response.text()
  const bootstrap = readBootstrap(html)
  const allModels: AIStarModel[] = []

  for (const category of bootstrap.models) {
    for (const model of category.models) {
      allModels.push({
        ...model,
        category: category.id,
        category_label: category.label,
        category_label_en: category.labelEn,
      })
    }
  }

  return allModels
}

/**
 * Activate an access code and get the API key
 * This mimics the browser activation flow
 */
export async function activateAccessCode(accessCode: string): Promise<AIStarActivationResponse> {
  const response = await fetch(AI_STAR_BASE_URL)
  const bootstrap = readBootstrap(await response.text())
  if (!bootstrap.csrf) throw new Error("Could not extract CSRF token from AI Star page")
  const csrfCookie = response.headers.get("set-cookie")?.split(";", 1)[0]

  // The public site activates through its root form and returns a fresh HTML
  // bootstrap containing the customer key; there is no /api/activate endpoint.
  const activateResponse = await fetch(AI_STAR_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      ...(csrfCookie ? { Cookie: csrfCookie } : {}),
    },
    body: new URLSearchParams({
      csrf_token: bootstrap.csrf,
      lang: "en",
      access_code: accessCode,
    }).toString(),
  })
  const activated = readBootstrap(await activateResponse.text())
  const key = activated.state?.key
  if (!activateResponse.ok || activated.state?.err || !key?.api_key) {
    throw new Error(activated.state?.err || `Activation failed: ${activateResponse.status}`)
  }

  const baseURL = (key.base_url || AI_STAR_BASE_URL).replace(/\/+$/, "")
  return { ...key, access_code: key.access_code || accessCode, base_url: baseURL.endsWith("/v1") ? baseURL : `${baseURL}/v1` }
}

/**
 * Fetch models using a customer API key (sk-star-...)
 */
export async function fetchModelsWithApiKey(apiKey: string): Promise<AIStarModel[]> {
  const response = await fetch(`${AI_STAR_API_BASE}/v1/models`, {
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to fetch models: ${response.status} ${errorText}`)
  }

  const data = await response.json() as AIStarModelsResponse
  return data.data
}

/**
 * Fetch models from the reseller API (requires reseller access code)
 */
export async function fetchModelsFromResellerAPI(resellerAccessCode: string): Promise<AIStarModel[]> {
  const response = await fetch(`${AI_STAR_API_BASE}/reseller-api/v1/models`, {
    headers: {
      "Authorization": `Bearer ${resellerAccessCode}`,
      "Content-Type": "application/json",
    },
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to fetch models from reseller API: ${response.status} ${errorText}`)
  }

  const data = await response.json() as AIStarModelCatalog
  return data.data.data
}

/**
 * Convert AI Star models to StoredModel format
 */
export function convertToStoredModels(models: AIStarModel[]): { id: string; name: string }[] {
  return models.map((model) => ({
    id: model.id,
    name: model.display_name,
  }))
}

/**
 * Get the base URL for AI Star API
 */
export function getAIStarBaseURL(): string {
  return AI_STAR_API_BASE
}

/**
 * Check if an API key is an AI Star key
 */
export function isAIStarApiKey(apiKey: string): boolean {
  return apiKey.startsWith("sk-star-")
}

/**
 * Validate access code format (16-20 alphanumeric characters)
 */
export function validateAccessCode(code: string): boolean {
  return /^[A-Z0-9]{16,20}$/.test(code)
}