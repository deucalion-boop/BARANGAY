/**
 * Seed Calendar Data Script
 * This script creates sample schedule requests and appointments for testing the calendar
 * 
 * Usage: node seed-calendar-data.js
 */

const mongoose = require('mongoose');
const User = require('./models/User');
const Appointment = require('./models/appointment');
const ScheduleRequest = require('./models/scheduleRequest');
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
  
  for (let i = 1; i <= 30; i += 3) {
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

// Format time as HH:mm
function formatTime(hour, minute = 0) {
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

// Create sample data
async function seedCalendarData() {
  try {
    console.log('\n📅 Starting calendar data seeding...\n');

    // Find or create a test user
    let testUser = await User.findOne({ email: 'testpatient@gmail.com' });
    
    if (!testUser) {
      console.log('Creating test user...');
      testUser = new User({
        firstName: 'Test',
        lastName: 'Patient',
        email: 'testpatient@gmail.com',
        password: 'password123',
        phone: '09171234567',
        unitNumber: '5',
        role: 'resident',
        isActive: true
      });
      await testUser.save();
      console.log('✓ Test user created: testpatient@gmail.com / password123');
    } else {
      console.log('✓ Test user found: testpatient@gmail.com');
    }

    // Get dates for scheduling
    const dates = generateDates();
    
    // Appointment types
    const appointmentTypes = [
      'Medical Consultation',
      'Dental Checkup',
      'Health Certificate',
      'Vaccination',
      'Community Meeting',
      'Barangay Clearance',
      'Document Request',
      'Sports Facility Booking'
    ];

    // Status types
    const scheduleRequestStatuses = ['pending', 'approved', 'rejected'];
    const appointmentStatuses = ['pending', 'scheduled', 'completed', 'cancelled'];

    console.log('\n📝 Creating Schedule Requests...');
    
    // Create schedule requests
    const scheduleRequests = [];
    for (let i = 0; i < 5; i++) {
      const date = dates[i];
      const hour = 9 + (i * 2);
      const startDateTime = `${formatDate(date)}T${formatTime(hour)}`;
      const endDateTime = `${formatDate(date)}T${formatTime(hour + 1)}`;
      
      const request = new ScheduleRequest({
        title: `${appointmentTypes[i]} Request`,
        start: startDateTime,
        end: endDateTime,
        appointmentType: appointmentTypes[i],
        requester: testUser._id,
        status: scheduleRequestStatuses[i % 3],
        createdAt: new Date(Date.now() - (5 - i) * 24 * 60 * 60 * 1000) // Stagger creation dates
      });
      
      await request.save();
      scheduleRequests.push(request);
      console.log(`  ✓ Created: ${request.title} - ${formatDate(date)} at ${formatTime(hour)} (Status: ${request.status})`);
    }

    console.log('\n📅 Creating Appointments...');
    
    // Create appointments
    const appointments = [];
    for (let i = 0; i < 8; i++) {
      const date = dates[i];
      const hour = 10 + (i % 6);
      
      const appointment = new Appointment({
        patientId: testUser._id,
        appointmentDate: formatDate(date),
        appointmentTime: formatTime(hour),
        appointmentType: appointmentTypes[i],
        status: appointmentStatuses[i % 4],
        notes: `Sample appointment for ${appointmentTypes[i]}`,
        createdBy: testUser._id
      });
      
      await appointment.save();
      appointments.push(appointment);
      console.log(`  ✓ Created: ${appointment.appointmentType} - ${formatDate(date)} at ${formatTime(hour)} (Status: ${appointment.status})`);
    }

    console.log('\n✅ Calendar data seeded successfully!');
    console.log(`\n📊 Summary:`);
    console.log(`   - Schedule Requests: ${scheduleRequests.length}`);
    console.log(`   - Appointments: ${appointments.length}`);
    console.log(`   - Total Events: ${scheduleRequests.length + appointments.length}`);
    console.log(`\n👤 Test User Credentials:`);
    console.log(`   Email: testpatient@gmail.com`);
    console.log(`   Password: password123`);
    console.log(`\n🌐 You can now login and view the calendar at: http://localhost:3000/users/dashboard\n`);

  } catch (error) {
    console.error('\n✗ Error seeding calendar data:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed.');
  }
}

// Run the seeder
(async () => {
  await connectDB();
  await seedCalendarData();
})();
