import { Command, Plugin, SettingsPage, Style } from "@opencode/plugin/gui"
import { en, ru } from "./gui/i18n"
import { ProvidersPage } from "./gui/providers-page"

const css = `
.wm-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.wm-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}
.wm-label {
  font-size: 12px;
  font-weight: 500;
  opacity: 0.7;
}
.wm-desc {
  font-size: 12px;
  opacity: 0.6;
  margin: 0;
}
.wm-error {
  font-size: 12px;
  color: var(--color-danger, #e5484d);
}
.wm-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.wm-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.wm-add {
  align-self: flex-start;
}
.wm-icon {
  margin-top: 20px;
}
.wm-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.wm-link {
  color: var(--color-accent, #6e56cf);
}
.wm-actions {
  display: flex;
  gap: 4px;
}
.wm-empty {
  font-size: 13px;
  opacity: 0.6;
  padding: 8px 0;
}
.wm-loader {
  padding: 24px 0;
}
.wm-row-title {
  font-weight: 500;
}
.wm-row-desc {
  opacity: 0.6;
}
`

export default Plugin.define({
  i18n: { en, ru },
  setup(ctx) {
    ctx.add(Style, css)
    ctx.add(SettingsPage, () => ({
      id: "providers",
      title: ctx.t("settings.providers.title"),
      icon: "providers" as const,
      render: () => <ProvidersPage />,
    }))
    ctx.add(Command, () => ({
      id: "providers",
      title: ctx.t("settings.providers.title"),
      run: () => ctx.layout.settings("providers"),
    }))
  },
})
