const axios = require('axios');
const settings = require('./settings');

// Email configuration - using Unokamaleg API directly
const EMAIL_CONFIG = {
  apiKey: 'default_key_change_this_in_production',
  apiUrl: 'https://unokamaleg.com/api/send_email_bossp.php'
};

// Toggle verbose email logging via env or settings.json
const EMAIL_DEBUG = (process.env.EMAIL_LOGS || '').toLowerCase() === 'true' || settings.get('emailVerboseLogging', false);
const log = (...args) => { if (EMAIL_DEBUG) console.log(...args); };

// Send email directly via Unokamaleg API
// options: { timeoutMs?: number }
async function sendEmailViaAPI(mailOptions, options = {}) {
  try {
    // Extract recipient name from email if not provided
    const recipientName = mailOptions.to_name || mailOptions.to.split('@')[0];
    
        const payload = {
          to: mailOptions.to,
      to_name: recipientName,
          subject: mailOptions.subject,
          body: mailOptions.html || mailOptions.text,
          text_body: mailOptions.text || '',
          attachment: mailOptions.attachment || '',
          attachment_name: mailOptions.attachment_name || ''
        };

  log(`📧 Sending email via Unokamaleg API to: ${mailOptions.to}`);

    const response = await axios.post(EMAIL_CONFIG.apiUrl, payload, {
          headers: {
            'Content-Type': 'application/json',
        'X-API-Key': EMAIL_CONFIG.apiKey
          },
          timeout: Number.isFinite(options.timeoutMs) ? options.timeoutMs : 30000 // default 30s
        });

        const responseData = response.data;

        if (responseData.success) {
          log(`✅ Email sent successfully via Unokamaleg API: ${responseData.email_id || 'N/A'}`);
          return { messageId: responseData.email_id || `unokamaleg-${Date.now()}` };
        } else {
          throw new Error(responseData.message || 'Unknown error from API');
        }
      } catch (error) {
        console.error('❌ Error sending email via Unokamaleg API:', error.message);
    if (error.response) {
      console.error('API Response:', error.response.data);
    }
    if (error.code === 'ECONNABORTED') {
      console.error('Email provider request timed out.');
    }
        throw error;
      }
}

// Test email connection
async function testEmailConnection() {
  try {
    log('✅ Unokamaleg email provider ready');
    return true;
  } catch (error) {
    console.error('❌ Email service connection failed:', error.message);
    return false;
  }
}

// Store OTPs temporarily (in production, use Redis or database)
const otpStore = new Map();

// Generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP email
async function sendOTPEmail(email, otp) {
  try {
    const mailOptions = {
      to: email,
      subject: 'Password Reset OTP - Barangay Portal',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #1c4aca, #0b3769); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 24px;">Barangay Portal</h1>
            <p style="color: #e2e8f0; margin: 10px 0 0 0;">Password Reset</p>
          </div>

          <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <h2 style="color: #2d3748; margin-bottom: 20px;">Reset Your Password</h2>

            <p style="color: #4a5568; line-height: 1.6; margin-bottom: 30px;">
              We received a request to reset your password. Please use the following One-Time Password (OTP) to proceed:
            </p>

            <div style="background: #f7fafc; border: 2px solid #e2e8f0; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
              <h1 style="color: #1c4aca; font-size: 32px; margin: 0; letter-spacing: 5px;">${otp}</h1>
            </div>

            <p style="color: #718096; font-size: 14px; margin-top: 30px;">
              This OTP will expire in 10 minutes. If you didn't request this password reset, please ignore this email.
            </p>

            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">

            <p style="color: #a0aec0; font-size: 12px; text-align: center;">
              This is an automated message from Barangay Portal. Please do not reply to this email.
            </p>
          </div>
        </div>
      `
    };

  log(`📧 Sending OTP email to: ${email}`);
  // Use a slightly shorter timeout for OTP emails to avoid long UI blocking
  const info = await sendEmailViaAPI(mailOptions, { timeoutMs: 12000 });
  log(`✅ OTP email sent successfully:`, info.messageId);

    // Store OTP with expiration (10 minutes)
    otpStore.set(email, {
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000
    });

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending OTP email:', error.message);
    throw new Error(`Failed to send OTP email: ${error.message}`);
  }
}

// Verify OTP
function verifyOTP(email, otp) {
  const stored = otpStore.get(email);

  if (!stored) {
    return { valid: false, message: 'OTP not found or expired' };
  }

  if (Date.now() > stored.expiresAt) {
    otpStore.delete(email);
    return { valid: false, message: 'OTP has expired' };
  }

  if (stored.otp !== otp) {
    return { valid: false, message: 'Invalid OTP' };
  }

  // OTP is valid, remove it from store
  otpStore.delete(email);
  return { valid: true, message: 'OTP verified successfully' };
}

// Clean up expired OTPs (run periodically)
function cleanupExpiredOTPs() {
  const now = Date.now();
  for (const [email, data] of otpStore.entries()) {
    if (now > data.expiresAt) {
      otpStore.delete(email);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredOTPs, 5 * 60 * 1000);

// Send general email (for notifications, announcements, etc.)
async function sendEmail(to, toName, subject, htmlContent, textContent = '', attachment = '', attachmentName = '') {
  try {
    const mailOptions = {
      to: to,
      to_name: toName,
      subject: subject,
      html: htmlContent,
      text: textContent,
      attachment: attachment,
      attachment_name: attachmentName
    };

  log(`📧 Sending email to: ${to}`);
    const info = await sendEmailViaAPI(mailOptions);
  log(`✅ Email sent successfully:`, info.messageId);

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending email:', error.message);
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

// Send welcome email to new users
async function sendWelcomeEmail(email, firstName, lastName) {
  // Respect global email notifications toggle
  if (!settings.get('emailNotifications', true)) {
    log('📧 Email notifications disabled. Skipping welcome email.');
    return { success: true, skipped: true, reason: 'email_notifications_disabled' };
  }
  const subject = 'Welcome to Barangay Portal!';
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #1c4aca, #0b3769); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Barangay Portal</h1>
        <p style="color: #e2e8f0; margin: 10px 0 0 0;">Welcome to Our Community</p>
      </div>

      <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        <h2 style="color: #2d3748; margin-bottom: 20px;">Welcome, ${firstName}!</h2>

        <p style="color: #4a5568; line-height: 1.6; margin-bottom: 20px;">
          Thank you for registering with Barangay Portal. We're excited to have you as part of our community!
        </p>

        <div style="background: #f7fafc; border-left: 4px solid #1c4aca; padding: 20px; margin: 20px 0;">
          <h3 style="color: #1c4aca; margin-top: 0;">What you can do:</h3>
          <ul style="color: #4a5568; margin: 0;">
            <li>Access community announcements</li>
            <li>View your account information</li>
            <li>Contact administration</li>
            <li>Stay updated with community news</li>
          </ul>
        </div>

        <p style="color: #718096; font-size: 14px; margin-top: 30px;">
          If you have any questions, please don't hesitate to contact our administration team.
        </p>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">

        <p style="color: #a0aec0; font-size: 12px; text-align: center;">
          This is an automated message from Barangay Portal. Please do not reply to this email.
        </p>
      </div>
    </div>
  `;

  return await sendEmail(email, `${firstName} ${lastName}`, subject, htmlContent);
}

// Send notification email
async function sendNotificationEmail(email, recipientName, title, message, type = 'info') {
  // Respect global email notifications toggle
  if (!settings.get('emailNotifications', true)) {
    log('📧 Email notifications disabled. Skipping notification email.');
    return { success: true, skipped: true, reason: 'email_notifications_disabled' };
  }
  const colors = {
    info: '#1c4aca',
    success: '#38a169',
    warning: '#d69e2e',
    error: '#e53e3e'
  };

  const color = colors[type] || colors.info;
  
  const subject = `Barangay Portal Notification: ${title}`;
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, ${color}, #0b3769); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Barangay Portal</h1>
        <p style="color: #e2e8f0; margin: 10px 0 0 0;">${title}</p>
      </div>

      <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        <h2 style="color: #2d3748; margin-bottom: 20px;">Hello, ${recipientName}!</h2>

        <div style="background: #f7fafc; border-left: 4px solid ${color}; padding: 20px; margin: 20px 0;">
          <p style="color: #4a5568; line-height: 1.6; margin: 0;">${message}</p>
        </div>

        <p style="color: #718096; font-size: 14px; margin-top: 30px;">
          Please log in to your account for more details.
        </p>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">

        <p style="color: #a0aec0; font-size: 12px; text-align: center;">
          This is an automated message from Barangay Portal. Please do not reply to this email.
        </p>
      </div>
    </div>
  `;

  return await sendEmail(email, recipientName, subject, htmlContent);
}

module.exports = {
  sendOTPEmail,
  verifyOTP,
  generateOTP,
  testEmailConnection,
  sendEmail,
  sendWelcomeEmail,
  sendNotificationEmail
};