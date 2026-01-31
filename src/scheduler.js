#!/usr/bin/env node
import { getApiUrl, CONFIG } from './config.js';
import { getDb, upsertLocation, insertReading, getReadingStats, closeDb } from './db.js';

async function fetchAndStore() {
  const url = getApiUrl();
  const timestamp = new Date().toISOString();

  console.log(`\n[${timestamp}] Fetching CoRec data...`);

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'CoRec-Tracker/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    getDb();

    let newReadings = 0;
    for (const location of data) {
      upsertLocation(location);
      try {
        insertReading(location);
        newReadings++;
      } catch (e) {
        // Duplicate
      }
    }

    const stats = getReadingStats();
    console.log(`  ✓ ${newReadings} new readings (${stats.total_readings} total)`);

    // Show busiest open locations
    const busy = data
      .filter(l => !l.IsClosed && l.LastCount > 0)
      .sort((a, b) => (b.LastCount / b.TotalCapacity) - (a.LastCount / a.TotalCapacity))
      .slice(0, 3);

    if (busy.length > 0) {
      const summary = busy.map(l => {
        const pct = Math.round((l.LastCount / l.TotalCapacity) * 100);
        return `${l.LocationName.split(' ')[0]}:${pct}%`;
      }).join(', ');
      console.log(`    Current: ${summary}`);
    }

  } catch (error) {
    console.error(`  ✗ Error: ${error.message}`);
  }
}

function formatDuration(ms) {
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} minutes`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} hour${hrs > 1 ? 's' : ''} ${mins % 60} minutes`;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║          PURDUE COREC OCCUPANCY TRACKER - SCHEDULER              ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`\nInterval: ${formatDuration(CONFIG.FETCH_INTERVAL_MS)}`);
  console.log('Press Ctrl+C to stop.\n');

  // Initial fetch
  await fetchAndStore();

  // Schedule regular fetches
  setInterval(async () => {
    await fetchAndStore();
  }, CONFIG.FETCH_INTERVAL_MS);

  // Keep process alive
  process.on('SIGINT', () => {
    console.log('\n\nStopping tracker...');
    closeDb();
    process.exit(0);
  });
}

main();
