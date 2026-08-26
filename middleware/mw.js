const session = require('express-session');

// Session configuration with per-environment cookie options
const isProd = process.env.NODE_ENV === 'production';

function buildCookieOptions() {
  // Read overrides from env; fall back to sensible defaults
  let secure = process.env.SESSION_SECURE
    ? String(process.env.SESSION_SECURE).toLowerCase() === 'true'
    : isProd;

  const sameSite = (process.env.SESSION_SAMESITE || (isProd ? 'lax' : 'lax'))
    .toLowerCase(); // 'lax' | 'strict' | 'none'

  // If sameSite is 'none', spec requires secure=true
  if (sameSite === 'none' && !secure) {
    secure = true;
  }

  const maxAgeEnv = process.env.SESSION_MAXAGE_MS
    ? Number(process.env.SESSION_MAXAGE_MS)
    : (isProd ? 1000 * 60 * 60 * 8 : 1000 * 60 * 60); // 8h prod, 1h dev

  const cookie = {
    httpOnly: true,
    secure,
    sameSite, // express-session accepts string union
    maxAge: Number.isFinite(maxAgeEnv) ? maxAgeEnv : 1000 * 60 * 60,
    path: '/',
  };

  if (process.env.SESSION_DOMAIN) {
    cookie.domain = process.env.SESSION_DOMAIN;
  }

  return cookie;
}

const sessionMiddleware = session({
  name: process.env.SESSION_NAME || 'sid',
  secret: process.env.SESSION_SECRET || 'your-secret-key-here',
  resave: false,
  saveUninitialized: false,
  cookie: buildCookieOptions(),
});

// Authentication guards
const requireAuth = (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.redirect('/user/login');
};

const requireAdminAuth = (req, res, next) => {
  if (req.session && req.session.adminId) {
    return next();
  }
  return res.redirect('/');
};

// Attach commonly-used locals to all views
const attachLocals = (req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.admin = req.session.admin || null;
  res.locals.isAuthenticated = !!(req.session.userId || req.session.adminId);
  next();
};

// Centralized error handler
const errorHandler = (err, req, res, next) => {
  // Log the error for diagnostics
  console.error('Unhandled error:', err);

  // If response headers already sent, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  // Prefer HTML error page rendering (EJS) to keep UX consistent
  try {
    res.status(500).render('error', {
      title: 'Server Error',
      message: 'Something went wrong! Please try again later.',
      status: 500,
    });
  } catch (renderErr) {
    // Fallback to JSON if rendering fails
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// Centralized 404 handler
const notFoundHandler = (req, res) => {
  try {
    res.status(404).render('error', {
      title: 'Page Not Found',
      message: 'The page you are looking for does not exist.',
      status: 404,
    });
  } catch (renderErr) {
    res.status(404).json({ success: false, message: 'Not Found' });
  }
};

module.exports = {
  sessionMiddleware,
  requireAuth,
  requireAdminAuth,
  attachLocals,
  errorHandler,
  notFoundHandler,
};
