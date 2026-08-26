require('dotenv').config();

// Google reCAPTCHA v2 configuration
// Defaults use Google's public test keys (valid for development only)
// Docs: https://developers.google.com/recaptcha/docs/faq#id-like-to-run-automated-tests-with-recaptcha-what-should-i-do
module.exports = {
  // Client-side site key for rendering the widget
  siteKey: process.env.RECAPTCHA_SITE_KEY || '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI',
  // Server-side secret used to verify tokens
  secretKey: process.env.RECAPTCHA_SECRET_KEY || '6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe',
  // Verification endpoint
  verifyUrl: 'https://www.google.com/recaptcha/api/siteverify',
  // Optional toggle to quickly disable/enable verification (defaults to true)
  enabled: (process.env.RECAPTCHA_ENABLED || 'true').toLowerCase() === 'true'
};
