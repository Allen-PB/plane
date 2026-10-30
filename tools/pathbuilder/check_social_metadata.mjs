// Validate built or served initial HTML without executing application JavaScript.
// Usage: node tools/pathbuilder/check_social_metadata.mjs <index.html or URL>
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { JSDOM } = require("jsdom");
const title = "PathBuilder Sync | Plan. Build. Succeed.";
const description =
  "PathBuilder's unified workspace for project management, team collaboration, task tracking, and seamless coordination—all in one place.";
const site = "https://sync.pathbuilderedu.com/";
const imagePath = "/branding/pathbuilder-social.png";
const expected = {
  description,
  "og:title": title,
  "og:description": description,
  "og:site_name": "PathBuilder Sync",
  "og:type": "website",
  "og:url": site,
  "og:image": new URL(imagePath, site).href,
  "og:image:width": "1200",
  "og:image:height": "630",
  "twitter:card": "summary_large_image",
  "twitter:title": title,
  "twitter:description": description,
  "twitter:image": new URL(imagePath, site).href,
};

function verify(html) {
  const dom = new JSDOM(html); // Scripts and remote resources are disabled by default.
  const head = dom.window.document.head;
  assert.equal(head.querySelectorAll("title").length, 1);
  assert.equal(head.querySelector("title")?.textContent, title);
  for (const [key, value] of Object.entries(expected)) {
    const nodes = head.querySelectorAll(`meta[name="${key}"], meta[property="${key}"]`);
    assert.equal(nodes.length, 1, `${key}: missing or duplicate tag`);
    assert.equal(nodes[0].getAttribute("content"), value, key);
  }
  for (const node of head.querySelectorAll("meta")) {
    assert.doesNotMatch(node.getAttribute("content") ?? "", /open-source|plane\.so/i);
  }
  const icons = [
    ...head.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'),
  ].map((node) => node.getAttribute("href"));
  assert(icons.length > 0, "Existing favicon links are missing");
  dom.window.close();
  return icons;
}

function verifyImage(data) {
  assert.equal(data.subarray(1, 4).toString(), "PNG");
  assert.equal(data.readUInt32BE(16), 1200);
  assert.equal(data.readUInt32BE(20), 630);
}

async function fetchAsset(url, agent, type) {
  const response = await fetch(url, { headers: { "User-Agent": agent }, signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200, url);
  assert(response.headers.get("content-type")?.includes(type), `${url}: expected ${type}`);
  return Buffer.from(await response.arrayBuffer());
}

const target = process.argv[2];
assert(target, "Pass a built index.html path or HTTP URL");
if (/^https?:\/\//.test(target)) {
  for (const agent of ["facebookexternalhit/1.1", "Facebot", "Twitterbot/1.0", "MicrosoftPreview/2.0"]) {
    const html = await fetchAsset(target, agent, "text/html");
    const icons = verify(html.toString("utf8"));
    verifyImage(await fetchAsset(new URL(imagePath, target), agent, "image/png"));
    for (const icon of icons) await fetchAsset(new URL(icon, target), agent, "image/");
    console.log(`PASS initial HTML, sharing image, and favicons: ${agent}`);
  }
} else {
  const icons = verify(readFileSync(target, "utf8"));
  verifyImage(readFileSync(resolve(dirname(target), `.${imagePath}`)));
  for (const icon of icons) assert(existsSync(resolve(dirname(target), `.${icon}`)), icon);
  console.log("PASS built initial HTML, metadata, existing sharing image, and favicon assets");
}
