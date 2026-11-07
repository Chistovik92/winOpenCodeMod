import { usePlugin } from "@opencode/plugin/gui"
import { For, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { ProviderRpc } from "../rpc"
import type { ExternalProvider, ProviderOverride } from "../types"

type HeaderRow = { row: string; key: string; value: string; err: { key?: string; value?: string } }

let row = 0
const nextRow = () => `row-${row++}`
const headerRow = (): HeaderRow => ({ row: nextRow(), key: "", value: "", err: {} })

/**
 * Edit a provider that lives outside this plugin's storage (config-added or
 * built-in). Only name/baseURL/apiKey/headers can be overridden — the provider
 * ID and its model list stay as-is.
 */
export function ExternalProviderForm(props: {
  provider: ExternalProvider
  onDone: (saved: boolean) => void
}) {
  const ctx = usePlugin()
  const t = (key: string, params?: Record<string, string | number | boolean>) => ctx.t(key, params)
  const [saving, setSaving] = createSignal(false)

  const initialHeaders = Object.entries(props.provider.headers ?? {}).map(
    ([key, value]): HeaderRow => ({ row: nextRow(), key, value, err: {} }),
  )

  const [form, setForm] = createStore({
    name: props.provider.name ?? "",
    baseURL: props.provider.baseURL ?? "",
    apiKey: props.provider.apiKey ?? "",
    headers: initialHeaders.length > 0 ? initialHeaders : [headerRow()],
    err: {} as { name?: string; baseURL?: string },
  })

  const setName = (value: string) => {
    setForm("name", value)
    setForm("err", "name", undefined)
  }
  const setBaseURL = (value: string) => {
    setForm("baseURL", value)
    setForm("err", "baseURL", undefined)
  }
  const setApiKey = (value: string) => setForm("apiKey", value)

  const setHeader = (index: number, key: "key" | "value", value: string) => {
    setForm("headers", index, key, value)
    setForm("headers", index, "err", key, undefined)
  }
  const addHeader = () => setForm("headers", (rows) => [...rows, headerRow()])
  const removeHeader = (index: number) => {
    if (form.headers.length <= 1) return
    setForm("headers", (rows) => rows.filter((_, i) => i !== index))
  }

  const validate = (): ProviderOverride | null => {
    const name = form.name.trim()
    const baseURL = form.baseURL.trim()

    const nameError = !name ? t("provider.custom.error.name.required") : undefined
    const urlError =
      baseURL && !/^https?:\/\//.test(baseURL)
        ? t("provider.custom.error.baseURL.format")
        : undefined

    const seenHeaders = new Set<string>()
    const headerErrs = form.headers.map((header) => {
      const key = header.key.trim()
      const value = header.value.trim()
      if (!key && !value) return {}
      const keyError = !key
        ? t("provider.custom.error.required")
        : seenHeaders.has(key.toLowerCase())
          ? t("provider.custom.error.duplicate")
          : (seenHeaders.add(key.toLowerCase()), undefined)
      const valueError = !value ? t("provider.custom.error.required") : undefined
      return { key: keyError, value: valueError }
    })
    const headersValid = headerErrs.every((e) => !e.key && !e.value)

    setForm("err", { name: nameError, baseURL: urlError })
    headerErrs.forEach((err, index) => setForm("headers", index, "err", err))

    if (nameError || urlError || !headersValid) return null

    const headers = Object.fromEntries(
      form.headers
        .map((header) => ({ key: header.key.trim(), value: header.value.trim() }))
        .filter((header) => header.key && header.value)
        .map((header) => [header.key, header.value]),
    ) as Record<string, string>

    return {
      id: props.provider.id,
      name,
      ...(baseURL ? { baseURL } : {}),
      ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    }
  }

  const save = async () => {
    if (saving()) return
    const override = validate()
    if (!override) return
    const name = override.name ?? props.provider.name
    setSaving(true)
    try {
      await ctx.client.rpc(ProviderRpc).saveOverride(override)
      ctx.toast.show({
        variant: "success",
        title: t("provider.saved.toast.title", { provider: name }),
        description: t("provider.saved.toast.description", { provider: name }),
      })
      props.onDone(true)
    } catch (err) {
      setSaving(false)
      ctx.toast.show({
        variant: "error",
        title: t("common.requestFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const field = (
    label: string,
    value: string,
    onInput: (value: string) => void,
    opts: { placeholder?: string; error?: string; description?: string } = {},
  ) => (
    <div class="wm-field">
      <label class="wm-label">{label}</label>
      <ctx.ui.TextInput
        value={value}
        onInput={onInput}
        label={label}
        placeholder={opts.placeholder}
        invalid={!!opts.error}
        size="large"
      />
      {opts.error ? (
        <span class="wm-error">{opts.error}</span>
      ) : opts.description ? (
        <span class="wm-desc">{opts.description}</span>
      ) : null}
    </div>
  )

  return (
    <ctx.ui.Dialog
      title={t("provider.external.title.edit", { provider: props.provider.name })}
      size="large"
      footer={
        <div class="wm-footer">
          <ctx.ui.Button variant="neutral" onClick={() => props.onDone(false)}>
            {t("common.cancel")}
          </ctx.ui.Button>
          <ctx.ui.Button variant="contrast" busy={saving()} onClick={save}>
            {saving() ? t("common.saving") : t("common.save")}
          </ctx.ui.Button>
        </div>
      }
    >
      <div class="wm-form">
        <p class="wm-desc">{t("provider.external.description")}</p>

        <div class="wm-row">
          <div class="wm-field">
            <label class="wm-label">{t("provider.custom.field.providerID.label")}</label>
            <ctx.ui.TextInput
              value={props.provider.id}
              onInput={() => {}}
              disabled={true}
              label={t("provider.custom.field.providerID.label")}
              size="large"
            />
          </div>
        </div>

        {field(t("provider.custom.field.name.label"), form.name, setName, {
          placeholder: t("provider.custom.field.name.placeholder"),
          error: form.err.name,
        })}
        {field(t("provider.custom.field.baseURL.label"), form.baseURL, setBaseURL, {
          placeholder: t("provider.custom.field.baseURL.placeholder"),
          error: form.err.baseURL,
          description: t("provider.external.baseURL.description"),
        })}
        {field(t("provider.custom.field.apiKey.label"), form.apiKey, setApiKey, {
          placeholder: t("provider.custom.field.apiKey.placeholder"),
          description: t("provider.custom.field.apiKey.description"),
        })}

        <div class="wm-group">
          <label class="wm-label">{t("provider.custom.headers.label")}</label>
          <For each={form.headers}>
            {(header, index) => (
              <div class="wm-row">
                <div class="wm-field">
                  <ctx.ui.TextInput
                    value={header.key}
                    onInput={(v) => setHeader(index(), "key", v)}
                    label={t("provider.custom.headers.key.label")}
                    placeholder={t("provider.custom.headers.key.placeholder")}
                    invalid={!!header.err.key}
                    size="large"
                  />
                  {header.err.key ? <span class="wm-error">{header.err.key}</span> : null}
                </div>
                <div class="wm-field">
                  <ctx.ui.TextInput
                    value={header.value}
                    onInput={(v) => setHeader(index(), "value", v)}
                    label={t("provider.custom.headers.value.label")}
                    placeholder={t("provider.custom.headers.value.placeholder")}
                    invalid={!!header.err.value}
                    size="large"
                  />
                  {header.err.value ? <span class="wm-error">{header.err.value}</span> : null}
                </div>
                <ctx.ui.IconButton
                  icon="trash"
                  label={t("provider.custom.headers.remove")}
                  onClick={() => removeHeader(index())}
                  disabled={form.headers.length <= 1}
                  class="wm-icon"
                />
              </div>
            )}
          </For>
          <ctx.ui.Button variant="ghost" size="small" icon="plus-small" onClick={addHeader} class="wm-add">
            {t("provider.custom.headers.add")}
          </ctx.ui.Button>
        </div>
      </div>
    </ctx.ui.Dialog>
  )
}
