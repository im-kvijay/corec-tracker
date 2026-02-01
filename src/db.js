import Database from 'better-sqlite3';
import { CONFIG } from './config.js';

let db = null;

export function getDb() {
  if (!db) {
    db = new Database(CONFIG.DB_PATH);
    db.pragma('journal_mode = WAL');  // Better performance
    db.pragma('synchronous = NORMAL'); // Faster writes, still safe
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    -- Locations table (metadata about each area)
    CREATE TABLE IF NOT EXISTS locations (
      location_id INTEGER PRIMARY KEY,
      location_name TEXT NOT NULL,
      total_capacity INTEGER,
      facility_id INTEGER,
      facility_name TEXT,
      min_capacity_range INTEGER,  -- % threshold for "moderate"
      max_capacity_range INTEGER,  -- % threshold for "busy"
      min_color TEXT,              -- Color code for low
      max_color TEXT,              -- Color code for high
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Occupancy readings over time (compact, stores all meaningful data)
    CREATE TABLE IF NOT EXISTS readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      location_id INTEGER NOT NULL,
      last_count INTEGER NOT NULL,           -- Current people count
      capacity INTEGER NOT NULL,             -- Max capacity at time of reading
      pct INTEGER NOT NULL,                  -- Percentage (0-100+)
      is_closed INTEGER NOT NULL DEFAULT 0,  -- 0=open, 1=closed
      api_ts TEXT NOT NULL,                  -- API timestamp (ISO format)
      ts TEXT DEFAULT (datetime('now')),     -- When we fetched it
      FOREIGN KEY (location_id) REFERENCES locations(location_id)
    );

    -- Raw API snapshots (compressed JSON, periodic full backups)
    -- Stores complete API response every hour for data integrity
    CREATE TABLE IF NOT EXISTS snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT DEFAULT (datetime('now')),
      data TEXT NOT NULL,  -- Full JSON response
      location_count INTEGER,
      total_people INTEGER
    );

    -- Fetch log (track each fetch attempt)
    CREATE TABLE IF NOT EXISTS fetch_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT DEFAULT (datetime('now')),
      success INTEGER NOT NULL,
      locations_fetched INTEGER,
      new_readings INTEGER,
      error_msg TEXT
    );

    -- Indexes for fast querying
    CREATE INDEX IF NOT EXISTS idx_readings_loc ON readings(location_id);
    CREATE INDEX IF NOT EXISTS idx_readings_ts ON readings(ts);
    CREATE INDEX IF NOT EXISTS idx_readings_api_ts ON readings(api_ts);
    CREATE INDEX IF NOT EXISTS idx_readings_loc_ts ON readings(location_id, ts);

    -- Prevent duplicate readings (same location + same API timestamp)
    CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_reading
    ON readings(location_id, api_ts);
  `);

  // Migrate: add new columns if they don't exist (for existing databases)
  try {
    db.exec(`ALTER TABLE locations ADD COLUMN min_capacity_range INTEGER`);
  } catch (e) { /* column exists */ }
  try {
    db.exec(`ALTER TABLE locations ADD COLUMN max_capacity_range INTEGER`);
  } catch (e) { /* column exists */ }
  try {
    db.exec(`ALTER TABLE locations ADD COLUMN min_color TEXT`);
  } catch (e) { /* column exists */ }
  try {
    db.exec(`ALTER TABLE locations ADD COLUMN max_color TEXT`);
  } catch (e) { /* column exists */ }
  try {
    db.exec(`ALTER TABLE locations ADD COLUMN updated_at TEXT`);
  } catch (e) { /* column exists */ }
}

export function upsertLocation(location) {
  const stmt = getDb().prepare(`
    INSERT INTO locations (
      location_id, location_name, total_capacity, facility_id, facility_name,
      min_capacity_range, max_capacity_range, min_color, max_color, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(location_id) DO UPDATE SET
      location_name = excluded.location_name,
      total_capacity = excluded.total_capacity,
      facility_id = excluded.facility_id,
      facility_name = excluded.facility_name,
      min_capacity_range = excluded.min_capacity_range,
      max_capacity_range = excluded.max_capacity_range,
      min_color = excluded.min_color,
      max_color = excluded.max_color,
      updated_at = datetime('now')
  `);

  stmt.run(
    location.LocationId,
    location.LocationName.trim(),
    location.TotalCapacity,
    location.FacilityId,
    location.FacilityName,
    location.MinCapacityRange,
    location.MaxCapacityRange,
    location.MinColor,
    location.MaxColor
  );
}

export function insertReading(location) {
  // Unique index on (location_id, api_ts) prevents duplicates
  // If API returns same LastUpdatedDateAndTime, INSERT OR IGNORE skips it
  const stmt = getDb().prepare(`
    INSERT OR IGNORE INTO readings
    (location_id, last_count, capacity, pct, is_closed, api_ts)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const pct = location.TotalCapacity > 0
    ? Math.round((location.LastCount / location.TotalCapacity) * 100)
    : 0;

  const result = stmt.run(
    location.LocationId,
    location.LastCount,
    location.TotalCapacity,
    pct,
    location.IsClosed ? 1 : 0,
    location.LastUpdatedDateAndTime
  );

  return result.changes > 0; // Returns true if new row inserted
}

export function saveSnapshot(data) {
  // Save full JSON snapshot (hourly or on significant changes)
  const stmt = getDb().prepare(`
    INSERT INTO snapshots (data, location_count, total_people)
    VALUES (?, ?, ?)
  `);

  const totalPeople = data
    .filter(l => !l.IsClosed)
    .reduce((sum, l) => sum + l.LastCount, 0);

  stmt.run(
    JSON.stringify(data),
    data.length,
    totalPeople
  );
}

export function shouldSaveSnapshot() {
  // Save snapshot if last one was more than 1 hour ago
  const last = getDb().prepare(`
    SELECT ts FROM snapshots ORDER BY id DESC LIMIT 1
  `).get();

  if (!last) return true;

  const lastTime = new Date(last.ts + 'Z').getTime();
  const hourAgo = Date.now() - (60 * 60 * 1000);
  return lastTime < hourAgo;
}

export function logFetch(success, locationsFetched = 0, newReadings = 0, errorMsg = null) {
  const stmt = getDb().prepare(`
    INSERT INTO fetch_log (success, locations_fetched, new_readings, error_msg)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(success ? 1 : 0, locationsFetched, newReadings, errorMsg);
}

export function getLatestReadings() {
  return getDb().prepare(`
    SELECT
      l.location_id,
      l.location_name,
      l.min_capacity_range,
      l.max_capacity_range,
      r.last_count as count,
      r.capacity,
      r.pct as percentage,
      r.is_closed,
      r.api_ts as api_timestamp,
      r.ts as fetched_at
    FROM readings r
    JOIN locations l ON r.location_id = l.location_id
    WHERE r.id IN (
      SELECT MAX(id) FROM readings GROUP BY location_id
    )
    ORDER BY r.pct DESC
  `).all();
}

export function getReadingStats() {
  return getDb().prepare(`
    SELECT
      COUNT(*) as total_readings,
      COUNT(DISTINCT location_id) as locations_tracked,
      MIN(ts) as first_reading,
      MAX(ts) as last_reading,
      (SELECT COUNT(*) FROM snapshots) as total_snapshots,
      (SELECT COUNT(*) FROM fetch_log WHERE success = 1) as successful_fetches,
      (SELECT COUNT(*) FROM fetch_log WHERE success = 0) as failed_fetches
    FROM readings
  `).get();
}

export function getHourlyAverages(locationName = null) {
  const whereClause = locationName
    ? `WHERE l.location_name LIKE ?`
    : '';

  const sql = `
    SELECT
      l.location_name,
      CAST(strftime('%w', r.api_ts) AS INTEGER) as day_of_week,
      CAST(strftime('%H', r.api_ts) AS INTEGER) as hour,
      ROUND(AVG(r.pct), 1) as avg_pct,
      ROUND(AVG(r.last_count), 0) as avg_count,
      MIN(r.pct) as min_pct,
      MAX(r.pct) as max_pct,
      COUNT(*) as samples
    FROM readings r
    JOIN locations l ON r.location_id = l.location_id
    ${whereClause}
    AND r.is_closed = 0
    GROUP BY l.location_name, day_of_week, hour
    ORDER BY l.location_name, day_of_week, hour
  `;

  return locationName
    ? getDb().prepare(sql).all(`%${locationName}%`)
    : getDb().prepare(sql).all();
}

export function getOptimalTimes(locationName = null, limit = 20) {
  const whereClause = locationName
    ? `WHERE l.location_name LIKE ? AND r.is_closed = 0`
    : 'WHERE r.is_closed = 0';

  const params = locationName ? [`%${locationName}%`, limit] : [limit];

  const sql = `
    SELECT
      l.location_name,
      l.total_capacity,
      CAST(strftime('%w', r.api_ts) AS INTEGER) as day_of_week,
      CAST(strftime('%H', r.api_ts) AS INTEGER) as hour,
      ROUND(AVG(r.pct), 1) as avg_pct,
      ROUND(AVG(r.last_count), 0) as avg_count,
      MIN(r.pct) as min_pct,
      MAX(r.pct) as max_pct,
      COUNT(*) as samples
    FROM readings r
    JOIN locations l ON r.location_id = l.location_id
    ${whereClause}
    GROUP BY l.location_id, day_of_week, hour
    HAVING samples >= 2
    ORDER BY avg_pct ASC
    LIMIT ?
  `;

  return getDb().prepare(sql).all(...params);
}

export function getRecentReadings(locationId, hours = 24) {
  return getDb().prepare(`
    SELECT
      last_count, capacity, pct, is_closed, api_ts, ts
    FROM readings
    WHERE location_id = ?
    AND ts >= datetime('now', '-' || ? || ' hours')
    ORDER BY ts ASC
  `).all(locationId, hours);
}

export function getDailyStats(days = 7) {
  return getDb().prepare(`
    SELECT
      date(ts) as date,
      COUNT(*) as readings,
      COUNT(DISTINCT location_id) as locations,
      ROUND(AVG(pct), 1) as avg_pct,
      MAX(pct) as max_pct
    FROM readings
    WHERE ts >= datetime('now', '-' || ? || ' days')
    GROUP BY date(ts)
    ORDER BY date DESC
  `).all(days);
}

export function getDataSize() {
  return getDb().prepare(`
    SELECT
      (SELECT COUNT(*) FROM readings) as readings,
      (SELECT COUNT(*) FROM locations) as locations,
      (SELECT COUNT(*) FROM snapshots) as snapshots,
      (SELECT COUNT(*) FROM fetch_log) as fetch_logs
  `).get();
}

export function vacuum() {
  // Compact the database
  getDb().exec('VACUUM');
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
