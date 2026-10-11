#!/usr/bin/env node
// Markdown occupancy report. The daily workflow writes it to REPORT.md.
import { getDb, getLatestReadings, getOptimalTimes, getReadingStats, closeDb } from './db.js';
import { DAYS_SHORT, formatHour } from './format.js';

const MIN_READINGS_FOR_BEST_TIMES = 100;

function main() {
  try {
    getDb();
    const stats = getReadingStats();
    const lines = [];
    const row = cells => `| ${cells.join(' | ')} |`;

    lines.push('# CoRec Occupancy Report');
    lines.push(`Generated: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`, '');

    lines.push('## Database Stats');
    lines.push(`- **${stats.total_readings}** readings across **${stats.locations_tracked}** locations`);
    lines.push(`- **${stats.total_snapshots}** snapshots saved`);
    lines.push(`- Data range: ${stats.first_reading} to ${stats.last_reading}`, '');

    lines.push('## Latest Readings (open locations)');
    lines.push(row(['Location', 'Count', 'Capacity', '%']));
    lines.push(row(['----------', '-------', '----------', '---']));
    for (const r of getLatestReadings().filter(r => !r.is_closed).slice(0, 15)) {
      lines.push(row([r.location_name, r.count, r.capacity, `${r.percentage}%`]));
    }
    lines.push('');

    if (stats.total_readings < MIN_READINGS_FOR_BEST_TIMES) {
      lines.push('## Best Times to Visit', 'Not enough data yet.', '');
    } else {
      lines.push('## Best Times to Visit (lowest crowds, open hours only)');
      lines.push(row(['Location', 'Day', 'Time', 'Avg %', 'Samples']));
      lines.push(row(['----------', '-----', '----', '-----', '-------']));
      for (const o of getOptimalTimes(15)) {
        lines.push(row([o.location_name, DAYS_SHORT[o.day_of_week], formatHour(o.hour), `${o.avg_pct}%`, o.samples]));
      }
      lines.push('');
    }

    process.stdout.write(lines.join('\n') + '\n');
  } finally {
    closeDb();
  }
}

main();
