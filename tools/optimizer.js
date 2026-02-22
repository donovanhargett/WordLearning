// Open PR
const title = `Optimizer update (${stamp})`;
const body = `This PR was created by Optimizer Bot.\n\nRequested changes:\n\n${changes}\n`;

const pr = shOut(
  `node -e "fetch('https://api.github.com/repos/${repo}/pulls', {method:'POST', headers:{'Authorization':'token ${pat}','Accept':'application/vnd.github+json'}, body: JSON.stringify({title:${JSON.stringify(
    title
  )}, head:${JSON.stringify(branch)}, base:'main', body:${JSON.stringify(body)}})}).then(r=>r.json()).then(j=>{console.log(j.html_url||JSON.stringify(j));})"`
);

async function githubCreatePR({ repo, pat, title, head, base, body }) {
  const res = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
    method: "POST",
    headers: {
      "Authorization": `token ${pat}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ title, head, base, body })
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`PR_CREATE_FAILED ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}


console.log("PR:", pr);
console.log("Done.");
