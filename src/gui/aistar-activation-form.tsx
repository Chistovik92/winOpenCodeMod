import { usePlugin } from "@opencode/plugin/gui"
import { createSignal } from "solid-js"
import { ProviderRpc } from "../rpc"

export function AISTarActivationForm(props: { onDone: (saved: boolean) => void }) {
  const ctx = usePlugin()
  const t = (key: string, params?: Record<string, string | number | boolean>) => ctx.t(key, params)
  const [accessCode, setAccessCode] = createSignal("")
  const [error, setError] = createSignal<string | null>(null)
  const [loading, setLoading] = createSignal(false)

  const validateCode = (code: string): boolean => {
    return /^[A-Z0-9]{16,20}$/.test(code)
  }

  const handleActivate = async () => {
    const code = accessCode().trim().toUpperCase()
    if (!validateCode(code)) {
      setError(t("aistar.activate.error.invalidCode"))
      return
    }

    setLoading(true)
    setError(null)
    try {
      const rpc = ctx.client.rpc(ProviderRpc)
      const result = await rpc.aiStarActivate({ accessCode: code })
      ctx.toast.show({
        variant: "success",
        title: t("aistar.activate.success.title"),
        description: t("aistar.activate.success.description"),
      })
      props.onDone(true)
    } catch (err: unknown) {
      let message = "Unknown error"
      if (err instanceof Error) {
        message = err.message
      } else if (typeof err === "object" && err !== null) {
        const obj = err as Record<string, unknown>
        if (typeof obj.message === "string") message = obj.message
        else if (typeof obj.error === "string") message = obj.error
        else if (typeof obj.error === "object" && obj.error !== null) {
          const errObj = obj.error as Record<string, unknown>
          if (typeof errObj.message === "string") message = errObj.message
        }
      }
      setError(t("aistar.activate.error.activationFailed", { message }))
      ctx.toast.show({
        variant: "error",
        title: t("aistar.activate.error.activationFailed", { message }),
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    props.onDone(false)
  }

  return (
    <ctx.ui.Dialog title={t("aistar.activate.title")} description={t("aistar.activate.description")}>
      <div class="wm-dialog-content">
        <div class="wm-field">
          <label class="wm-label">{t("aistar.activate.accessCode.label")}</label>
          <ctx.ui.TextInput
            value={accessCode()}
            onInput={(v: string) => setAccessCode(v)}
            label={t("aistar.activate.accessCode.label")}
            placeholder={t("aistar.activate.accessCode.placeholder")}
            disabled={loading()}
            class="wm-input"
          />
          <p class="wm-description">{t("aistar.activate.accessCode.description")}</p>
          {error() && <p class="wm-error">{error()}</p>}
        </div>
      </div>
      <div class="wm-dialog-actions">
        <ctx.ui.Button variant="neutral" onClick={handleCancel} disabled={loading()}>
          {t("common.cancel")}
        </ctx.ui.Button>
        <ctx.ui.Button variant="contrast" onClick={handleActivate} busy={loading()}>
          {loading() ? t("aistar.activate.activating") : t("aistar.activate.button")}
        </ctx.ui.Button>
      </div>
    </ctx.ui.Dialog>
  )
}