// Prevent a successful web build from shipping raw translation keys when Git
// symlinks have been checked out as ordinary files (notably on Windows).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const localeRoot = path.join(root, "packages/i18n/locales");
assert(
  fs.statSync(localeRoot).isDirectory(),
  "packages/i18n/locales is not a directory. Restore the Git symlink or build on Linux; do not deploy this web bundle."
);
const english = fs.readdirSync(path.join(localeRoot, "en")).filter((name) => name.endsWith(".json"));
assert(english.length >= 28, "The English translation namespaces are incomplete.");

if (!process.argv.includes("--preflight")) {
  const build = path.resolve(process.argv[2] || path.join(root, "apps/web/build/client"));
  const scripts = fs
    .readdirSync(path.join(build, "assets"))
    .filter((name) => name.endsWith(".js"))
    .map((name) => fs.readFileSync(path.join(build, "assets", name), "utf8"));
  const missing = english.filter((name) => !scripts.some((script) => script.includes(`/en/${name}`)));
  assert.equal(missing.length, 0, `Translation loaders are missing from the built web assets: ${missing.join(", ")}`);
  const members = JSON.parse(fs.readFileSync(path.join(localeRoot, "en/workspace-settings.json"), "utf8"));
  const common = JSON.parse(fs.readFileSync(path.join(localeRoot, "en/common.json"), "utf8"));
  assert.equal(members.workspace_settings.settings.members.title, "Members");
  assert.equal(common.settings, "Settings");
  assert.equal(common.sign_out, "Sign out");
}
console.log(
  `Locale packaging verified: ${english.length} English namespaces${process.argv.includes("--preflight") ? " (preflight)" : " included in the web bundle"}.`
);
