#!/usr/bin/env bash
# One-command ship: run every check, and only if they all pass commit -> push staging -> merge to main -> wait for the
# deploy -> run the live check. If the live check still fails after one retry, main is rolled back automatically.
# Usage: checks/ship.sh <commit-message-file>    (message file should already end with the attribution trailers)
set -eu
cd "$(dirname "$0")/.."
msg="${1:?usage: checks/ship.sh <commit-message-file>}"
[ "$(git branch --show-current)" = "staging" ] || { echo "run this on the staging branch"; exit 2; }
checks/run.sh all || { echo "STOPPED: checks failed, nothing was committed or merged."; exit 1; }
echo; echo "### changes since the last ship"; node checks/baseline.js || true
node checks/baseline.js --update >/dev/null
git add -A
git diff --cached --quiet || git commit -q -F "$msg"
git push -q origin staging
git checkout -q main && git pull -q origin main
git merge --no-ff -q staging -m "Merge staging" -m "$(sed -n '/^Co-Authored-By/,$p' "$msg")" || { git merge --abort; git checkout -q staging; echo "merge conflict — nothing was pushed to main"; exit 1; }
merge_sha="$(git rev-parse HEAD)"
git push -q origin main
echo "merged: $(git log --oneline -1)"
git checkout -q staging && git merge -q main && git push -q origin staging
if checks/run.sh live || { echo "live check failed — retrying once in case of a network blip"; sleep 20; checks/run.sh live; }; then exit 0; fi
echo "LIVE CHECK FAILED TWICE — rolling back production"
checks/rollback.sh "$merge_sha"
exit 1
