#!/usr/bin/env node
// Test script to verify everything works

import { getApiUrl, CONFIG } from './config.js';
import { getDb, closeDb } from './db.js';

async function runTests() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║                    COREC TRACKER - TEST SUITE                    ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;

  // Test 1: API URL construction
  console.log('Test 1: API URL construction');
  try {
    const url = getApiUrl();
    if (url.includes(CONFIG.API_KEY) && url.includes('goboardapi')) {
      console.log('  ✓ API URL correctly constructed');
      passed++;
    } else {
      throw new Error('URL malformed');
    }
  } catch (e) {
    console.log(`  ✗ Failed: ${e.message}`);
    failed++;
  }

  // Test 2: API connectivity
  console.log('\nTest 2: API connectivity');
  try {
    const response = await fetch(getApiUrl(), {
      headers: { 'Accept': 'application/json' }
    });

    if (response.ok) {
      console.log('  ✓ API responded with status 200');
      passed++;
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (e) {
    console.log(`  ✗ Failed: ${e.message}`);
    failed++;
  }

  // Test 3: API returns valid data
  console.log('\nTest 3: API data validation');
  try {
    const response = await fetch(getApiUrl());
    const data = await response.json();

    if (!Array.isArray(data)) throw new Error('Response is not an array');
    if (data.length === 0) throw new Error('Response is empty');

    const sample = data[0];
    const requiredFields = ['LocationId', 'LocationName', 'TotalCapacity', 'LastCount', 'IsClosed'];
    for (const field of requiredFields) {
      if (!(field in sample)) throw new Error(`Missing field: ${field}`);
    }

    console.log(`  ✓ API returned ${data.length} valid location records`);
    passed++;

    // Show sample data
    console.log(`    Sample: ${sample.LocationName} - ${sample.LastCount}/${sample.TotalCapacity}`);

  } catch (e) {
    console.log(`  ✗ Failed: ${e.message}`);
    failed++;
  }

  // Test 4: Database initialization
  console.log('\nTest 4: Database initialization');
  try {
    const db = getDb();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const tableNames = tables.map(t => t.name);

    if (!tableNames.includes('locations')) throw new Error('Missing locations table');
    if (!tableNames.includes('readings')) throw new Error('Missing readings table');

    console.log('  ✓ Database tables created correctly');
    passed++;
  } catch (e) {
    console.log(`  ✗ Failed: ${e.message}`);
    failed++;
  } finally {
    closeDb();
  }

  // Test 5: Verify Purdue locations
  console.log('\nTest 5: Verify Purdue-specific locations');
  try {
    const response = await fetch(getApiUrl());
    const data = await response.json();

    const purdueLocations = ['Colby Fitness', 'Lower Gym', 'Upper Gym', 'TREC'];
    const found = purdueLocations.filter(name =>
      data.some(l => l.LocationName.includes(name.split(' ')[0]))
    );

    if (found.length >= 3) {
      console.log(`  ✓ Found Purdue CoRec locations: ${found.join(', ')}`);
      passed++;
    } else {
      throw new Error('Could not verify Purdue locations');
    }
  } catch (e) {
    console.log(`  ✗ Failed: ${e.message}`);
    failed++;
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log('\n✓ All tests passed! The tracker is ready to use.');
    console.log('\nNext steps:');
    console.log('  1. npm run fetch     - Fetch current data');
    console.log('  2. npm run dashboard - View live dashboard');
    console.log('  3. npm run start     - Start continuous tracking');
    console.log('  4. npm run analyze   - Analyze collected data\n');
  } else {
    console.log('\n✗ Some tests failed. Check the errors above.\n');
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
