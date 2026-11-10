import { usePlugin } from "@opencode/plugin/gui"
import { For, Show, createResource, createSignal } from "solid-js"
import { ProviderRpc } from "../rpc"
import type { ExternalProvider, ImportResult, ProviderListResult, StoredProvider } from "../types"
import { ExternalProviderForm } from "./external-provider-form"
import { ProviderForm } from "./provider-form"

export function ProvidersPage() {
  const ctx = usePlugin()
  const t = (key: string, params?: Record<string, string | number | boolean>) => ctx.t(key, params)
  const rpc = () => ctx.client.rpc(ProviderRpc)

  const [data, { refetch }] = createResource<ProviderListResult>(async () => {
    return (await rpc().list({})) as ProviderListResult
  })

  const [importing, setImporting] = createSignal(false)

  const openForm = (editing?: StoredProvider) => {
    const taken = new Set<string>(data()?.existingProviderIDs ?? [])
    for (const provider of data()?.providers ?? []) taken.add(provider.id)
    if (editing) taken.delete(editing.id)
    ctx.dialogs.open((dialog) => (
      <ProviderForm
        editing={editing}
        takenProviderIDs={taken}
        onDone={(saved) => {
          dialog.close()
          if (saved) void refetch()
        }}
      />
    ))
  }

  const openExternalForm = (provider: ExternalProvider) => {
    ctx.dialogs.open((dialog) => (
      <ExternalProviderForm
        provider={provider}
        onDone={(saved) => {
          dialog.close()
          if (saved) void refetch()
        }}
      />
    ))
  }

  const remove = async (provider: StoredProvider) => {
    const ok = await ctx.dialogs.confirm({
      title: t("provider.delete.confirm.title", { name: provider.name }),
      description: t("provider.delete.confirm.description"),
      confirm: t("provider.list.delete"),
      danger: true,
    })
    if (!ok) return
    try {
      await rpc().remove({ id: provider.id })
      ctx.toast.show({
        variant: "success",
        title: t("provider.deleted.toast.title", { provider: provider.name }),
        description: t("provider.deleted.toast.description", { provider: provider.name }),
      })
      void refetch()
    } catch (err) {
      ctx.toast.show({
        variant: "error",
        title: t("common.requestFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const resetOverride = async (provider: ExternalProvider) => {
    const ok = await ctx.dialogs.confirm({
      title: t("provider.reset.confirm.title", { name: provider.name }),
      description: t("provider.reset.confirm.description"),
      confirm: t("provider.list.reset"),
      danger: true,
    })
    if (!ok) return
    try {
      await rpc().removeOverride({ id: provider.id })
      ctx.toast.show({
        variant: "success",
        title: t("provider.reset.toast.title", { provider: provider.name }),
        description: t("provider.reset.toast.description", { provider: provider.name }),
      })
      void refetch()
    } catch (err) {
      ctx.toast.show({
        variant: "error",
        title: t("common.requestFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const kindLabel = (kind: ExternalProvider["kind"]) =>
    t(kind === "custom" ? "provider.list.kind.custom" : "provider.list.kind.builtin")

  const importFromFile = async () => {
    if (!ctx.desktop) {
      ctx.toast.show({ variant: "error", title: t("provider.import.webUnavailable") })
      return
    }
    if (importing()) return
    setImporting(true)
    try {
      const picked = await ctx.desktop.pick({
        extensions: ["json", "txt"],
        multiple: true,
        title: t("provider.import.pickTitle"),
      })
      if (!picked || picked.length === 0) return
      const result = (await rpc().importProviders({ paths: [...picked] })) as ImportResult

      const total = result.added.length + result.updated.length + result.overridden.length
      if (total > 0) {
        const detailParts: string[] = [
          t("provider.import.success.description", {
            added: result.added.length,
            updated: result.updated.length,
            overridden: result.overridden.length,
          }),
        ]
        if (result.skipped.length > 0)
          detailParts.push(t("provider.import.skipped", { count: result.skipped.length }))
        if (result.errors.length > 0)
          detailParts.push(t("provider.import.failedFiles", { count: result.errors.length }))
        ctx.toast.show({
          variant: "success",
          title: t("provider.import.success.title", { count: total }),
          description: detailParts.join(" "),
        })
      } else if (result.errors.length > 0 || result.skipped.length > 0) {
        const lines = [
          ...result.errors,
          ...result.skipped.map((skip) => `${skip.id}: ${skip.reason}`),
        ]
        ctx.toast.show({
          variant: "error",
          title: t("provider.import.error.title"),
          description: lines.join("\n"),
        })
      } else {
        ctx.toast.show({
          variant: "default",
          title: t("provider.import.empty.title"),
          description: t("provider.import.empty.description"),
        })
      }
      void refetch()
    } catch (err) {
      ctx.toast.show({
        variant: "error",
        title: t("common.requestFailed"),
        description: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setImporting(false)
    }
  }

  return (
    <ctx.ui.SettingsLayout
      title={t("settings.providers.title")}
      description={t("settings.providers.description")}
      actions={
        <>
          <ctx.ui.Button variant="contrast" icon="plus-small" onClick={() => openForm()}>
            {t("provider.list.add")}
          </ctx.ui.Button>
          <ctx.ui.Button
            variant="neutral"
            icon="open-file"
            busy={importing()}
            onClick={() => void importFromFile()}
          >
            {t("provider.import.button")}
          </ctx.ui.Button>
        </>
      }
    >
      <Show when={!data.loading} fallback={<ctx.ui.Loader size="large" class="wm-loader" />}>
        <ctx.ui.SettingsSection title={t("provider.list.section.custom")}>
          <Show
            when={(data()?.providers.length ?? 0) > 0}
            fallback={<span class="wm-empty">{t("provider.list.empty")}</span>}
          >
            <For each={data()?.providers ?? []}>
              {(provider) => (
                <ctx.ui.SettingsRow
                  id={`provider-${provider.id}`}
                  title={<span class="wm-row-title">{provider.name}</span>}
                  description={<span class="wm-row-desc">{provider.id}</span>}
                >
                  <div class="wm-actions">
                    <ctx.ui.Button variant="ghost" size="small" icon="edit" onClick={() => openForm(provider)}>
                      {t("provider.list.edit")}
                    </ctx.ui.Button>
                    <ctx.ui.Button variant="ghost" size="small" icon="trash" onClick={() => void remove(provider)}>
                      {t("provider.list.delete")}
                    </ctx.ui.Button>
                  </div>
                </ctx.ui.SettingsRow>
              )}
            </For>
          </Show>
        </ctx.ui.SettingsSection>

        <ctx.ui.SettingsSection title={t("provider.list.section.external")}>
          <Show
            when={(data()?.externalProviders.length ?? 0) > 0}
            fallback={<span class="wm-empty">{t("provider.list.external.empty")}</span>}
          >
            <For each={data()?.externalProviders ?? []}>
              {(provider) => (
                <ctx.ui.SettingsRow
                  id={`provider-external-${provider.id}`}
                  title={
                    <span class="wm-row-title">
                      {provider.name}
                      <span class="wm-badge">{kindLabel(provider.kind)}</span>
                    </span>
                  }
                  description={
                    <span class="wm-row-desc">
                      {provider.id}
                      {provider.baseURL ? ` · ${provider.baseURL}` : ""}
                      {provider.overridden ? ` · ${t("provider.list.overridden")}` : ""}
                    </span>
                  }
                >
                  <div class="wm-actions">
                    <ctx.ui.Button variant="ghost" size="small" icon="edit" onClick={() => openExternalForm(provider)}>
                      {t("provider.list.edit")}
                    </ctx.ui.Button>
                    <Show when={provider.overridden}>
                      <ctx.ui.Button
                        variant="ghost"
                        size="small"
                        icon="reset"
                        onClick={() => void resetOverride(provider)}
                      >
                        {t("provider.list.reset")}
                      </ctx.ui.Button>
                    </Show>
                  </div>
                </ctx.ui.SettingsRow>
              )}
            </For>
          </Show>
        </ctx.ui.SettingsSection>
      </Show>
    </ctx.ui.SettingsLayout>
  )
}
