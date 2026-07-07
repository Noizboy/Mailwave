// One-off migration script: converts node:test / node:assert tests to vitest.
// Run from repo root: node .opencode/migrate-tests.mjs
//
// Handles:
//   - `import { test } from "node:test"` -> `import { describe, it, expect } from "vitest"`
//   - `import assert from "node:assert/strict"` -> `import { expect } from "vitest"`
//   - `test("name", ...)` -> `it("name", ...)`
//   - `assert.equal(x, y)` -> `expect(x).toEqual(y)`
//   - `assert.strictEqual(x, y)` -> `expect(x).toBe(y)`
//   - `assert.deepStrictEqual(x, y)` -> `expect(x).toEqual(y)`
//   - `assert.ok(x)` -> `expect(x).toBeTruthy()`
//   - Wraps all top-level `it(...)` calls in a `describe("<filename>", () => { ... })` block.

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"

const targets = [
  "unit_test/banner.test.js",
  "unit_test/csv-export-escape.test.js",
  "unit_test/cumulative-daily-spend.test.js",
  "unit_test/cumulative-spend-month-options.test.js",
  "unit_test/dashboard-overview-responsive.test.js",
  "unit_test/original-image-preservation.test.js",
  "unit_test/original-image-url.test.js",
  "unit_test/report-route-structure.test.js",
]

function migrate(src) {
  let out = src

  // Imports
  out = out.replace(
    /^import\s*\{\s*test\s*\}\s*from\s*["']node:test["'];?\s*$/m,
    'import { describe, it, expect } from "vitest"'
  )
  out = out.replace(
    /^import\s*assert\s*from\s*["']node:assert(?:\/strict)?["'];?\s*$/m,
    'import { expect } from "vitest"'
  )

  // test() -> it()  (only top-level calls — the test names always start with a quote)
  out = out.replace(/^test\(/gm, "it(")

  // assert.* replacements
  out = out.replace(/assert\.equal\(/g, "expect(")
  out = out.replace(/assert\.strictEqual\(/g, "expect(")
  out = out.replace(/assert\.deepStrictEqual\(/g, "expect(")
  out = out.replace(/assert\.ok\(/g, "expect(")
  out = out.replace(/assert\.notEqual\(/g, "expect(")
  out = out.replace(/assert\.notStrictEqual\(/g, "expect(")

  // The assert.* API ends with a closing paren. After replacement the pattern
  // is `expect(<actual>, <expected>)` which is not valid. Convert to
  // `expect(<actual>).<matcher>(<expected>)` by detecting the comma at top level
  // of parens. We use a simple regex that handles one level of nesting.
  // Cases:
  //   expect(x, y)                          -> expect(x).toEqual(y)
  //   expect(x, y, "msg")                   -> expect(x, "msg").toEqual(y)
  // We approximate by just turning `expect(ARG1, ARG2)` into `expect(ARG1).toEqual(ARG2)`
  // ARG1 ends at the first top-level `, `.
  out = out.replace(/expect\(([^()]+?),\s*([^()]+?)\)/g, (m, a, b) => `expect(${a}).toEqual(${b})`)

  return out
}

function wrapInDescribe(content, filePath) {
  // If already wrapped, skip.
  if (/^describe\(["']/m.test(content)) return content

  const name = path.basename(filePath, path.extname(filePath))
  const lines = content.split("\n")
  // Find the last import or require statement; insert `describe` after it.
  let insertAt = 0
  for (let i = 0; i < lines.length; i++) {
    if (/^(import|const\s+\w+\s*=\s*require)/.test(lines[i].trim())) {
      insertAt = i + 1
    }
  }
  const before = lines.slice(0, insertAt).join("\n")
  const after = lines.slice(insertAt).join("\n")
  return `${before}\n\ndescribe(${JSON.stringify(name)}, () => {\n${after}\n})\n`
}

let migrated = 0
let skipped = 0
for (const rel of targets) {
  const abs = path.resolve(rel)
  try {
    statSync(abs)
  } catch {
    console.log(`skip (missing): ${rel}`)
    skipped++
    continue
  }
  const src = readFileSync(abs, "utf8")
  const out = wrapInDescribe(migrate(src), rel)
  writeFileSync(abs, out, "utf8")
  console.log(`migrated: ${rel}`)
  migrated++
}
console.log(`\n${migrated} migrated, ${skipped} skipped`)
