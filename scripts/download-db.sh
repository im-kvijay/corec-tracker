#!/bin/bash
# Download the latest database from GitHub Actions artifacts
# Requires: gh CLI (brew install gh)

set -e

REPO="${GITHUB_REPO:-$(git remote get-url origin | sed 's/.*github.com[:/]\(.*\)\.git/\1/')}"

echo "Downloading latest database from $REPO..."

# Get the latest artifact
gh run download --repo "$REPO" --name corec-database --dir data/

echo "Database downloaded to data/corec.db"

# Show stats
if command -v sqlite3 &> /dev/null; then
  echo ""
  sqlite3 data/corec.db "SELECT COUNT(*) || ' readings from ' || COUNT(DISTINCT location_id) || ' locations' FROM readings;"
  sqlite3 data/corec.db "SELECT 'Range: ' || MIN(ts) || ' to ' || MAX(ts) FROM readings;"
fi
