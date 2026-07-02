#!/usr/bin/env bash
# <xbar.title>Tokenroom</xbar.title>
# <xbar.version>v0.2</xbar.version>
# <xbar.author>tyejcoleman</xbar.author>
# <xbar.desc>Live Claude Code budgets in the menu bar: rate-limit windows, context headroom, exhaustion warnings.</xbar.desc>
# <xbar.dependencies>node, tokenroom</xbar.dependencies>
#
# Works with SwiftBar and xbar. Install: copy this file into your plugin folder
# (the .1s. in the name = refresh every second). If `tokenroom` is not on PATH,
# set TOKENROOM_BIN below to e.g. "node /path/to/tokenroom/bin/tokenroom.mjs".

BIN="${TOKENROOM_BIN:-tokenroom}"

if ! command -v ${BIN%% *} >/dev/null 2>&1; then
  echo "⛶ tokenroom?"
  echo "---"
  echo "tokenroom not found on PATH — set TOKENROOM_BIN in this script"
  exit 0
fi

echo "⛶ $($BIN line 2>/dev/null || echo 'tokenroom: error')"
echo "---"
$BIN status 2>/dev/null | head -40 | sed 's/^/ /'
echo "---"
echo "Refresh | refresh=true"
echo "Repo | href=https://github.com/tyejcoleman/tokenroom"
