import { readFile } from "node:fs/promises";

const tag = process.argv[2] ?? process.env.GITHUB_REF_NAME;
if (!tag) {
  console.error("usage: node scripts/check-version.mjs <tag>");
  process.exit(2);
}

const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const expected = `v${version}`;
if (tag !== expected) {
  console.error(`release tag ${tag} does not match package version ${expected}`);
  process.exit(1);
}

console.log(version);
