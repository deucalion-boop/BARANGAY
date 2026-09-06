// jobs/announcementScheduler.js
// This job checks for expired and scheduled announcements every minute and updates their status.

const Announcement = require('../models/announcements');

async function runScheduler() {
  const now = new Date();

  // Expire announcements
  await Announcement.updateMany(
    { expiryDate: { $lte: now, $ne: null }, isActive: true },
    { $set: { isActive: false } }
  );

  // Activate scheduled announcements
  await Announcement.updateMany(
    { scheduleDate: { $lte: now, $ne: null }, isActive: false },
    { $set: { isActive: true, scheduleDate: null } }
  );

}

if (require.main === module) {
  runScheduler()
    .then(() => console.log('Announcement scheduler ran at', new Date().toLocaleString()))
    .catch(err => console.error('Scheduler error:', err));
}

module.exports = runScheduler;
