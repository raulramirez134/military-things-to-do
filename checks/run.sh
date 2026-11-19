#!/usr/bin/env bash
# Pre-merge check suite. Usage: checks/run.sh [fast|all|live]   (default: all)
#   fast = static + browser   all = static + browser + local worker   live = post-deploy check of the live site
# Exits non-zero if ANY check fails (warnings don't fail). Run from anywhere.
set -u
cd "$(dirname "$0")/.."
export NODE_PATH="${NODE_PATH:-$(npm root -g 2>/dev/null)}"
mode="${1:-all}"; rc=0
run() { echo; echo "### $*"; node "$@" || rc=1; }
case "$mode" in
  fast) run checks/check-static.js; run checks/check-browser.js ;;
  all)  run checks/check-static.js; run checks/check-browser.js; run checks/check-worker.js ;;
  live) run checks/check-live.js --wait ;;
  *) echo "usage: checks/run.sh [fast|all|live]"; exit 2 ;;
esac
echo; if [ $rc -eq 0 ]; then echo "ALL CHECKS PASSED ($mode)"; else echo "CHECKS FAILED ($mode) — do not merge"; fi
exit $rc
