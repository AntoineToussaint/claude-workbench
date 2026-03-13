#!/bin/bash
# Start workbench server with a clean environment (no Claude Code vars leak)
unset CLAUDECODE
unset ANTHROPIC_API_KEY
exec node "$(dirname "$0")/server.js"
