#!/bin/bash
# Download the latest database by pulling from the repo
# The DB is now committed directly — no more artifact downloads

set -e

echo "Pulling latest database from repo..."
git pull origin main

echo "Database updated at data/corec.db"

# Show stats
if command -v sqlite3 &> /dev/null; then
  echo ""
  sqlite3 data/corec.db "SELECT COUNT(*) || ' readings from ' || COUNT(DISTINCT location_id) || ' locations' FROM readings;"
  sqlite3 data/corec.db "SELECT 'Range: ' || MIN(ts) || ' to ' || MAX(ts) FROM readings;"
fi
