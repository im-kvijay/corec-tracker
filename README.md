# CoRec Tracker

Track Purdue CoRec occupancy to find the best times to work out.

## Setup

```bash
npm install
npm test
```

## Usage

```bash
npm run dashboard   # see current occupancy
npm run fetch       # collect data once
npm run analyze     # view patterns & best times
npm run start       # run continuous collection locally
```

## How it works

Pulls live occupancy data from the same API that powers the official RecWell website. Stores readings in SQLite, analyzes patterns over time.

Runs automatically via GitHub Actions every 15 minutes.

## Sync data from cloud

```bash
npm run download-db
npm run analyze
```
