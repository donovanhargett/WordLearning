/**
 * Optimizer runner (v2.1)
 * - Reads optimizer/CHANGES.md (for PR description)
 * - Applies optimizer/PATCH.diff (git diff patch)
 * - Commits + pushes branch
 * - Opens PR
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

function sanitizePatchText(raw) {
  let s = String(raw || "");
  // Normalize newlines
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // Strip markdown code fences if present
  s = s.replace(/^```(?:diff)?\n?/i, "");
  s = s.replace(/\n?```\s*$/i, "");
  // Trim outer whitespace but preserve internal newlines
  s = s.trim() + "\n";
  return s;
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
  const patchRaw = fs.readFileSync(patchPath, "utf8");
  const patch = sanitizePatchText(patchRaw);

  if (!patch || !patch.trim() || patch.trim().startsWith("#")) {
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

  // Write sanitized patch to temp file and apply
  const tmpPatch = path.join(os.tmpdir(), `optimizer-patch-${Date.now()}.diff`);
  fs.writeFileSync(tmpPatch, patch, "utf8");

  try {
    sh(`git apply --whitespace=nowarn "${tmpPatch}"`);
  } catch (e) {
    // Help debugging
    console.error("Patch apply failed. Showing first 120 lines of sanitized patch:\n");
    console.error(patch.split("\n").slice(0, 120).join("\n"));
    throw e;
  }

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
