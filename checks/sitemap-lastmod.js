// Stamps <lastmod> in sitemap.xml for what actually changed since origin/main, so the dates stay honest:
//   - a page (.html) that changed  -> its URL gets today's date
//   - a listing line in a data*.js file that changed -> that listing's URL gets today's date
// URLs that didn't change keep whatever date they had (or none). Run by ship.sh before committing.
// Usage: node checks/sitemap-lastmod.js [--dry]
const fs = require("fs"), path = require("path"), cp = require("child_process");
const ROOT = path.resolve(__dirname, "..");
const SITE = "https://militarythingstodo.com";
const dry = process.argv.includes("--dry");
const today = new Date().toISOString().slice(0, 10);
const git = (args) => { try { return cp.execSync(`git ${args}`, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch { return ""; } };

const changed = git("diff --name-only origin/main --").split("\n").filter(Boolean)
  .concat(git("ls-files --others --exclude-standard").split("\n").filter(Boolean));
const stamp = new Set();
for (const f of changed) {
  if (/^[a-z0-9-]+\.html$/.test(f) && !["admin.html", "404.html"].includes(f)) stamp.add(f === "index.html" ? `${SITE}/` : `${SITE}/${f.replace(/\.html$/, "")}`);
  const m = f.match(/^data(?:-([a-z]+))?\.js$/);
  if (m) {
    const base = m[1] || "ramstein";
    for (const line of git(`diff -U0 origin/main -- ${f}`).split("\n")) {
      const id = /^[+-]\s*\{\s*id:"([^"]+)"/.exec(line);
      if (id) stamp.add(`${SITE}/listing?base=${base}&amp;id=${id[1]}`);
    }
  }
}

const file = path.join(ROOT, "sitemap.xml");
let xml = fs.readFileSync(file, "utf8"), n = 0;
xml = xml.replace(/<url><loc>([^<]+)<\/loc>(?:<lastmod>[^<]*<\/lastmod>)?<\/url>/g, (all, loc) => {
  if (!stamp.has(loc)) return all;
  n++; return `<url><loc>${loc}</loc><lastmod>${today}</lastmod></url>`;
});
if (!dry) fs.writeFileSync(file, xml);
console.log(`sitemap lastmod: ${n} URL(s) stamped ${today}${dry ? " (dry run)" : ""}`);
