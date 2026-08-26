// jobs/README.md
# Announcement Scheduler Job

This job automatically expires announcements and activates scheduled announcements.

## How it works
- Runs every minute (recommended via Task Scheduler or cron)
- Expires announcements whose `expiryDate` is past
- Activates announcements whose `scheduleDate` is now or past

## Usage

Run manually:
```cmd
node jobs/announcementScheduler.js
```

Automate (Windows Task Scheduler or cron):
- Schedule the above command to run every minute

## Requirements
- MongoDB connection string in `config/database.js` as `mongoURI`
- Announcement model in `models/announcements.js`
