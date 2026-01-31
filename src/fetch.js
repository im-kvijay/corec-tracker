#!/usr/bin/env node
import { getApiUrl } from './config.js';
import {
  getDb, upsertLocation, insertReading, getReadingStats,
  saveSnapshot, shouldSaveSnapshot, logFetch, closeDb
} from './db.js';

async function fetchOccupancy() {
  const url = getApiUrl();
  const timestamp = new Date().toISOString();

  console.log(`[${timestamp}] Fetching CoRec occupancy data...`);

  let data = null;
  let newReadings = 0;
  let updatedLocations = 0;

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'CoRec-Tracker/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error('Invalid API response: expected array');
    }

    console.log(`  Received data for ${data.length} locations`);

    // Initialize database
    getDb();

    // Store each location and reading
    for (const location of data) {
      // Update location metadata (includes thresholds, colors, etc.)
      upsertLocation(location);
      updatedLocations++;

      // Insert reading (returns true if new, false if duplicate)
      if (insertReading(location)) {
        newReadings++;
      }
    }

    console.log(`  ✓ ${newReadings} new readings, ${updatedLocations} locations updated`);

    // Save full JSON snapshot hourly (for data integrity)
    if (shouldSaveSnapshot()) {
      saveSnapshot(data);
      console.log(`  ✓ Saved full JSON snapshot`);
    }

    // Log successful fetch
    logFetch(true, data.length, newReadings);

    // Show current high-traffic areas
    const busyLocations = data
      .filter(l => !l.IsClosed && l.LastCount > 0)
      .sort((a, b) => {
        const pctA = a.TotalCapacity > 0 ? a.LastCount / a.TotalCapacity : 0;
        const pctB = b.TotalCapacity > 0 ? b.LastCount / b.TotalCapacity : 0;
        return pctB - pctA;
      })
      .slice(0, 5);

    if (busyLocations.length > 0) {
      console.log('\n  Top 5 busiest areas right now:');
      for (const loc of busyLocations) {
        const pct = loc.TotalCapacity > 0
          ? Math.round((loc.LastCount / loc.TotalCapacity) * 100)
          : 0;
        const status = pct >= 80 ? '🔴' : pct >= 50 ? '🟡' : '🟢';
        console.log(`    ${status} ${loc.LocationName}: ${loc.LastCount}/${loc.TotalCapacity} (${pct}%)`);
      }
    }

    // Show stats
    const stats = getReadingStats();
    console.log(`\n  Database: ${stats.total_readings} readings | ${stats.total_snapshots} snapshots | ${stats.successful_fetches} fetches`);
    if (stats.first_reading) {
      console.log(`  Tracking since: ${stats.first_reading}`);
    }

    return { success: true, data, newReadings };

  } catch (error) {
    console.error(`  ✗ Error: ${error.message}`);

    // Log failed fetch
    try {
      getDb();
      logFetch(false, 0, 0, error.message);
    } catch (e) {
      // Ignore logging errors
    }

    return { success: false, error: error.message };
  } finally {
    closeDb();
  }
}

// Run if called directly
fetchOccupancy()
  .then((result) => {
    if (result.success) {
      console.log('\n✓ Fetch complete!');
      process.exit(0);
    } else {
      console.log('\n✗ Fetch failed');
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('Unexpected error:', err.message);
    process.exit(1);
  });

export { fetchOccupancy };
