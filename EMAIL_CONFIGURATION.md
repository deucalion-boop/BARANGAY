# 📧 Email Configuration Guide for Barangay Portal

## Overview

This project sends emails via the Unokamaleg API by default, with sane timeouts and light retries. You can configure credentials and behavior via environment variables or `config/settings.json`. A development fallback is available to simulate emails locally without an external provider.

## Quick Start

1) Set your environment variables (recommended):

```powershell
$env:EMAIL_API_KEY = "your_real_api_key"
$env:EMAIL_API_URL = "https://unokamaleg.com/api/send_email_bossp.php"
# Optional tuning
$env:EMAIL_API_TIMEOUT_MS = "15000"     # default 15000 (15s)
$env:EMAIL_API_RETRIES    = "2"         # default 2 attempts
$env:EMAIL_LOGS           = "true"      # verbose logs
```

2) Test connectivity and a sample send:

```powershell
node test-email.js
# or
node test-email-functions.js
```

If everything is set correctly, you should see success logs and receive a test email.

## Development Mode (no real emails)

To develop without a working email provider, enable dev mode. Emails are not sent; they are logged to the console. OTPs are still generated and stored, so you can complete the flow.

```powershell
$env:EMAIL_DEV_MODE = "true"
$env:EMAIL_LOGS = "true"
```

In dev mode you’ll see logs like:

```
🧪 [DEV MODE] Would send OTP email to: user@example.com with OTP: 123456
```

## Configuration Sources

- Environment variables take priority
- `config/settings.json` fallback keys:
  - `emailApiKey`
  - `emailApiUrl`
  - `emailApiTimeoutMs` (default 15000)
  - `emailApiRetries` (default 2)
  - `emailVerboseLogging` (false)
  - `emailDevMode` (false)

You do not need to edit code to change configuration.

### 4. Available Email Functions

The email service now includes these functions:

#### Basic Email Sending
```javascript
const { sendEmail } = require('./utils/emailService');

await sendEmail(
  'recipient@example.com',     // to
  'Recipient Name',            // to_name
  'Email Subject',             // subject
  '<h1>HTML Content</h1>',     // htmlContent
  'Plain text content',        // textContent (optional)
  'base64_encoded_file',      // attachment (optional)
  'filename.pdf'              // attachmentName (optional)
);
```

#### Welcome Email
```javascript
const { sendWelcomeEmail } = require('./utils/emailService');

await sendWelcomeEmail(
  'newuser@example.com',
  'John',
  'Doe'
);
```

#### Notification Email
```javascript
const { sendNotificationEmail } = require('./utils/emailService');

await sendNotificationEmail(
  'user@example.com',
  'John Doe',
  'Account Update',
  'Your account has been updated successfully.',
  'success' // type: 'info', 'success', 'warning', 'error'
);
```

#### OTP Email (for password reset)
```javascript
const { sendOTPEmail, verifyOTP, generateOTP } = require('./utils/emailService');

const otp = generateOTP();
await sendOTPEmail('user@example.com', otp);

// Later, verify the OTP
const result = verifyOTP('user@example.com', '123456');
```

## API Specifications

The integration uses the following API endpoint:
- **URL**: `https://unokamaleg.com/api/send_email_bossp.php`
- **Method**: POST
- **Content-Type**: application/json
- **Header**: X-API-Key: YOUR_API_KEY_HERE

#### Request Body Format:
```json
{
  "to": "recipient@example.com",
  "to_name": "Recipient Name",
  "subject": "Email Subject Here",
  "body": "<h1>Hello!</h1><p>This is an HTML email body.</p>",
  "text_body": "This is a plain text version (optional).",
  "attachment": "base64_encoded_file_here (optional)",
  "attachment_name": "file.pdf (optional)"
}
```

#### Success Response:
```json
{
  "success": true,
  "message": "Email sent successfully",
  "email_id": "123"
}
```

#### Error Response:
```json
{
  "success": false,
  "message": "Invalid or inactive API key."
}
```

## Troubleshooting

#### Common Issues:
1. **API Key Not Working**: Ensure `EMAIL_API_KEY` is set and valid
2. **Connection Timeout**: Check internet connectivity; adjust `EMAIL_API_TIMEOUT_MS`
3. **Rate Limiting/5xx**: The service retries briefly; consider increasing `EMAIL_API_RETRIES`
4. **Invalid Response**: Verify `EMAIL_API_URL` is correct and reachable

#### Debug Steps:
1. Run `node test-email.js` or `node test-email-functions.js`
2. Enable verbose logs with `EMAIL_LOGS=true`
3. Ensure the API endpoint is accessible from your environment
4. Validate `EMAIL_API_KEY` and try again
5. Use `EMAIL_DEV_MODE=true` during local development if the provider is not available

## Security Notes

- Do not commit real API keys to source control
- Use environment variables for secrets in production
- Rotate API keys periodically and revoke unused keys

---

**Need Help?** Enable `EMAIL_LOGS=true` and check the console output from the server and test scripts.
