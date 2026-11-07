import { usePlugin } from "@opencode/plugin/gui"
import { For, createSignal } from "solid-js"
import { createStore } from "solid-js/store"
import { ProviderRpc } from "../rpc"
import type { StoredModel, StoredProvider } from "../types"

const PROVIDER_ID = /^[a-z0-9][a-z0-9-_]*$/

type ModelRow = { row: string; id: string; name: string; err: { id?: string; name?: string } }
type HeaderRow = { row: string; key: string; value: string; err: { key?: string; value?: string } }

let row = 0
const nextRow = () => `row-${row++}`
const modelRow = (): ModelRow => ({ row: nextRow(), id: "", name: "", err: {} })
const headerRow = (): HeaderRow => ({ row: nextRow(), key: "", value: "", err: {} })

export function ProviderForm(props: {
  editing?: StoredProvider
  takenProviderIDs: Set<string>
  onDone: (saved: boolean) => void
}) {
  const ctx = usePlugin()
  const t = (key: string, params?: Record<string, string | number | boolean>) => ctx.t(key, params)
  const [saving, setSaving] = createSignal(false)

  const initialModels = (props.editing?.models ?? []).map(
    (model: StoredModel): ModelRow => ({ row: nextRow(), id: model.id, name: model.name, err: {} }),
  )
  const initialHeaders = Object.entries(props.editing?.headers ?? {}).map(
    ([key, value]): HeaderRow => ({ row: nextRow(), key, value, err: {} }),
  )

  const [form, setForm] = createStore({
    providerID: props.editing?.id ?? "",
    name: props.editing?.name ?? "",
    baseURL: props.editing?.baseURL ?? "",
    apiKey: props.editing?.apiKey ?? "",
    models: initialModels.length > 0 ? initialModels : [modelRow()],
    headers: initialHeaders.length > 0 ? initialHeaders : [headerRow()],
    err: {} as { providerID?: string; name?: string; baseURL?: string },
  })

  const setField = (key: "providerID" | "name" | "baseURL", value: string) => {
    setForm(key, value)
    setForm("err", key, undefined)
  }

  const setApiKey = (value: string) => setForm("apiKey", value)

  const setModel = (index: number, key: "id" | "name", value: string) => {
    setForm("models", index, key, value)
    setForm("models", index, "err", key, undefined)
  }

  const setHeader = (index: number, key: "key" | "value", value: string) => {
    setForm("headers", index, key, value)
    setForm("headers", index, "err", key, undefined)
  }

  const addModel = () => setForm("models", (rows) => [...rows, modelRow()])
  const removeModel = (index: number) => {
    if (form.models.length <= 1) return
    setForm("models", (rows) => rows.filter((_, i) => i !== index))
  }
  const addHeader = () => setForm("headers", (rows) => [...rows, headerRow()])
  const removeHeader = (index: number) => {
    if (form.headers.length <= 1) return
    setForm("headers", (rows) => rows.filter((_, i) => i !== index))
  }

  const validate = (): StoredProvider | null => {
    const providerID = form.providerID.trim()
    const name = form.name.trim()
    const baseURL = form.baseURL.trim()
    const apiKey = form.apiKey.trim()

    const idError = !providerID
      ? t("provider.custom.error.providerID.required")
      : !PROVIDER_ID.test(providerID)
        ? t("provider.custom.error.providerID.format")
        : undefined
    const nameError = !name ? t("provider.custom.error.name.required") : undefined
    const urlError = !baseURL
      ? t("provider.custom.error.baseURL.required")
      : !/^https?:\/\//.test(baseURL)
        ? t("provider.custom.error.baseURL.format")
        : undefined
    const existsError = idError
      ? undefined
      : props.takenProviderIDs.has(providerID)
        ? t("provider.custom.error.providerID.exists")
        : undefined

    const seenModels = new Set<string>()
    const modelErrs = form.models.map((model) => {
      const id = model.id.trim()
      const idError = !id
        ? t("provider.custom.error.required")
        : seenModels.has(id)
          ? t("provider.custom.error.duplicate")
          : (seenModels.add(id), undefined)
      const nameError = !model.name.trim() ? t("provider.custom.error.required") : undefined
      return { id: idError, name: nameError }
    })
    const modelsValid = modelErrs.every((e) => !e.id && !e.name)

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

    setForm("err", {
      providerID: idError ?? existsError,
      name: nameError,
      baseURL: urlError,
    })
    modelErrs.forEach((err, index) => setForm("models", index, "err", err))
    headerErrs.forEach((err, index) => setForm("headers", index, "err", err))

    if (idError || existsError || nameError || urlError || !modelsValid || !headersValid) return null

    const headers = Object.fromEntries(
      form.headers
        .map((header) => ({ key: header.key.trim(), value: header.value.trim() }))
        .filter((header) => header.key && header.value)
        .map((header) => [header.key, header.value]),
    ) as Record<string, string>

    return {
      id: providerID,
      name,
      baseURL,
      ...(apiKey ? { apiKey } : {}),
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
      models: form.models.map((model) => ({ id: model.id.trim(), name: model.name.trim() })),
    }
  }

  const save = async () => {
    if (saving()) return
    const provider = validate()
    if (!provider) return
    setSaving(true)
    try {
      await ctx.client.rpc(ProviderRpc).save(provider)
      ctx.toast.show({
        variant: "success",
        title: t("provider.saved.toast.title", { provider: provider.name }),
        description: t("provider.saved.toast.description", { provider: provider.name }),
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
    opts: { placeholder?: string; error?: string; description?: string; disabled?: boolean } = {},
  ) => (
    <div class="wm-field">
      <label class="wm-label">{label}</label>
      <ctx.ui.TextInput
        value={value}
        onInput={onInput}
        label={label}
        placeholder={opts.placeholder}
        invalid={!!opts.error}
        disabled={opts.disabled}
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
      title={t(props.editing ? "provider.custom.title.edit" : "provider.custom.title")}
      size="large"
      footer={
        <div class="wm-footer">
          <ctx.ui.Button variant="neutral" onClick={() => props.onDone(false)}>
            {t("common.cancel")}
          </ctx.ui.Button>
          <ctx.ui.Button variant="contrast" busy={saving()} onClick={save}>
            {saving() ? t("common.saving") : t("common.submit")}
          </ctx.ui.Button>
        </div>
      }
    >
      <div class="wm-form">
        <p class="wm-desc">
          {t("provider.custom.description.prefix")}
          <a
            class="wm-link"
            href="#"
            onClick={(event) => {
              event.preventDefault()
              ctx.system.openExternal("https://opencode.ai/docs/providers/#custom-provider")
            }}
          >
            {t("provider.custom.description.link")}
          </a>
          {t("provider.custom.description.suffix")}
        </p>

        {field(t("provider.custom.field.providerID.label"), form.providerID, (v) => setField("providerID", v), {
          placeholder: t("provider.custom.field.providerID.placeholder"),
          error: form.err.providerID,
          description: t("provider.custom.field.providerID.description"),
          disabled: !!props.editing,
        })}
        {field(t("provider.custom.field.name.label"), form.name, (v) => setField("name", v), {
          placeholder: t("provider.custom.field.name.placeholder"),
          error: form.err.name,
        })}
        {field(t("provider.custom.field.baseURL.label"), form.baseURL, (v) => setField("baseURL", v), {
          placeholder: t("provider.custom.field.baseURL.placeholder"),
          error: form.err.baseURL,
        })}
        {field(t("provider.custom.field.apiKey.label"), form.apiKey, setApiKey, {
          placeholder: t("provider.custom.field.apiKey.placeholder"),
          description: t("provider.custom.field.apiKey.description"),
        })}

        <div class="wm-group">
          <label class="wm-label">{t("provider.custom.models.label")}</label>
          <For each={form.models}>
            {(model, index) => (
              <div class="wm-row">
                <div class="wm-field">
                  <ctx.ui.TextInput
                    value={model.id}
                    onInput={(v) => setModel(index(), "id", v)}
                    label={t("provider.custom.models.id.label")}
                    placeholder={t("provider.custom.models.id.placeholder")}
                    invalid={!!model.err.id}
                    size="large"
                  />
                  {model.err.id ? <span class="wm-error">{model.err.id}</span> : null}
                </div>
                <div class="wm-field">
                  <ctx.ui.TextInput
                    value={model.name}
                    onInput={(v) => setModel(index(), "name", v)}
                    label={t("provider.custom.models.name.label")}
                    placeholder={t("provider.custom.models.name.placeholder")}
                    invalid={!!model.err.name}
                    size="large"
                  />
                  {model.err.name ? <span class="wm-error">{model.err.name}</span> : null}
                </div>
                <ctx.ui.IconButton
                  icon="trash"
                  label={t("provider.custom.models.remove")}
                  onClick={() => removeModel(index())}
                  disabled={form.models.length <= 1}
                  class="wm-icon"
                />
              </div>
            )}
          </For>
          <ctx.ui.Button variant="ghost" size="small" icon="plus-small" onClick={addModel} class="wm-add">
            {t("provider.custom.models.add")}
          </ctx.ui.Button>
        </div>

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
