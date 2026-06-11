#!/usr/bin/env bash
# <xbar.title>Headroom</xbar.title>
# <xbar.version>v0.2</xbar.version>
# <xbar.author>tyejcoleman</xbar.author>
# <xbar.desc>Live Claude Code budgets in the menu bar: rate-limit windows, context headroom, exhaustion warnings.</xbar.desc>
# <xbar.dependencies>node, headroom-harness</xbar.dependencies>
#
# Works with SwiftBar and xbar. Install: copy this file into your plugin folder
# (the .1s. in the name = refresh every second). If `headroom` is not on PATH,
# set HEADROOM_BIN below to e.g. "node /path/to/headroom/bin/headroom.mjs".

BIN="${HEADROOM_BIN:-headroom}"

if ! command -v ${BIN%% *} >/dev/null 2>&1; then
  echo "⛶ headroom?"
  echo "---"
  echo "headroom not found on PATH — set HEADROOM_BIN in this script"
  exit 0
fi

echo "⛶ $($BIN line 2>/dev/null || echo 'headroom: error')"
echo "---"
$BIN status 2>/dev/null | head -40 | sed 's/^/ /'
echo "---"
echo "Refresh | refresh=true"
echo "Repo | href=https://github.com/tyejcoleman/headroom"
