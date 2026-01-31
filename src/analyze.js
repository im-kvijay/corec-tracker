#!/usr/bin/env node
import { getDb, getLatestReadings, getOptimalTimes, getHourlyAverages, getReadingStats, closeDb } from './db.js';
import { CONFIG } from './config.js';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatHour(hour) {
  if (hour === 0) return '12am';
  if (hour === 12) return '12pm';
  if (hour < 12) return `${hour}am`;
  return `${hour - 12}pm`;
}

function printBar(percentage, width = 30) {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);

  let color = '\x1b[32m'; // green
  if (percentage >= 60) color = '\x1b[33m'; // yellow
  if (percentage >= 90) color = '\x1b[31m'; // red

  return `${color}${bar}\x1b[0m`;
}

function printCurrentStatus() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                        CURRENT COREC OCCUPANCY                               ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  const readings = getLatestReadings();

  if (readings.length === 0) {
    console.log('No data yet. Run "npm run fetch" to collect data first.\n');
    return;
  }

  // Filter to key locations
  const keyReadings = readings.filter(r =>
    CONFIG.KEY_LOCATIONS.some(key => r.location_name.includes(key))
  );

  const toShow = keyReadings.length > 0 ? keyReadings : readings.slice(0, 15);

  console.log('Location                        Count    Capacity   %     Status');
  console.log('─'.repeat(78));

  for (const r of toShow) {
    const name = r.location_name.padEnd(30).slice(0, 30);
    const count = String(r.count).padStart(5);
    const cap = String(r.capacity).padStart(8);
    const pct = String(r.percentage).padStart(3);
    const bar = printBar(r.percentage, 15);
    const status = r.is_closed ? '\x1b[90mCLOSED\x1b[0m' : bar;

    console.log(`${name} ${count} ${cap}   ${pct}%   ${status}`);
  }

  const lastUpdate = readings[0]?.api_timestamp;
  if (lastUpdate) {
    console.log(`\nLast API update: ${new Date(lastUpdate).toLocaleString()}`);
  }
}

function printOptimalTimes() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                      OPTIMAL TIMES TO VISIT (LOWEST CROWDS)                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  const optimal = getOptimalTimes();

  if (optimal.length === 0) {
    console.log('Not enough data yet. Continue collecting for better analysis.\n');
    return;
  }

  console.log('Rank  Location                   Day          Time      Avg %   Samples');
  console.log('─'.repeat(78));

  for (let i = 0; i < Math.min(20, optimal.length); i++) {
    const o = optimal[i];
    const rank = String(i + 1).padStart(2);
    const name = o.location_name.padEnd(25).slice(0, 25);
    const day = DAYS_SHORT[o.day_of_week].padEnd(10);
    const time = formatHour(o.hour).padStart(7);
    const pct = String(o.avg_percentage).padStart(5);
    const samples = String(o.sample_count).padStart(8);

    console.log(`${rank}.   ${name}  ${day}  ${time}    ${pct}%  ${samples}`);
  }

  console.log('\nNote: Times with fewer than 2 samples are excluded.\n');
}

function printWeeklyHeatmap(locationName = 'Colby Fitness') {
  console.log(`\n╔══════════════════════════════════════════════════════════════════════════════╗`);
  console.log(`║                      WEEKLY HEATMAP: ${locationName.toUpperCase().padEnd(38)}║`);
  console.log(`╚══════════════════════════════════════════════════════════════════════════════╝\n`);

  const data = getHourlyAverages(locationName);

  if (data.length === 0) {
    console.log(`No data for "${locationName}". Try a different location.\n`);
    return;
  }

  // Build 2D grid: [day][hour] = percentage
  const grid = {};
  for (const d of data) {
    if (!grid[d.day_of_week]) grid[d.day_of_week] = {};
    grid[d.day_of_week][d.hour] = d.avg_percentage;
  }

  // Print header
  console.log('       ' + Array.from({ length: 17 }, (_, i) => formatHour(i + 6).padStart(4)).join(' '));
  console.log('       ' + '─'.repeat(4 * 17 + 16));

  // Print each day
  for (let day = 0; day < 7; day++) {
    let row = DAYS_SHORT[day].padEnd(6) + ' │';

    for (let hour = 6; hour <= 22; hour++) {
      const pct = grid[day]?.[hour];
      if (pct === undefined) {
        row += '   · ';
      } else {
        let color = '\x1b[32m'; // green (0-39%)
        if (pct >= 40) color = '\x1b[33m'; // yellow (40-69%)
        if (pct >= 70) color = '\x1b[31m'; // red (70%+)
        row += `${color}${String(Math.round(pct)).padStart(4)}\x1b[0m `;
      }
    }

    console.log(row);
  }

  console.log('\nLegend: \x1b[32m■\x1b[0m 0-39% (quiet) | \x1b[33m■\x1b[0m 40-69% (moderate) | \x1b[31m■\x1b[0m 70%+ (busy)\n');
}

function printRecommendations() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                           WORKOUT RECOMMENDATIONS                            ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  const stats = getReadingStats();

  if (stats.total_readings < 50) {
    console.log(`Only ${stats.total_readings} readings collected so far.`);
    console.log('Continue running the tracker for a few days to get meaningful patterns.\n');
    console.log('Quick tips based on general gym patterns:');
    console.log('  • Weekday mornings (6-8am) are typically least crowded');
    console.log('  • Avoid 4-7pm on weekdays (post-class rush)');
    console.log('  • Weekend mornings tend to be quieter');
    console.log('  • Late nights (9-11pm) are usually empty\n');
    return;
  }

  const optimal = getOptimalTimes();

  if (optimal.length >= 5) {
    console.log('Based on your collected data, here are the BEST times to workout:\n');

    // Group by day
    const byDay = {};
    for (const o of optimal.slice(0, 15)) {
      if (!byDay[o.day_of_week]) byDay[o.day_of_week] = [];
      byDay[o.day_of_week].push(o);
    }

    for (let day = 0; day < 7; day++) {
      const times = byDay[day];
      if (times && times.length > 0) {
        const timeStrs = times.slice(0, 3).map(t =>
          `${formatHour(t.hour)} (${t.avg_percentage}% at ${t.location_name.split(' ')[0]})`
        );
        console.log(`  ${DAYS[day]}: ${timeStrs.join(', ')}`);
      }
    }
  }

  console.log('\n');
}

function main() {
  const args = process.argv.slice(2);
  const locationArg = args.find(a => !a.startsWith('--'));

  try {
    getDb();

    const stats = getReadingStats();
    console.log(`\n📊 CoRec Tracker Analysis | ${stats.total_readings} readings from ${stats.locations_tracked} locations`);
    console.log(`   Data range: ${stats.first_reading || 'N/A'} to ${stats.last_reading || 'N/A'}`);

    if (args.includes('--current') || args.length === 0) {
      printCurrentStatus();
    }

    if (args.includes('--optimal') || args.length === 0) {
      printOptimalTimes();
    }

    if (args.includes('--heatmap') || args.length === 0) {
      printWeeklyHeatmap(locationArg || 'Colby Fitness');
    }

    if (args.includes('--recommend') || args.length === 0) {
      printRecommendations();
    }

  } finally {
    closeDb();
  }
}

main();
