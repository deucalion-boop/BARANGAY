const axios = require('axios');
const recaptchaConfig = require('../config/recaptcha');

async function verifyRecaptcha(token, remoteIp) {
  if (!recaptchaConfig.enabled) return true;
  if (!token || !recaptchaConfig.secretKey) return false;

  try {
    const payload = new URLSearchParams({
      secret: recaptchaConfig.secretKey,
      response: token,
    });

    if (remoteIp) payload.set('remoteip', remoteIp);

    const response = await axios.post(recaptchaConfig.verifyUrl, payload.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000,
    });

    return response.data?.success === true;
  } catch (error) {
    console.error('reCAPTCHA verification error:', error.message);
    return false;
  }
}

module.exports = { verifyRecaptcha };

