/**
 * Optimizer runner (v2)
 * - Reads optimizer/CHANGES.md (for PR description)
 * - Applies optimizer/PATCH.diff (git diff patch)
 * - Commits + pushes branch
 * - Opens PR
 */

const fs = require("fs");
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

(async () => {
  const changesPath = "optimizer/CHANGES.md";
  const patchPath = "optimizer/PATCH.diff";

  if (!fs.existsSync(changesPath)) {
    console.log(`No ${changesPath} found. Nothing to do.`);
    return;
  }
  if (!fs.existsSync(patchPath)) {
    console.log(`No ${patchPath} found. Nothing to do.`);
    return;
  }

  const changes = fs.readFileSync(changesPath, "utf8").trim();
  const patch = fs.readFileSync(patchPath, "utf8").trim();

  if (!patch || patch.startsWith("#")) {
    console.log(`No actionable patch in ${patchPath}.`);
    return;
  }

  // Configure git identity
  sh(`git config user.name "optimizer-bot"`);
  sh(`git config user.email "optimizer-bot@users.noreply.github.com"`);

  // Create branch
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const branch = `optimizer/${stamp}`;
  sh(`git checkout -b ${branch}`);

  // Apply patch
  // --whitespace=nowarn helps with copy/pasted patches
  sh(`git apply --whitespace=nowarn ${patchPath}`);

  // Show what changed (debug visibility in Actions logs)
  sh(`git status`);
  sh(`git diff --stat`);

  // Commit all changes
  sh(`git add -A`);
  sh(`git commit -m "optimizer: apply requested changes"`);

  // Push using PAT
  const remoteUrl = `https://x-access-token:${pat}@github.com/${repo}.git`;
  sh(`git remote set-url origin "${remoteUrl}"`);
  sh(`git push -u origin ${branch}`);

  // Open PR
  const title = `Optimizer update (${stamp})`;
  const body = `This PR was created by Optimizer Bot.\n\nRequested changes:\n\n${changes || "(none)"}\n`;

  const pr = await githubCreatePR({
    repo,
    pat,
    title,
    head: branch,
    base: "main",
    body,
  });

  console.log("PR:", pr.html_url);
})().catch((e) => {
  console.error(String(e?.stack || e));
  process.exit(1);
});
