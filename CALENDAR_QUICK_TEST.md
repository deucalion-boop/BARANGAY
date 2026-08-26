# Calendar Quick Test Guide

## Quick Start

### 1. Seed Test Data
```bash
node seed-calendar-data.js
```

### 2. Start Server
```bash
node server.js
```

### 3. Login as Test User
- URL: http://localhost:3000
- Email: `testpatient@gmail.com`
- Password: `password123`

### 4. View Calendar
- After login, you'll see the dashboard with the calendar
- Should display 13 events (5 requests + 8 appointments)

## Test Scenarios

### Scenario 1: View Calendar Events
1. Login as test user
2. Go to `/users/dashboard`
3. **Expected**: Calendar with 13 events in different colors
4. **Verify**: 
   - Orange events = Pending
   - Blue events = Approved/Scheduled
   - Green events = Completed
   - Red events = Cancelled/Rejected

### Scenario 2: Click Event Details
1. Click any event on the calendar
2. **Expected**: Alert showing event details
3. **Verify**:
   - Title displays correctly
   - Date and time are accurate
   - Status shows properly
   - Type shows "Schedule Request" or "Appointment"

### Scenario 3: Create New Schedule Request
1. Go to `/users/schedule`
2. Fill out "Request Booking" form:
   - Title: "Test Booking"
   - Date/Time: Pick any future date
   - Type: Select from dropdown
3. Click "Request Booking"
4. **Expected**: Redirect to schedule page with new request
5. Go back to `/users/dashboard`
6. **Expected**: New event appears on calendar (orange/pending)

### Scenario 4: Switch Calendar Views
1. On dashboard calendar
2. Click "timeGridWeek" button
3. **Expected**: Week view with time slots
4. Click "listWeek" button
5. **Expected**: List view of events
6. Click "dayGridMonth" button
7. **Expected**: Back to month view

### Scenario 5: Navigate Months
1. Click "prev" button
2. **Expected**: Previous month displayed
3. Click "next" button twice
4. **Expected**: Next month displayed
5. Click "today" button
6. **Expected**: Current month displayed with today highlighted

## API Testing

### Test API Endpoint Directly
```bash
# Using curl (requires active session)
curl http://localhost:3000/users/schedule/appointments \
  -H "Cookie: connect.sid=YOUR_SESSION_ID"
```

### Expected Response
```json
{
  "success": true,
  "appointments": [
    {
      "_id": "...",
      "title": "Medical Consultation",
      "start": "2025-11-02T10:00",
      "appointmentType": "Medical Consultation",
      "status": "pending",
      "source": "appointment"
    }
  ]
}
```

## Admin Testing

### Test Admin Approval Flow
1. Login as admin
2. Go to `/admin/schedule`
3. Find a pending request
4. Click "Approve"
5. Fill in appointment details
6. Submit
7. Logout and login as test user
8. **Expected**: Request now shows as "scheduled" (blue) on calendar

## Database Verification

### Check Schedule Requests
```javascript
// In MongoDB shell or Compass
db.schedulerequests.find({ requester: ObjectId("TEST_USER_ID") })
```

### Check Appointments
```javascript
// In MongoDB shell or Compass
db.appointments.find({ patientId: ObjectId("TEST_USER_ID") })
```

## Troubleshooting

### No Events Showing
**Problem**: Calendar is empty
**Solutions**:
- Run `node seed-calendar-data.js` again
- Check if logged in as `testpatient@gmail.com`
- Open browser console for errors
- Verify API returns data: `/users/schedule/appointments`

### Events Show Wrong Dates
**Problem**: Events appear on wrong dates
**Solutions**:
- Check date format in database (should be ISO: YYYY-MM-DD)
- Verify time format (HH:mm)
- Check browser timezone settings

### Calendar Not Loading
**Problem**: Calendar doesn't appear
**Solutions**:
- Check if FullCalendar library loaded (view page source)
- Check browser console for JavaScript errors
- Verify `#calendar` element exists in DOM
- Clear browser cache

### Server Not Starting
**Problem**: `node server.js` fails
**Solutions**:
- Check if MongoDB is running
- Verify port 3000 is available
- Check for syntax errors in recent changes
- Review server logs

## Color Reference

| Status | Color | Hex Code |
|--------|-------|----------|
| Pending | Orange | #ed8936 |
| Approved/Scheduled | Blue | #4299e1 |
| Completed | Green | #48bb78 |
| Cancelled/Rejected | Red | #f56565 |
| Reschedule Requested | Yellow | #ecc94b |

## Files Modified

### Backend
- `routes/index.js` - Added API endpoint
- `seed-calendar-data.js` - Test data generator

### Frontend
- `views/user-dashboard.ejs` - Added calendar HTML, CSS, and JS

### Documentation
- `CALENDAR_README.md` - Full documentation
- `CALENDAR_QUICK_TEST.md` - This file

## Performance Checks

### Page Load Time
- Dashboard should load in < 2 seconds
- Calendar render should be instant
- API call should return in < 500ms

### Browser Compatibility
Test in:
- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari
- ✅ Mobile browsers

## Next Steps After Testing

1. ✅ Verify calendar displays correctly
2. ✅ Test creating new schedule requests
3. ✅ Confirm admin approval flow
4. ✅ Check mobile responsiveness
5. ✅ Review error handling
6. ⬜ Deploy to production
7. ⬜ Monitor user feedback
8. ⬜ Add analytics tracking

---

**Happy Testing!** 🎉📅
