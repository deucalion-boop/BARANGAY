const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.join(__dirname, '..', 'config', 'settings.json');

let cache = null;

function load() {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) {
  const defaults = { 
    emailNotifications: true, 
    scheduleExpiryDays: 3, 
    allowUserRegistration: true,
    // New site metadata defaults
    siteTagline: 'Serving Our Community',
    siteDescription: 'Welcome to our Barangay Health Center management system. We provide comprehensive healthcare services to our community.',
    language: 'en',
    // Logging
    emailVerboseLogging: false
  };
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify(defaults, null, 2));
      cache = defaults;
      return cache;
    }
    const text = fs.readFileSync(SETTINGS_PATH, 'utf8');
    cache = JSON.parse(text);
    // Ensure defaults
  if (typeof cache.emailNotifications !== 'boolean') cache.emailNotifications = true;
  if (!cache.scheduleExpiryDays || cache.scheduleExpiryDays < 1) cache.scheduleExpiryDays = 3;
  if (typeof cache.allowUserRegistration !== 'boolean') cache.allowUserRegistration = true;
  if (!cache.siteTagline) cache.siteTagline = 'Serving Our Community';
  if (!cache.siteDescription) cache.siteDescription = 'Welcome to our Barangay Health Center management system. We provide comprehensive healthcare services to our community.';
  if (!cache.language) cache.language = 'en';
  if (typeof cache.emailVerboseLogging !== 'boolean') cache.emailVerboseLogging = false;
    return cache;
  } catch (err) {
    console.error('Failed to load settings.json:', err);
    // Fallback to sane defaults in memory
    cache = { 
      emailNotifications: true, 
      scheduleExpiryDays: 3, 
      allowUserRegistration: true,
      siteTagline: 'Serving Our Community',
      siteDescription: 'Welcome to our Barangay Health Center management system. We provide comprehensive healthcare services to our community.',
      language: 'en',
      emailVerboseLogging: false
    };
    return cache;
  }
}

function getAll() {
  if (!cache) load();
  return { ...cache };
}

function get(key, fallback = undefined) {
  if (!cache) load();
  return key in cache ? cache[key] : fallback;
}

function set(key, value) {
  if (!cache) load();
  cache[key] = value;
  save();
}

function save() {
  try {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(cache, null, 2));
  } catch (err) {
    console.error('Failed to save settings.json:', err);
  }
}

module.exports = {
  load,
  getAll,
  get,
  set,
  save,
};
