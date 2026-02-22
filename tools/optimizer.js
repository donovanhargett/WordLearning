/**
 * Optimizer runner
 * - Reads instructions from optimizer/CHANGES.md
 * - Creates a branch, commits a run log, pushes, opens a PR
 *
 * Requires repo secret: OPTIMIZER_PAT
 * Node 20+ (GitHub Actions ubuntu-latest uses Node 20)
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
  if (!fs.existsSync(changesPath)) {
    console.log(`No ${changesPath} found. Nothing to do.`);
    return;
  }

  const changes = fs.readFileSync(changesPath, "utf8").trim();
  if (!changes || changes.startsWith("#")) {
    console.log(`No actionable instructions in ${changesPath}.`);
    return;
  }

  // Configure git identity
  sh(`git config user.name "optimizer-bot"`);
  sh(`git config user.email "optimizer-bot@users.noreply.github.com"`);

  // Create branch
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const branch = `optimizer/${stamp}`;
  sh(`git checkout -b ${branch}`);

  // Write run log
  fs.mkdirSync("optimizer", { recursive: true });
  const logPath = "optimizer/LAST_RUN.md";
  fs.writeFileSync(
    logPath,
    `# Optimizer Run\n\n## Timestamp\n${new Date().toISOString()}\n\n## Requested changes\n\n${changes}\n`
  );

  // Commit
  sh(`git add ${logPath}`);
  sh(`git commit -m "chore: record optimizer run request"`);

  // Push using PAT
  const remoteUrl = `https://x-access-token:${pat}@github.com/${repo}.git`;
  sh(`git remote set-url origin "${remoteUrl}"`);
  sh(`git push -u origin ${branch}`);

  // Open PR
  const title = `Optimizer update (${stamp})`;
  const body = `This PR was created by Optimizer Bot.\n\nRequested changes:\n\n${changes}\n`;

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
