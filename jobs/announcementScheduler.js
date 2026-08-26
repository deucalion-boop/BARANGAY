// jobs/announcementScheduler.js
// This job checks for expired and scheduled announcements every minute and updates their status.

const mongoose = require('mongoose');
const Announcement = require('../models/announcements');
const { mongoURI } = require('../config/database');

async function runScheduler() {
  await mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
  const now = new Date();

  // Expire announcements
  await Announcement.updateMany(
    { expiryDate: { $lte: now }, isActive: true, expiryDate: { $ne: null } },
    { $set: { isActive: false } }
  );

  // Activate scheduled announcements
  await Announcement.updateMany(
    { scheduleDate: { $lte: now }, isActive: false, scheduleDate: { $ne: null } },
    { $set: { isActive: true, scheduleDate: null } }
  );

  await mongoose.disconnect();
}

if (require.main === module) {
  runScheduler()
    .then(() => console.log('Announcement scheduler ran at', new Date().toLocaleString()))
    .catch(err => console.error('Scheduler error:', err));
}

module.exports = runScheduler;
