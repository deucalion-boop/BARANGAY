# reCAPTCHA Implementation Guide

## Overview
This application now includes Google reCAPTCHA v2 protection on all authentication forms (login and registration) to prevent automated bot attacks.

## What Was Added

### 1. **Files Created**
- `config/recaptcha.js` - Configuration file containing reCAPTCHA keys

### 2. **Dependencies Installed**
- `google-recaptcha` - npm package for reCAPTCHA support
- `axios` - Already installed, used for HTTP requests to verify reCAPTCHA

### 3. **Modified Files**

#### Frontend Changes (`views/index.ejs`)
- Added Google reCAPTCHA API script to the HTML head
- Added reCAPTCHA widget to the login form
- Added reCAPTCHA widget to the registration form (Step 3)
- Updated login form submission to send reCAPTCHA token
- Updated registration form submission to send reCAPTCHA token
- Added reCAPTCHA reset on form errors

#### Backend Changes
**`routes/index.js`:**
- Added reCAPTCHA config import
- Added `verifyRecaptcha()` helper function
- Updated `/users/login` route to verify reCAPTCHA token
- Updated `/users/register` route to verify reCAPTCHA token
- Added reCAPTCHA site key to homepage render data

**`server.js`:**
- Added reCAPTCHA config import
- Added `verifyRecaptcha()` helper function
- Updated `/admin/login` route to verify reCAPTCHA token

## Current Configuration

### Test Keys (Development)
The application is currently configured with Google's **TEST keys** that always pass validation:
- **Site Key:** `6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI`
- **Secret Key:** `6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe`

⚠️ **IMPORTANT:** These test keys are for development only and should NOT be used in production!

## Production Setup

### Step 1: Get Your Own reCAPTCHA Keys
1. Visit [Google reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin)
2. Sign in with your Google account
3. Click "+" to create a new site
4. Fill in the registration form:
   - **Label:** Your application name (e.g., "Barangay Portal")
   - **reCAPTCHA type:** Choose "reCAPTCHA v2" → "I'm not a robot" Checkbox
   - **Domains:** Add your domain(s):
     - For development: `localhost`
     - For production: `yourdomain.com`
   - Accept the reCAPTCHA Terms of Service
5. Click "Submit"
6. Copy your **Site Key** and **Secret Key**

### Step 2: Configure Your Keys

#### Option A: Using Environment Variables (Recommended)
Add these to your `.env` file:
```env
RECAPTCHA_SITE_KEY=your_actual_site_key_here
RECAPTCHA_SECRET_KEY=your_actual_secret_key_here
```

#### Option B: Direct Configuration
Edit `config/recaptcha.js` and replace the test keys:
```javascript
module.exports = {
  siteKey: 'your_actual_site_key_here',
  secretKey: 'your_actual_secret_key_here',
  verifyUrl: 'https://www.google.com/recaptcha/api/siteverify'
};
```

### Step 3: Restart Your Server
After updating the keys, restart your Node.js server:
```bash
npm start
```
or if using nodemon:
```bash
npm run dev
```

## Testing

### With Test Keys (Current Setup)
- reCAPTCHA will always pass validation
- You'll see the reCAPTCHA widget on login and registration forms
- Useful for development and testing the integration

### With Production Keys
- reCAPTCHA will properly validate user interactions
- Failed verifications will be rejected with an error message
- Protects against automated bot attacks

## How It Works

1. **User Action:** User fills out login or registration form
2. **Client Side:** 
   - reCAPTCHA widget verifies the user is human
   - JavaScript captures the reCAPTCHA response token
   - Token is sent with the form data to the server
3. **Server Side:**
   - Server receives the reCAPTCHA token
   - Server makes a request to Google's verification API
   - Google validates the token and returns success/failure
   - Server proceeds with login/registration only if verification succeeds

## Troubleshooting

### reCAPTCHA Widget Not Showing
- Check browser console for errors
- Ensure the reCAPTCHA script is loaded: `https://www.google.com/recaptcha/api.js`
- Verify your domain is allowed in reCAPTCHA admin settings

### Verification Always Fails
- Check that your Secret Key is correct
- Verify the server has internet access to reach Google's API
- Check server logs for reCAPTCHA verification errors

### Test Keys in Production
- Never use test keys in production
- Set proper environment variables or update the config file
- Restart the server after making changes

## Security Notes

- ✅ reCAPTCHA protects all authentication endpoints
- ✅ Failed verifications return appropriate error messages
- ✅ reCAPTCHA widgets reset on submission failure
- ✅ Tokens are validated server-side (not just client-side)
- ⚠️ Remember to use production keys in production environment

## Additional Resources

- [Google reCAPTCHA Documentation](https://developers.google.com/recaptcha/docs/display)
- [reCAPTCHA Admin Console](https://www.google.com/recaptcha/admin)
- [reCAPTCHA Best Practices](https://developers.google.com/recaptcha/docs/faq)
