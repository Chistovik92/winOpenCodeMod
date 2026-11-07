import { DatabaseSync } from "node:sqlite"
import { homedir } from "node:os"
import { join } from "node:path"

const dbPath = join(homedir(), ".local", "share", "opencode", "opencode.db")
const db = new DatabaseSync(dbPath, { readOnly: true })

const row = db.prepare("SELECT value FROM kv WHERE key = ?").get("plugin:00770069006e006f00700065006e0063006f00640065006d006f0064:providers")
const providers = JSON.parse(row.value)
console.log("Stored providers count:", providers.length)
for (const p of providers) {
  console.log("\nProvider:", p.id, "| name:", p.name)
  console.log("baseURL:", p.baseURL)
  console.log("apiKey:", p.apiKey ? p.apiKey.slice(0, 12) + "..." : "(none)")
  console.log("models count:", p.models.length)
  console.log("models:", p.models.map((m) => m.id).join(", "))
}

const overridesRow = db.prepare("SELECT value FROM kv WHERE key = ?").get("plugin:00770069006e006f00700065006e0063006f00640065006d006f0064:overrides")
console.log("\nOverrides:", overridesRow ? overridesRow.value : "(none)")
