import { usePlugin } from "@opencode/plugin/gui"
import { For, Show, createResource } from "solid-js"
import { ProviderRpc } from "../rpc"
import type { ProviderListResult, StoredProvider } from "../types"
import { ProviderForm } from "./provider-form"

export function ProvidersPage() {
  const ctx = usePlugin()
  const t = (key: string, params?: Record<string, string | number | boolean>) => ctx.t(key, params)
  const rpc = () => ctx.client.rpc(ProviderRpc)

  const [data, { refetch }] = createResource<ProviderListResult>(async () => {
    return (await rpc().list({})) as ProviderListResult
  })

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

  return (
    <ctx.ui.SettingsLayout
      title={t("settings.providers.title")}
      description={t("settings.providers.description")}
      actions={
        <ctx.ui.Button variant="contrast" icon="plus-small" onClick={() => openForm()}>
          {t("provider.list.add")}
        </ctx.ui.Button>
      }
    >
      <Show when={!data.loading} fallback={<ctx.ui.Loader size="large" class="wm-loader" />}>
        <ctx.ui.SettingsSection>
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
      </Show>
    </ctx.ui.SettingsLayout>
  )
}
