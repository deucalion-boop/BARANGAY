const fs = require('fs');
const path = require('path');
const settings = require('./settings');

let cache = null;

function loadLocales() {
  if (cache) return cache;
  const base = path.join(__dirname, '..', 'locales');
  const locales = {};
  if (!fs.existsSync(base)) {
    cache = locales;
    return cache;
  }
  const files = fs.readdirSync(base);
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const code = path.basename(file, '.json');
      const json = JSON.parse(fs.readFileSync(path.join(base, file), 'utf8'));
      locales[code] = json;
    } catch (e) {
      console.error('Failed to load locale file', file, e);
    }
  }
  cache = locales;
  return cache;
}

function get(obj, key) {
  return key.split('.').reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), obj);
}

function interpolate(str, params) {
  if (!params) return str;
  return str.replace(/\{(.*?)\}/g, (_, k) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}

function normalizeLang(code) {
  if (!code) return 'en';
  const c = code.toLowerCase();
  if (c.startsWith('fil') || c === 'tl') return 'fil';
  if (c.startsWith('en')) return 'en';
  return c;
}

function t(key, locale = 'en', params) {
  const locales = loadLocales();
  const lang = normalizeLang(locale);
  let val = (locales[lang] && get(locales[lang], key)) || (locales['en'] && get(locales['en'], key));
  if (typeof val === 'string') return interpolate(val, params);
  return interpolate(key, params);
}

function resolveLocale(req) {
  const fromSession = req && req.session && req.session.lang;
  const fromSettings = settings.get('language', 'en');
  return normalizeLang(fromSession || fromSettings || 'en');
}

module.exports = {
  t,
  resolveLocale,
  loadLocales,
};
