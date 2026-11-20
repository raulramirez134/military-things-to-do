#!/usr/bin/env bash
# Pre-merge check suite. Usage: checks/run.sh [fast|all|live]   (default: all)
#   fast = static + browser (Chromium)   all = static + browser (Chromium + WebKit/iPhone Safari + Firefox) + local worker
#   live = post-deploy check of the live site.   BROWSERS="chromium webkit" overrides the engines used by `all`.
# Exits non-zero if ANY check fails (warnings don't fail). Run from anywhere.
set -u
cd "$(dirname "$0")/.."
export NODE_PATH="${NODE_PATH:-$(npm root -g 2>/dev/null)}"
mode="${1:-all}"; rc=0
run() { echo; echo "### $*"; node "$@" || rc=1; }
case "$mode" in
  fast) run checks/check-static.js; run checks/check-quality.js; run checks/check-browser.js ;;
  all)  run checks/check-static.js; run checks/check-quality.js
        for e in ${BROWSERS:-chromium webkit firefox}; do echo; echo "### browser engine: $e"; ENGINE=$e node checks/check-browser.js || rc=1; done
        run checks/check-worker.js ;;
  live) run checks/check-live.js --wait ;;
  *) echo "usage: checks/run.sh [fast|all|live]"; exit 2 ;;
esac
echo; if [ $rc -eq 0 ]; then echo "ALL CHECKS PASSED ($mode)"; else echo "CHECKS FAILED ($mode) — do not merge"; fi
exit $rc
