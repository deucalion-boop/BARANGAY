# Admin Guide: Adding Announcements to Calendar

## Overview
Admins can now schedule announcements to appear on residents' calendars by setting a **Schedule Date** when creating or editing announcements.

## How to Add Announcements to Calendar

### Step 1: Access Admin Announcements
1. Login as admin
2. Navigate to `/admin/announcements`
3. Click **"Add New Announcement"** button

### Step 2: Fill Out Announcement Form

#### Required Fields:
- **Title** - Brief, descriptive title (e.g., "Community Clean-Up Drive")
- **Content** - Full announcement text with details

#### Optional Fields:
- **Image** - Upload an image for the announcement
- **Type** - Select category:
  - General
  - Urgent
  - Maintenance
  - Event (recommended for calendar events)
- **Priority** - Select urgency level:
  - Low (Gray on calendar)
  - Medium (Blue on calendar)
  - High (Orange on calendar)
  - Urgent (Red on calendar)
- **Expiry Date** - When announcement becomes inactive
- **Schedule Date** ⭐ **NEW** - When to show on calendar
- **Active** - Toggle announcement visibility

### Step 3: Set Schedule Date for Calendar

To make the announcement appear on residents' calendars:

1. Find the **"Schedule Date"** field
2. Click to open date/time picker
3. Select the date and time
4. **Important**: The schedule date determines when residents see this event on their calendar

**Example:**
```
Schedule Date: 2025-11-15 at 09:00 AM
```

This announcement will appear on all residents' calendars on November 15, 2025 at 9:00 AM.

### Step 4: Save Announcement

1. Click **"Save Announcement"**
2. Announcement is created and immediately available
3. If you set a Schedule Date:
   - ✅ Appears on ALL residents' calendars
   - ✅ Shows with priority-based color
   - ✅ Displays in calendar's month/week/list views

## Calendar Display

### How Announcements Appear

When residents view their dashboard calendar at `/users/dashboard`:

- **Color-coded by priority:**
  - 🔴 Urgent = Red
  - 🟠 High = Orange  
  - 🔵 Medium = Blue
  - ⚪ Low = Gray

- **Event details show:**
  - Announcement title
  - Scheduled date/time
  - Priority level
  - Category (type)
  - Full content

### Example Use Cases

#### 1. Community Event
```
Title: Basketball Tournament Finals
Type: Event
Priority: High
Schedule Date: 2025-11-10 at 14:00
Content: Championship game! Come support your team at the barangay court.
```
**Result:** Appears on Nov 10 at 2:00 PM with orange color (high priority)

#### 2. Emergency Notice
```
Title: Emergency: Water Interruption
Type: Emergency  
Priority: Urgent
Schedule Date: 2025-11-05 at 06:00
Content: Water supply shut off for maintenance. Duration: 6 hours. Store water in advance.
```
**Result:** Appears on Nov 5 at 6:00 AM with red color (urgent)

#### 3. Regular Meeting
```
Title: Monthly Barangay Assembly
Type: Event
Priority: Medium
Schedule Date: 2025-11-20 at 18:00
Content: Monthly assembly at the barangay hall. All residents encouraged to attend.
```
**Result:** Appears on Nov 20 at 6:00 PM with blue color (medium priority)

## Editing Scheduled Announcements

### To Edit an Existing Announcement:

1. Go to `/admin/announcements`
2. Find the announcement in the list
3. Click the **edit/view icon** (eye or pencil icon)
4. Modal opens with current data
5. Modify any field including Schedule Date
6. Click **"Save Announcement"**

**Schedule Date field shows:**
- Current scheduled date/time if set
- Empty if no schedule date was set

### To Add Schedule Date to Existing Announcement:

1. Edit the announcement
2. Set the **Schedule Date** field
3. Save
4. Announcement now appears on residents' calendars

### To Remove from Calendar:

1. Edit the announcement
2. Clear the **Schedule Date** field
3. Save
4. Announcement removed from calendars (but still visible in announcements page)

## Viewing Scheduled Announcements

### Admin View
In `/admin/announcements`, you can see all announcements with their details including schedule dates (if you add a column for it in future updates).

### Resident View
Residents see scheduled announcements:
1. **Calendar Dashboard** (`/users/dashboard`)
   - Visual calendar with all events
   - Announcements appear alongside appointments
   - Click any event to see full details

2. **Announcements Page** (`/users/announcements`)
   - List view of all active announcements
   - Separate from calendar

## Best Practices

### ✅ DO:
- Set Schedule Date for time-sensitive events
- Use appropriate priority levels
- Write clear, concise titles
- Include complete information in content
- Set Type = "Event" for community events
- Use "Urgent" priority sparingly (emergencies only)

### ❌ DON'T:
- Schedule announcements in the past
- Use "Urgent" for routine announcements
- Leave content field empty or vague
- Forget to set "Active" checkbox
- Schedule multiple events at exact same time (can clutter calendar)

## Technical Details

### Database Fields
```javascript
{
  title: String,
  content: String,
  type: String,              // general, urgent, maintenance, event
  priority: String,          // low, medium, high, urgent
  scheduleDate: Date,        // ISO datetime for calendar
  isActive: Boolean,
  isArchived: Boolean,
  expiryDate: Date,
  imageUrl: String,
  createdBy: ObjectId
}
```

### Calendar Query
Only announcements with:
- `isActive: true`
- `isArchived: false`  
- `scheduleDate` not null

Will appear on residents' calendars.

### API Endpoint
Residents' calendar fetches announcements via:
```
GET /users/schedule/appointments
```

Returns combined data:
- User's appointments
- User's schedule requests
- All active scheduled announcements

## Testing

### Create Test Announcement
1. Login as admin: `/admin/login`
2. Go to: `/admin/announcements`
3. Click: **Add New Announcement**
4. Fill form:
   - Title: "Test Calendar Event"
   - Content: "This is a test announcement for the calendar"
   - Type: Event
   - Priority: Medium
   - Schedule Date: [Tomorrow at 10:00 AM]
5. Save
6. Logout and login as resident
7. Go to: `/users/dashboard`
8. **Expected:** See "Test Calendar Event" on tomorrow's date in blue

### Verify Display
- ✅ Announcement appears on calendar
- ✅ Correct color based on priority
- ✅ Click shows modal with full details
- ✅ Shows bullhorn icon (📢)
- ✅ Displays priority badge
- ✅ Shows full content

## Troubleshooting

### Announcement Not Showing on Calendar

**Problem:** Created announcement doesn't appear

**Check:**
1. ✅ Schedule Date is set (not empty)
2. ✅ isActive is checked (true)
3. ✅ isArchived is unchecked (false)
4. ✅ Schedule Date is not in the past
5. ✅ Calendar is viewing correct month/date

**Solution:** Edit announcement and verify all settings

### Wrong Date on Calendar

**Problem:** Announcement shows on wrong date

**Solution:** 
- Edit announcement
- Verify Schedule Date field
- Check timezone settings (server vs browser)
- Update and save

### No Color/Wrong Color

**Problem:** Announcement has wrong color

**Solution:**
- Check Priority field (low/medium/high/urgent)
- Priority determines calendar color
- Edit and update priority if needed

## Sample Test Script

You can also use the provided script:

```bash
node seed-announcements.js
```

This creates 8 sample announcements with various:
- Types (event, emergency, maintenance, general)
- Priorities (low, medium, high, urgent)
- Scheduled dates (spread across 30 days)

Perfect for testing the calendar integration!

---

## Quick Reference

| Field | Required | Purpose |
|-------|----------|---------|
| Title | ✅ Yes | Display on calendar |
| Content | ✅ Yes | Full details in modal |
| Type | ❌ No | Category badge |
| Priority | ❌ No | Calendar color |
| **Schedule Date** | ❌ **No** | **Show on calendar** ⭐ |
| Expiry Date | ❌ No | Auto-deactivate date |
| Active | ✅ Yes | Visibility toggle |

**Remember:** Only announcements WITH a Schedule Date appear on the calendar!

---

**Last Updated:** November 2, 2025
**Feature Status:** ✅ Fully Implemented
