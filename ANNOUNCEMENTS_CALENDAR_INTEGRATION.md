# Announcements Calendar Integration

## Overview
Announcements with scheduled dates now appear on the user's calendar, providing residents with a visual representation of upcoming community events, maintenance schedules, and important notices.

## Features

### 1. **Automatic Calendar Display**
- All active announcements with a `scheduleDate` automatically appear on user calendars
- Color-coded by priority level
- Shows alongside appointments and schedule requests

### 2. **Priority-Based Colors**
Announcements are color-coded based on their priority:

| Priority | Color | Hex Code | Use Case |
|----------|-------|----------|----------|
| **Low** | Gray | #94a3b8 | Minor updates, routine information |
| **Medium** | Blue | #3b82f6 | Regular events, general notices |
| **High** | Orange | #f59e0b | Important events, time-sensitive info |
| **Urgent** | Red | #ef4444 | Emergencies, critical alerts |

### 3. **Announcement Types**
Different categories of announcements:
- **General** - Regular community updates
- **Emergency** - Critical alerts requiring immediate attention
- **Maintenance** - Scheduled maintenance notifications
- **Event** - Community events and gatherings
- **Urgent** - Time-sensitive important information

### 4. **Modal Details**
When clicking an announcement on the calendar, users see:
- ✅ Announcement title
- ✅ Category (Event, Emergency, etc.)
- ✅ Scheduled date and time
- ✅ Priority level
- ✅ Full announcement content
- ✅ Distinct icon (bullhorn)

## How It Works

### Backend Implementation

#### API Endpoint Enhancement
The `/users/schedule/appointments` endpoint now includes announcements:

```javascript
// Fetches three types of events:
1. User's personal appointments
2. User's schedule requests
3. Active announcements with scheduleDate
```

**Query Logic:**
```javascript
Announcement.find({ 
  isActive: true,           // Only active announcements
  isArchived: false,        // Not archived
  scheduleDate: { $ne: null }  // Has a scheduled date
})
```

#### Data Transformation
Announcements are converted to calendar events:
```javascript
{
  _id: announcement._id,
  title: announcement.title,
  start: "2025-11-02T09:00",  // ISO format
  source: 'announcement',      // Identifies as announcement
  priority: 'high',            // For color coding
  type: 'event',               // Category
  notes: announcement.content  // Full content
}
```

### Frontend Implementation

#### Calendar Display
Announcements appear with:
- Distinct styling based on priority
- Bullhorn icon in modal
- Full content preview

#### Event Detection
JavaScript detects announcement events using the `source` property:
```javascript
if (props.source === 'announcement') {
  // Show priority instead of status
  // Use bullhorn icon
  // Display content instead of notes
}
```

## Creating Scheduled Announcements

### As Admin

#### Option 1: Through Admin Panel
1. Go to `/admin/announcements`
2. Click "Create Announcement"
3. Fill in the form:
   - **Title**: Brief, descriptive title
   - **Content**: Full announcement text
   - **Type**: Select category (event, emergency, etc.)
   - **Priority**: Select urgency level
   - **Schedule Date**: Pick date and time
4. Click "Create"
5. Announcement appears on all users' calendars

#### Option 2: Via Script
```bash
node seed-announcements.js
```
Creates 8 sample announcements with various types and priorities.

### Database Schema
```javascript
{
  title: String,              // "Community Clean-Up Drive"
  content: String,            // Full announcement text
  type: String,               // 'general', 'emergency', 'maintenance', 'event'
  priority: String,           // 'low', 'medium', 'high', 'urgent'
  isActive: Boolean,          // Must be true to appear
  isArchived: Boolean,        // Must be false to appear
  scheduleDate: Date,         // When to show on calendar
  createdBy: ObjectId         // Admin who created it
}
```

## Test Data

### Sample Announcements Created
Running `node seed-announcements.js` creates:

1. **Community Clean-Up Drive** (Event, Medium) - Nov 2
2. **Basketball Tournament Finals** (Event, High) - Nov 6
3. **Emergency: Water Interruption** (Emergency, Urgent) - Nov 10
4. **Barangay Assembly Meeting** (Event, High) - Nov 14
5. **Free Medical Check-up** (Event, Medium) - Nov 18
6. **Street Light Maintenance** (Maintenance, Low) - Nov 22
7. **Vaccination Drive** (Event, Urgent) - Nov 26
8. **Garbage Collection Schedule Change** (General, Medium) - Nov 30

### Calendar View
Users will see approximately 21 total events:
- 8 Appointments
- 5 Schedule Requests
- 8 Announcements
- **Total: 21 calendar events**

## Visual Distinctions

### Icons in Modal
- 📅 Appointments: `fa-calendar-check`
- ➕ Schedule Requests: `fa-calendar-plus`
- 📢 Announcements: `fa-bullhorn`

### Badge Styles
Status badges for appointments/requests:
```
pending | approved | scheduled | completed | cancelled
```

Priority badges for announcements:
```
low | medium | high | urgent
```

## User Experience

### Calendar View
1. User logs in and navigates to dashboard
2. Calendar displays all personal events AND community announcements
3. Color coding helps identify priority at a glance
4. Click any event to see full details

### Modal Information
**Appointment/Request:**
- Title
- Type badge
- Date & Time
- Status badge
- Appointment type
- Notes

**Announcement:**
- Title
- Type badge (with bullhorn icon)
- Date & Time
- Priority badge
- Category
- Full content

## Benefits

### For Residents
- ✅ See all personal and community events in one place
- ✅ Visual priority indicators
- ✅ Never miss important announcements
- ✅ Plan ahead with scheduled events
- ✅ Integrated view of appointments and community activities

### For Administrators
- ✅ Schedule announcements in advance
- ✅ Set appropriate priority levels
- ✅ Automatic distribution to all residents
- ✅ Categorize by type for better organization
- ✅ Archive old announcements easily

## Configuration

### Show/Hide Announcements
To hide announcements from calendar (if needed):
```javascript
// In routes/index.js, comment out announcement fetching:
const [requests, appointments] = await Promise.all([
  ScheduleRequest.find({ requester: userId }).sort({ createdAt: -1 }).lean(),
  Appointment.find({ patientId: userId }).sort({ appointmentDate: 1 }).lean(),
  // Announcement.find({ ... }).lean()  // Commented out
]);
```

### Filter by Type
To show only specific announcement types:
```javascript
Announcement.find({ 
  isActive: true,
  isArchived: false,
  scheduleDate: { $ne: null },
  type: { $in: ['emergency', 'urgent'] }  // Only emergencies
})
```

## Troubleshooting

### Announcements Not Showing
**Possible Issues:**
1. `scheduleDate` is null
2. `isActive` is false
3. `isArchived` is true
4. Date is in the past (check calendar navigation)

**Solutions:**
```javascript
// Check in MongoDB
db.announcements.find({
  scheduleDate: { $ne: null },
  isActive: true,
  isArchived: false
})
```

### Wrong Colors
**Issue:** Announcements showing wrong colors
**Solution:** Check priority field matches defined colors:
- low → Gray
- medium → Blue
- high → Orange
- urgent → Red

### Missing Content
**Issue:** Modal shows "N/A" for notes
**Solution:** Ensure `content` field is populated in announcement document

## Future Enhancements

Potential improvements:
- [ ] Filter calendar by event type (show/hide announcements)
- [ ] RSVP functionality for community events
- [ ] Reminder notifications before scheduled events
- [ ] Calendar export including announcements
- [ ] Recurring announcements (weekly meetings, etc.)
- [ ] Announcement attachments (PDFs, images)
- [ ] User preferences for announcement types
- [ ] Email/SMS notifications for urgent announcements

## Testing Checklist

- [x] Announcements appear on calendar
- [x] Color coding works correctly
- [x] Modal displays all information
- [x] Multiple event types display together
- [x] Priority badges show correctly
- [x] Icon changes based on source type
- [x] Content preview works
- [x] Clicking announcement opens modal
- [x] Close modal functionality
- [x] Mobile responsive display

---

**Status**: ✅ Fully Implemented and Tested
**Last Updated**: November 2, 2025
