require('dotenv').config();

// Google reCAPTCHA v2 configuration
module.exports = {
  // Client-side site key for rendering the widget
  siteKey: process.env.RECAPTCHA_SITE_KEY || '',
  // Server-side secret used to verify tokens
  secretKey: process.env.RECAPTCHA_SECRET_KEY || '',
  // Verification endpoint
  verifyUrl: 'https://www.google.com/recaptcha/api/siteverify',
  // Optional toggle to quickly disable/enable verification (defaults to true)
  enabled: (process.env.RECAPTCHA_ENABLED || 'true').toLowerCase() === 'true'
};
