/**
 * Optimizer runner
 * - Reads instructions from optimizer/CHANGES.md
 * - Creates a branch, commits changes, opens a PR using OPTIMIZER_PAT
 *
 * Notes:
 * - This does NOT talk to OpenAI. It just automates git + PR creation.
 * - You (Donovan) still tell the assistant what edits to make; then you paste the
 *   resulting updated files/patch into optimizer/CHANGES.md in a later iteration.
 */

const fs = require("fs");
const cp = require("child_process");

function sh(cmd) {
  return cp.execSync(cmd, { stdio: "inherit" });
}
function shOut(cmd) {
  return cp.execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] }).toString("utf8").trim();
}

const repo = process.env.GITHUB_REPO;
const pat = process.env.OPTIMIZER_PAT;

if (!repo) throw new Error("Missing env GITHUB_REPO");
if (!pat) throw new Error("Missing env OPTIMIZER_PAT");

const changesPath = "optimizer/CHANGES.md";
if (!fs.existsSync(changesPath)) {
  console.log(`No ${changesPath} found. Nothing to do.`);
  process.exit(0);
}

const changes = fs.readFileSync(changesPath, "utf8").trim();
if (!changes || changes.startsWith("#")) {
  console.log(`No actionable instructions in ${changesPath}.`);
  process.exit(0);
}

// Configure git
sh(`git config user.name "optimizer-bot"`);
sh(`git config user.email "optimizer-bot@users.noreply.github.com"`);

// Create branch
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const branch = `optimizer/${stamp}`;
sh(`git checkout -b ${branch}`);

// For now we just record the requested changes in a log file.
// You’ll evolve this script later to apply patches automatically.
const logPath = "optimizer/LAST_RUN.md";
fs.mkdirSync("optimizer", { recursive: true });
fs.writeFileSync(
  logPath,
  `# Optimizer Run\n\n## Timestamp\n${new Date().toISOString()}\n\n## Requested changes\n\n${changes}\n`
);

// Commit
sh(`git add ${logPath}`);
sh(`git commit -m "chore: record optimizer run request"`);

// Push branch using PAT
const remoteUrl = `https://x-access-token:${pat}@github.com/${repo}.git`;
sh(`git remote set-url origin "${remoteUrl}"`);
sh(`git push -u origin ${branch}`);

// Open PR
const title = `Optimizer update (${stamp})`;
const body = `This PR was created by Optimizer Bot.\n\nRequested changes:\n\n${changes}\n`;

const pr = shOut(
  `node -e "fetch('https://api.github.com/repos/${repo}/pulls', {method:'POST', headers:{'Authorization':'token ${pat}','Accept':'application/vnd.github+json'}, body: JSON.stringify({title:${JSON.stringify(
    title
  )}, head:${JSON.stringify(branch)}, base:'main', body:${JSON.stringify(body)}})}).then(r=>r.json()).then(j=>{console.log(j.html_url||JSON.stringify(j));})"`
);

console.log("PR:", pr);
console.log("Done.");
