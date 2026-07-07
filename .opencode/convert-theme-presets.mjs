// One-off conversion: theme-presets.ts → theme-presets.json
// Reads the .ts file, strips TS syntax, evaluates the literal, writes JSON.
// Usage: node .opencode/convert-theme-presets.mjs
//
// Output: same basename, .json extension, in the same directory.

import { readFileSync, writeFileSync, unlinkSync, renameSync } from "node:fs"
import path from "node:path"

const sources = [
  "frontend/src/utils/tweakcn-theme-presets.ts",
  "frontend/src/utils/shadcn-ui-theme-presets.ts",
]

for (const rel of sources) {
  const abs = path.resolve(rel)
  const src = readFileSync(abs, "utf8")

  // 1. Strip `import type { ... } from "..."` lines
  let body = src.replace(/^import\s+type\s+\{[^}]*\}\s+from\s+["'][^"']+["'];?\s*$/gm, "")

  // 2. Strip `export const <name>: <Type> =` → leave just the object literal.
  //    Match `export const <ident>[: <type>]* =`
  body = body.replace(/export\s+const\s+\w+(\s*:\s*[^=]+)?\s*=\s*/, "")

  // 3. Drop the trailing semicolon
  body = body.replace(/;\s*$/, "").trim()

  // 4. Eval the resulting object literal in a sandbox. Use indirect eval to
  //    run in global scope (so any stray identifiers don't resolve to module
  //    locals).
  // eslint-disable-next-line no-eval
  const data = (0, eval)(`(${body})`)

  const jsonPath = abs.replace(/\.ts$/, ".json")
  writeFileSync(jsonPath, JSON.stringify(data, null, 2) + "\n", "utf8")
  console.log(
    `converted: ${rel}  →  ${path.relative(process.cwd(), jsonPath)}  (${data && Object.keys(data).length} presets)`
  )
}
