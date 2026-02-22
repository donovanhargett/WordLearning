/**
 * Optimizer runner (FILES-based)
 *
 * Reads:
 *  - optimizer/CHANGES.md (PR description)
 *
 * If optimizer/FILES/ exists and contains files, copies them into repo (same relative paths)
 * and commits + PR.
 *
 * This avoids fragile diff/replace workflows for larger refactors.
 */

const fs = require("fs");
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

function listFilesRecursive(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listFilesRecursive(p));
    else out.push(p);
  }
  return out;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

(async () => {
  const changesPath = "optimizer/CHANGES.md";
  const filesDir = "optimizer/FILES";

  const changes = fs.existsSync(changesPath) ? fs.readFileSync(changesPath, "utf8").trim() : "";

  if (!fs.existsSync(filesDir)) {
    console.log(`No ${filesDir} directory. Nothing to do.`);
    return;
  }

  const srcFiles = listFilesRecursive(filesDir);
  if (!srcFiles.length) {
    console.log(`No files under ${filesDir}. Nothing to do.`);
    return;
  }

  // Configure git identity
  sh(`git config user.name "optimizer-bot"`);
  sh(`git config user.email "optimizer-bot@users.noreply.github.com"`);

  // Create branch
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const branch = `optimizer/${stamp}`;
  sh(`git checkout -b ${branch}`);

  // Copy files
  for (const absSrc of srcFiles) {
    const rel = path.relative(filesDir, absSrc);
    if (rel.startsWith("..")) continue;

    const dest = path.join(process.cwd(), rel);
    ensureDir(path.dirname(dest));
    fs.copyFileSync(absSrc, dest);
    console.log(`Copied: ${rel}`);
  }

  // Commit if changes
  const porcelain = cp.execSync("git status --porcelain").toString("utf8").trim();
  if (!porcelain) {
    console.log("No changes after copying files. Exiting.");
    return;
  }

  sh(`git add -A`);
  sh(`git commit -m "optimizer: apply file updates"`);

  // Push using PAT
  const remoteUrl = `https://x-access-token:${pat}@github.com/${repo}.git`;
  sh(`git remote set-url origin "${remoteUrl}"`);
  sh(`git push -u origin ${branch}`);

  // Open PR
  const prTitle = `Optimizer update (${stamp})`;
  const prBody = `This PR was created by Optimizer Bot.\n\nRequested changes:\n\n${changes || "(none)"}\n`;

  const pr = await githubCreatePR({
    repo,
    pat,
    title: prTitle,
    head: branch,
    base: "main",
    body: prBody,
  });

  console.log("PR:", pr.html_url);
})().catch((e) => {
  console.error(String(e?.stack || e));
  process.exit(1);
});
