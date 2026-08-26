const { testEmailConnection, sendEmail, sendWelcomeEmail, sendNotificationEmail } = require('./utils/emailService');

async function testEmail() {
  console.log('🔍 Testing Unokamaleg Email API...\n');
  console.log('API URL: https://unokamaleg.com/api/send_email_bossp.php');
  console.log('API Key: default_key_change_this_in_production');
  console.log('');

  const isConnected = await testEmailConnection();

  if (isConnected) {
    console.log('\n✅ Email service is working correctly!');
    console.log('You can now use the email features.');
    
    // Test sending a sample email
    console.log('\n🧪 Testing email sending...');
    try {
      const testEmail = 'test@example.com';
      const result = await sendEmail(
        testEmail,
        'Test User',
        'Test Email from Barangay Portal',
        '<h1>Test Email</h1><p>This is a test email to verify the Unokamaleg API integration.</p>',
        'Test Email - This is a test email to verify the Unokamaleg API integration.'
      );
      console.log('✅ Test email sent successfully!', result.messageId);
    } catch (error) {
      console.log('❌ Test email failed:', error.message);
    }
  } else {
    console.log('\n❌ Email service connection failed.');
    console.log('Check your internet connection and API endpoint availability.');
  }
}

testEmail().catch(console.error);
