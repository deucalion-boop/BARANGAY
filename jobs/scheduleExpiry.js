const cron = require('node-cron');
const ScheduleRequest = require('../models/scheduleRequest');
const settings = require('../utils/settings');

// Default expiry duration in days (can be configured through admin settings)
let SCHEDULE_EXPIRY_DAYS = settings.get('scheduleExpiryDays', 3);

/**
 * Update the schedule expiry duration
 * @param {number} days - Number of days after which requests expire
 */
function updateExpiryDuration(days) {
  if (days && days > 0 && days <= 30) {
    SCHEDULE_EXPIRY_DAYS = days;
    console.log(`Schedule request expiry duration updated to ${days} days`);
    // Persist to settings
    try { settings.set('scheduleExpiryDays', days); } catch (e) {}
  }
}

/**
 * Check and expire old schedule requests
 */
async function expireOldScheduleRequests() {
  try {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() - SCHEDULE_EXPIRY_DAYS);
    
    console.log(`Checking for schedule requests older than ${SCHEDULE_EXPIRY_DAYS} days (before ${expiryDate.toISOString()})`);
    
    // Find pending requests that are older than the expiry duration
    const expiredRequests = await ScheduleRequest.find({
      status: 'pending',
      createdAt: { $lt: expiryDate }
    });
    
    if (expiredRequests.length > 0) {
      console.log(`Found ${expiredRequests.length} expired schedule requests`);
      
      // Update expired requests to 'expired' status
      const result = await ScheduleRequest.updateMany(
        {
          status: 'pending',
          createdAt: { $lt: expiryDate }
        },
        {
          $set: {
            status: 'expired',
            expiredAt: new Date(),
            adminNotes: `Request automatically expired after ${SCHEDULE_EXPIRY_DAYS} days without admin action`
          }
        }
      );
      
      console.log(`Marked ${result.modifiedCount} schedule requests as expired`);
      
      // Log details of expired requests
      expiredRequests.forEach(req => {
        console.log(`Expired request: ${req.title} from ${req.requester} (Created: ${req.createdAt})`);
      });
      
      return {
        success: true,
        expiredCount: result.modifiedCount,
        message: `Successfully expired ${result.modifiedCount} old schedule requests`
      };
    } else {
      console.log('No expired schedule requests found');
      return {
        success: true,
        expiredCount: 0,
        message: 'No expired schedule requests found'
      };
    }
  } catch (error) {
    console.error('Error expiring schedule requests:', error);
    return {
      success: false,
      error: error.message,
      message: 'Failed to expire old schedule requests'
    };
  }
}

/**
 * Get statistics about schedule request expiry
 */
async function getExpiryStatistics() {
  try {
    const now = new Date();
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() - SCHEDULE_EXPIRY_DAYS);
    
    const [
      totalPending,
      nearExpiry,
      totalExpired
    ] = await Promise.all([
      ScheduleRequest.countDocuments({ status: 'pending' }),
      ScheduleRequest.countDocuments({
        status: 'pending',
        createdAt: {
          $lt: new Date(now.getTime() - ((SCHEDULE_EXPIRY_DAYS - 1) * 24 * 60 * 60 * 1000)),
          $gte: expiryDate
        }
      }),
      ScheduleRequest.countDocuments({ status: 'expired' })
    ]);
    
    return {
      expiryDays: SCHEDULE_EXPIRY_DAYS,
      totalPending,
      nearExpiry, // Requests that will expire in less than 1 day
      totalExpired
    };
  } catch (error) {
    console.error('Error getting expiry statistics:', error);
    return null;
  }
}

/**
 * Initialize the schedule request expiry manager
 */
function initializeScheduleExpiry() {
  console.log('Initializing Schedule Request Expiry Manager...');
  
  // Run expiry check daily at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('Running scheduled expiry check for schedule requests...');
    const result = await expireOldScheduleRequests();
    
    if (result.success && result.expiredCount > 0) {
      // You could send notifications to admins here
      console.log(`Daily expiry check completed: ${result.message}`);
    }
  });
  
  // Run an initial check when the server starts
  setTimeout(async () => {
    console.log('Running initial expiry check...');
    await expireOldScheduleRequests();
  }, 5000); // Wait 5 seconds after server start
  
  console.log(`Schedule Request Expiry Manager initialized with ${SCHEDULE_EXPIRY_DAYS} days expiry`);
}

/**
 * Manual trigger for expiry check (for admin use)
 */
async function manualExpiryCheck() {
  console.log('Manual expiry check triggered by admin');
  return await expireOldScheduleRequests();
}

module.exports = {
  initializeScheduleExpiry,
  expireOldScheduleRequests,
  updateExpiryDuration,
  getExpiryStatistics,
  manualExpiryCheck
};