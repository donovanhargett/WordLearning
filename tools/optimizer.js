/**
 * Optimizer runner (replacements-based)
 *
 * Reads:
 *  - optimizer/CHANGES.md (PR description)
 *  - optimizer/REPLACEMENTS.json (what to change)
 *
 * Applies exact string replacements to files, commits, pushes branch, opens PR.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

function sh(cmd) {
  return cp.execSync(cmd, { stdio: "inherit" });
}

const repo = process.env.GITHUB_REPO;
const pat = process.env.OPTIMIZER_PAT;

if (!repo) throw new Error("Missing env GITHUB_REPO");
if (!pat) throw new Error("Missing env OPTIMIZER_PAT");

async function githubCreatePR({ repo, pat, title, head, base, body }) {
  const res = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
    method: "POST",
    headers: {
      Authorization: `token ${pat}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title, head, base, body }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`PR_CREATE_FAILED ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

function readJson(p) {
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

function applyOneReplacement({ file, find, replace, mode }) {
  if (!file || typeof file !== "string") throw new Error("Replacement missing 'file'");
  if (typeof find !== "string") throw new Error(`Replacement for ${file} missing 'find' string`);
  if (typeof replace !== "string") throw new Error(`Replacement for ${file} missing 'replace' string`);

  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) throw new Error(`Target file not found: ${file}`);

  const before = fs.readFileSync(p, "utf8");

  if (mode === "regex") {
    const re = new RegExp(find, "m");
    if (!re.test(before)) throw new Error(`Regex not found in ${file}: ${find}`);
    const after = before.replace(re, replace);
    fs.writeFileSync(p, after, "utf8");
    return;
  }

  // default: exact string replace (all occurrences)
  if (!before.includes(find)) {
    throw new Error(`Find text not found in ${file}. (Exact match required)\n--- FIND START ---\n${find}\n--- FIND END ---`);
  }
  const after = before.split(find).join(replace);
  fs.writeFileSync(p, after, "utf8");
}

(async () => {
  const changesPath = "optimizer/CHANGES.md";
  const replPath = "optimizer/REPLACEMENTS.json";

  if (!fs.existsSync(replPath)) {
    console.log(`No ${replPath} found. Nothing to do.`);
    return;
  }

  const changes = fs.existsSync(changesPath) ? fs.readFileSync(changesPath, "utf8").trim() : "";
  const spec = readJson(replPath);

  const base = spec.base || "main";
  const commitMessage = spec.commitMessage || "optimizer: apply replacements";
  const replacements = Array.isArray(spec.replacements) ? spec.replacements : [];

  if (!replacements.length) {
    console.log(`No replacements listed in ${replPath}. Nothing to do.`);
    return;
  }

  // Configure git identity
  sh(`git config user.name "optimizer-bot"`);
  sh(`git config user.email "optimizer-bot@users.noreply.github.com"`);

  // Create branch
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const branch = `optimizer/${stamp}`;
  sh(`git checkout -b ${branch}`);

  // Apply replacements
  for (const r of replacements) {
    applyOneReplacement(r);
  }

  // Commit
  sh(`git status`);
  sh(`git add -A`);
  sh(`git commit -m ${JSON.stringify(commitMessage)}`);

  // Push using PAT
  const remoteUrl = `https://x-access-token:${pat}@github.com/${repo}.git`;
  sh(`git remote set-url origin "${remoteUrl}"`);
  sh(`git push -u origin ${branch}`);

  // PR
  const prTitle = `Optimizer update (${stamp})`;
  const prBody = `This PR was created by Optimizer Bot.\n\nRequested changes:\n\n${changes || "(none)"}\n`;

  const pr = await githubCreatePR({
    repo,
    pat,
    title: prTitle,
    head: branch,
    base,
    body: prBody,
  });

  console.log("PR:", pr.html_url);
})().catch((e) => {
  console.error(String(e?.stack || e));
  process.exit(1);
});
