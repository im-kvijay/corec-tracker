#!/usr/bin/env node
// Quick dashboard showing current status

import { getApiUrl, CONFIG } from './config.js';

async function showDashboard() {
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    PURDUE COREC - LIVE OCCUPANCY DASHBOARD                   ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\n');

  try {
    const response = await fetch(getApiUrl(), {
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();

    // Sort by percentage full
    const sorted = data
      .filter(l => !l.IsClosed)
      .map(l => ({
        name: l.LocationName,
        count: l.LastCount,
        capacity: l.TotalCapacity,
        pct: l.TotalCapacity > 0 ? Math.round((l.LastCount / l.TotalCapacity) * 100) : 0,
        updated: new Date(l.LastUpdatedDateAndTime)
      }))
      .sort((a, b) => b.pct - a.pct);

    // Filter to key locations
    const key = sorted.filter(l =>
      CONFIG.KEY_LOCATIONS.some(k => l.name.includes(k))
    );

    const toShow = key.length > 0 ? key : sorted.slice(0, 15);

    // Calculate totals for key fitness areas
    const fitnessAreas = sorted.filter(l =>
      l.name.includes('Fitness') || l.name.includes('Gym')
    );
    const totalPeople = fitnessAreas.reduce((sum, l) => sum + l.count, 0);
    const totalCapacity = fitnessAreas.reduce((sum, l) => sum + l.capacity, 0);
    const overallPct = totalCapacity > 0 ? Math.round((totalPeople / totalCapacity) * 100) : 0;

    console.log(`  OVERALL FITNESS AREAS: ${totalPeople}/${totalCapacity} people (${overallPct}% capacity)\n`);

    console.log('  Location                          Now    Max     %    Status');
    console.log('  ' + '─'.repeat(70));

    for (const loc of toShow) {
      const name = loc.name.padEnd(30).slice(0, 30);
      const count = String(loc.count).padStart(5);
      const cap = String(loc.capacity).padStart(6);
      const pct = String(loc.pct).padStart(4);

      // Visual bar
      let bar = '';
      let color = '\x1b[32m'; // green
      if (loc.pct >= 50) color = '\x1b[33m'; // yellow
      if (loc.pct >= 80) color = '\x1b[31m'; // red

      const barLen = Math.min(Math.round(loc.pct / 5), 20);
      bar = color + '█'.repeat(barLen) + '\x1b[0m' + '░'.repeat(20 - barLen);

      console.log(`  ${name} ${count} ${cap}  ${pct}%  ${bar}`);
    }

    // Closed locations
    const closed = data.filter(l => l.IsClosed);
    if (closed.length > 0) {
      console.log(`\n  \x1b[90mClosed: ${closed.map(l => l.LocationName).join(', ')}\x1b[0m`);
    }

    // Last update time
    const mostRecent = Math.max(...data.map(l => new Date(l.LastUpdatedDateAndTime).getTime()));
    console.log(`\n  Last API update: ${new Date(mostRecent).toLocaleString()}`);
    console.log(`  Fetched at: ${new Date().toLocaleString()}\n`);

    // Quick recommendations
    const quiet = sorted.filter(l => l.pct < 40 && l.count > 0).slice(0, 3);
    if (quiet.length > 0) {
      console.log('  🟢 QUIET NOW: ' + quiet.map(l => `${l.name} (${l.pct}%)`).join(', ') + '\n');
    }

    const busy = sorted.filter(l => l.pct >= 70).slice(0, 3);
    if (busy.length > 0) {
      console.log('  🔴 BUSY NOW: ' + busy.map(l => `${l.name} (${l.pct}%)`).join(', ') + '\n');
    }

  } catch (error) {
    console.error('Error fetching data:', error.message);
    process.exit(1);
  }
}

showDashboard();
