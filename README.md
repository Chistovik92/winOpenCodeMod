# winOpenCodeMod

A GUI plugin for OpenCode Desktop that restores the v1.19.x **Custom provider** form
inside **Settings → Providers**. It lets you add, edit and delete custom
OpenAI-compatible providers without editing `opencode.json` by hand.

## What it does

- Adds a **Providers** settings page.
- Reproduces the v1.19.x "Custom provider" form (fields, layout and copy, en + ru).
- Persists custom providers in OpenCode plugin storage and re-applies them on every
  reload via the provider transform, so they show up as selectable models.

## Stack

- TypeScript + Solid.js, bundled with Vite using the `@opencode/plugin/gui/vite` preset.
- Server half: `src/index.ts` (provider transform + RPC).
- GUI half: `src/gui.tsx` → `dist/gui-experimental.cjs`.

## Build

```sh
npm install
npm run build        # produces dist/gui-experimental.cjs
npm run typecheck    # tsc --noEmit
```

## Install

Add the plugin to `opencode.json` (desktop reads plugins from
`C:\Users\<you>\.config\opencode\opencode.json` on Windows):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["E:/Git/winOpenCodeMod"]
}
```

Then open **Settings → Providers** and use **Add provider**.
