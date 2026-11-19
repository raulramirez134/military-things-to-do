#!/usr/bin/env bash
# Undo a bad production merge. Usage: checks/rollback.sh <merge-commit-sha>
# 1) reverts the merge on main (history is kept, no force-push), 2) keeps your work on staging so you can fix it and
#    ship again (merge -s ours avoids the "reverted merge never re-applies" git trap), 3) waits for the deploy and re-checks live.
set -eu
cd "$(dirname "$0")/.."
sha="${1:?usage: checks/rollback.sh <merge-commit-sha>}"
git checkout -q main && git pull -q origin main
git revert -m 1 --no-edit "$sha" >/dev/null
git push -q origin main
rv="$(git rev-parse --short HEAD)"
git checkout -q staging
git merge -s ours -q main -m "Keep staging work after rollback of ${sha:0:7} (main reverted in $rv)"
git push -q origin staging
echo "ROLLED BACK: main now reverts ${sha:0:7} (commit $rv). Your changes are still on staging — fix them, then run checks/ship.sh again."
[ "${ROLLBACK_VERIFY:-1}" = "0" ] || checks/run.sh live
