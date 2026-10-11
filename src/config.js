// Purdue CoRec API Configuration
// API discovered from: https://www.purdue.edu/recwell/facility-usage/

export const CONFIG = {
  // Connect2Concepts GoBoard API
  API_URL: 'https://goboardapi.azurewebsites.net/api/FacilityCount/GetCountsByAccount',
  API_KEY: 'aedeaf92-036d-4848-980b-7eb5526ea40c',

  // Data collection interval (15 minutes in ms)
  // API updates roughly every 1-1.5 hours when CoRec is open
  // We fetch more often to never miss an update
  FETCH_INTERVAL_MS: 15 * 60 * 1000,

  // Database path
  DB_PATH: new URL('../data/corec.db', import.meta.url).pathname,

  // Key locations to track (you can customize this list)
  // These are the main workout areas most people care about
  KEY_LOCATIONS: [
    'Colby Fitness',
    'Lower Gym',
    'Upper Gym',
    'Feature Gym',
    'Fitness Loft',
    'East Fitness',
    'Upper Fitness',
    'Fitness Pavilion',
    'TREC',
    'Bouldering Wall',
    'Climbing Wall',
    'Olympic Lifting Room'
  ],

  // CoRec operating hours (approximate)
  // Used to filter analysis to open hours only
  OPERATING_HOURS: {
    // [open_hour, close_hour) in 24h format; close_hour itself is not open
    weekday: [6, 23],    // Mon-Thu: 6am-11pm
    friday: [6, 21],     // Fri: 6am-9pm
    saturday: [8, 21],   // Sat: 8am-9pm
    sunday: [10, 23]     // Sun: 10am-11pm
  },

  // Minimum readings for a day/hour slot to rank in "best times"
  MIN_SAMPLES: 5
};

export function getApiUrl() {
  return `${CONFIG.API_URL}?AccountAPIKey=${CONFIG.API_KEY}`;
}

// dow uses JS/SQLite numbering: 0 = Sunday ... 6 = Saturday
export function isOpenAt(dow, hour) {
  const { weekday, friday, saturday, sunday } = CONFIG.OPERATING_HOURS;
  const [open, close] = [sunday, weekday, weekday, weekday, weekday, friday, saturday][dow];
  return hour >= open && hour < close;
}
