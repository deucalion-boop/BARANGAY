const { sendEmail, sendWelcomeEmail, sendNotificationEmail, testEmailConnection } = require('./utils/emailService');

async function testEmailFunctions() {
  console.log('🧪 Testing Email Functions with Unokamaleg API\n');
  console.log('API Key: default_key_change_this_in_production');
  console.log('API URL: https://unokamaleg.com/api/send_email_bossp.php\n');

  // Test connection first
  const isConnected = await testEmailConnection();
  if (!isConnected) {
    console.log('❌ Email service connection failed.');
    console.log('Check your internet connection and API endpoint availability.');
    return;
  }

  const testEmail = 'test@example.com';
  const testName = 'Test User';

  try {
    console.log('📧 Test 1: Basic Email Sending');
    const result1 = await sendEmail(
      testEmail,
      testName,
      'Test Email from Barangay Portal',
      '<h1>Hello!</h1><p>This is a test email sent via the Unokamaleg API.</p><p>If you receive this, the integration is working correctly!</p>',
      'Hello! This is a test email sent via the Unokamaleg API. If you receive this, the integration is working correctly!'
    );
    console.log('✅ Basic email sent:', result1.messageId);

    console.log('\n📧 Test 2: Welcome Email');
    const result2 = await sendWelcomeEmail(testEmail, 'John', 'Doe');
    console.log('✅ Welcome email sent:', result2.messageId);

    console.log('\n📧 Test 3: Notification Email');
    const result3 = await sendNotificationEmail(
      testEmail,
      testName,
      'System Test',
      'This is a test notification to verify the email system is working properly.',
      'success'
    );
    console.log('✅ Notification email sent:', result3.messageId);

    console.log('\n🎉 All email tests completed successfully!');
    console.log('Check your email inbox to verify the emails were received.');

  } catch (error) {
    console.error('❌ Email test failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check if EMAIL_API_KEY is set correctly in .env');
    console.log('2. Verify the API key is valid and active');
    console.log('3. Ensure TEST_EMAIL is set to a valid email address');
    console.log('4. Check your internet connection');
  }
}

// Run the test
testEmailFunctions().catch(console.error);
