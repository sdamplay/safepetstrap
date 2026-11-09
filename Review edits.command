#!/bin/bash
# ==============================================================================
# SafePet Studio | Review edits.command
# Double-clickable macOS launcher for Local Video Review & QA (Frame.io loop)
# ==============================================================================

PORT=8765
URL="http://localhost:$PORT"

echo "========================================================"
echo "  SAFEPET UGC-FLOW-PRO | LOCAL REVIEW STUDIO"
echo "========================================================"

# Check if review_server is already running
if lsof -i :$PORT >/dev/null 2>&1; then
    echo "✓ Review server is already active on port $PORT."
else
    echo "Starting local review server on port $PORT..."
    nohup python3 /Users/imacm1/.gemini/config/skills/ugc-flow-pro/scripts/review_server.py > /tmp/ugc_review_server.log 2>&1 &
    sleep 1.2
fi

echo "Opening $URL in default browser..."
open "$URL"

echo "Studio running in background. You may close this terminal window."
exit 0
