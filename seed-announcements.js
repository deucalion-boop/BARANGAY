/**
 * Seed Announcements Data Script
 * This script creates sample announcements with scheduled dates for calendar testing
 * 
 * Usage: node seed-announcements.js
 */

const mongoose = require('mongoose');
const User = require('./models/User');
const Announcement = require('./models/announcements');
const dbConfig = require('./config/database');

// Connect to MongoDB
async function connectDB() {
  try {
    await mongoose.connect(dbConfig.mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✓ MongoDB connected successfully');
  } catch (error) {
    console.error('✗ MongoDB connection error:', error);
    process.exit(1);
  }
}

// Generate dates for the next 30 days
function generateDates() {
  const dates = [];
  const today = new Date();
  
  for (let i = 1; i <= 30; i += 4) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    dates.push(date);
  }
  
  return dates;
}

// Format date as YYYY-MM-DD
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// Create sample announcements
async function seedAnnouncements() {
  try {
    console.log('\n📢 Starting announcements seeding...\n');

    // Find an admin user (or create one)
    let adminUser = await User.findOne({ role: 'admin' });
    
    if (!adminUser) {
      console.log('No admin found, looking for any user...');
      adminUser = await User.findOne();
      
      if (!adminUser) {
        console.log('Creating admin user...');
        adminUser = new User({
          firstName: 'Admin',
          lastName: 'User',
          email: 'admin@gmail.com',
          password: 'admin123',
          phone: '09171234567',
          unitNumber: '1',
          role: 'admin',
          isActive: true
        });
        await adminUser.save();
        console.log('✓ Admin user created: admin@gmail.com / admin123');
      } else {
        console.log('✓ Using existing user as admin:', adminUser.email);
      }
    } else {
      console.log('✓ Admin user found:', adminUser.email);
    }

    // Get dates for scheduling
    const dates = generateDates();
    
    // Sample announcements with different types and priorities
    const announcementData = [
      {
        title: 'Community Clean-Up Drive',
        content: 'Join us for the monthly community clean-up drive. Bring your own cleaning materials. Snacks will be provided.',
        type: 'event',
        priority: 'medium',
        scheduleDate: dates[0]
      },
      {
        title: 'Basketball Tournament Finals',
        content: 'The championship game of our inter-purok basketball tournament. Come support your team!',
        type: 'event',
        priority: 'high',
        scheduleDate: dates[1]
      },
      {
        title: 'Emergency: Water Interruption',
        content: 'Water supply will be temporarily shut off for maintenance. Please store water in advance. Expected duration: 6 hours.',
        type: 'emergency',
        priority: 'urgent',
        scheduleDate: dates[2]
      },
      {
        title: 'Barangay Assembly Meeting',
        content: 'Monthly barangay assembly. All residents are encouraged to attend. Agenda includes budget review and upcoming projects.',
        type: 'event',
        priority: 'high',
        scheduleDate: dates[3]
      },
      {
        title: 'Free Medical Check-up',
        content: 'Free medical consultation and check-up sponsored by the local health center. First come, first served.',
        type: 'event',
        priority: 'medium',
        scheduleDate: dates[4]
      },
      {
        title: 'Street Light Maintenance',
        content: 'Scheduled maintenance of street lights in Purok 1-3. Some areas may experience temporary darkness.',
        type: 'maintenance',
        priority: 'low',
        scheduleDate: dates[5]
      },
      {
        title: 'Vaccination Drive',
        content: 'COVID-19 and flu vaccination for residents. Bring your vaccination cards. Walk-ins welcome.',
        type: 'event',
        priority: 'urgent',
        scheduleDate: dates[6]
      },
      {
        title: 'Garbage Collection Schedule Change',
        content: 'Due to the holiday, garbage collection will be moved to the following day. Please prepare accordingly.',
        type: 'general',
        priority: 'medium',
        scheduleDate: dates[7]
      }
    ];

    console.log('📝 Creating Announcements...\n');
    
    const announcements = [];
    for (let i = 0; i < announcementData.length; i++) {
      const data = announcementData[i];
      
      const announcement = new Announcement({
        title: data.title,
        content: data.content,
        type: data.type,
        priority: data.priority,
        isActive: true,
        isArchived: false,
        scheduleDate: data.scheduleDate,
        createdBy: adminUser._id
      });
      
      await announcement.save();
      announcements.push(announcement);
      
      console.log(`  ✓ Created: ${announcement.title}`);
      console.log(`    Type: ${announcement.type} | Priority: ${announcement.priority}`);
      console.log(`    Scheduled for: ${formatDate(data.scheduleDate)}`);
      console.log('');
    }

    console.log('✅ Announcements seeded successfully!');
    console.log(`\n📊 Summary:`);
    console.log(`   - Total Announcements: ${announcements.length}`);
    console.log(`   - Emergency: ${announcements.filter(a => a.type === 'emergency').length}`);
    console.log(`   - Events: ${announcements.filter(a => a.type === 'event').length}`);
    console.log(`   - Maintenance: ${announcements.filter(a => a.type === 'maintenance').length}`);
    console.log(`   - General: ${announcements.filter(a => a.type === 'general').length}`);
    console.log(`\n🎨 Priority Distribution:`);
    console.log(`   - Urgent: ${announcements.filter(a => a.priority === 'urgent').length}`);
    console.log(`   - High: ${announcements.filter(a => a.priority === 'high').length}`);
    console.log(`   - Medium: ${announcements.filter(a => a.priority === 'medium').length}`);
    console.log(`   - Low: ${announcements.filter(a => a.priority === 'low').length}`);
    console.log(`\n🌐 Login and view the calendar at: http://localhost:3000/users/dashboard`);
    console.log(`   Announcements will appear on the calendar with scheduled dates!\n`);

  } catch (error) {
    console.error('\n✗ Error seeding announcements:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed.');
  }
}

// Run the seeder
(async () => {
  await connectDB();
  await seedAnnouncements();
})();
