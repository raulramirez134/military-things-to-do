#!/usr/bin/env bash
# One-command ship: run every check, and only if they all pass commit -> push staging -> merge to main -> wait for the
# deploy -> run the live check. Stops (without merging) on the first failure.
# Usage: checks/ship.sh <commit-message-file>    (message file should already end with the attribution trailers)
set -eu
cd "$(dirname "$0")/.."
msg="${1:?usage: checks/ship.sh <commit-message-file>}"
[ "$(git branch --show-current)" = "staging" ] || { echo "run this on the staging branch"; exit 2; }
checks/run.sh all || { echo "STOPPED: checks failed, nothing was committed or merged."; exit 1; }
git add -A
git diff --cached --quiet || git commit -q -F "$msg"
git push -q origin staging
git checkout -q main && git pull -q origin main
git merge -q staging -m "Merge staging" -m "$(sed -n '/^Co-Authored-By/,$p' "$msg")" || { git merge --abort; git checkout -q staging; echo "merge conflict"; exit 1; }
git push -q origin main
echo "merged: $(git log --oneline -1)"
git checkout -q staging && git merge -q main && git push -q origin staging
checks/run.sh live
