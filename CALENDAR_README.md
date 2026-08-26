# User Dashboard Calendar Feature

## Overview
The user dashboard now includes an interactive calendar that displays all schedule requests and appointments for the logged-in resident. The calendar provides a visual representation of upcoming events, past appointments, and pending requests.

## Features

### 1. **Interactive Calendar View**
- **Month View**: See all events for the entire month
- **Week View**: Detailed view of the current week with time slots
- **List View**: Chronological list of all events
- Navigation: Previous/Next month buttons and "Today" quick navigation

### 2. **Event Types**
The calendar displays two types of events:

#### Schedule Requests
- Events created when residents request appointments/bookings
- Submitted through `/users/schedule` page
- Shows status: `pending`, `approved`, `rejected`, `expired`

#### Appointments
- Confirmed appointments created by admin
- Shows status: `pending`, `scheduled`, `completed`, `cancelled`

### 3. **Color-Coded Status**
Events are color-coded based on their status:
- 🟠 **Orange**: Pending
- 🔵 **Blue**: Approved/Scheduled
- 🟢 **Green**: Completed
- 🔴 **Red**: Cancelled/Rejected
- 🟡 **Yellow**: Reschedule Requested

### 4. **Event Details**
Click on any event to see:
- Event title
- Event type (Schedule Request or Appointment)
- Date and time
- Current status
- Additional notes (if available)

## How It Works

### Backend Implementation

#### API Endpoint: `/users/schedule/appointments`
```javascript
GET /users/schedule/appointments
```
- Fetches both schedule requests and appointments for the logged-in user
- Returns combined data in calendar-friendly format
- Requires authentication (checks `req.session.userId`)

**Response Format:**
```json
{
  "success": true,
  "appointments": [
    {
      "_id": "...",
      "title": "Medical Consultation",
      "start": "2025-11-02T09:00",
      "end": null,
      "appointmentType": "Medical Consultation",
      "status": "pending",
      "notes": "...",
      "source": "appointment"
    },
    {
      "_id": "...",
      "title": "Dental Checkup Request",
      "start": "2025-11-05T11:00",
      "end": "2025-11-05T12:00",
      "appointmentType": "Dental Checkup",
      "status": "approved",
      "source": "request"
    }
  ]
}
```

### Frontend Implementation

#### Calendar Initialization
The calendar uses **FullCalendar** library (v6.1.10):
```html
<link href='https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/main.min.css' rel='stylesheet' />
<script src='https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.js'></script>
```

#### Key Functions
1. **`loadUserAppointments()`**: Fetches events from API
2. **`initializeCalendar()`**: Initializes FullCalendar with events
3. **`getStatusColor(status)`**: Returns color based on event status
4. **`showEventDetails(event)`**: Displays event information on click

## Creating Schedule Requests

### From the User Schedule Page
Residents can request appointments by:

1. Navigate to `/users/schedule`
2. Fill out the "Request Booking" form:
   - **Title**: Brief description of the appointment
   - **Date/Time**: Select date and time using datetime picker
   - **Type**: Choose from available appointment types
3. Click "Request Booking"
4. The request appears on the calendar immediately with "pending" status

### Request Flow
1. **User submits** → Request saved with status "pending"
2. **Appears on calendar** → Shown in orange (pending)
3. **Admin reviews** → Admin can approve, reject, or request reschedule
4. **Status updates** → Calendar reflects new status with updated color

## Test Data

### Generating Sample Data
Run the seed script to create test data:

```bash
node seed-calendar-data.js
```

**What it creates:**
- 1 Test user (resident)
- 5 Schedule requests (various statuses)
- 8 Appointments (various statuses)
- Total: 13 calendar events

**Test User Credentials:**
- Email: `testpatient@gmail.com`
- Password: `password123`

### Sample Data Includes:
- Medical consultations
- Dental checkups
- Health certificates
- Vaccinations
- Community meetings
- Barangay clearance
- Document requests
- Sports facility bookings

## Database Models

### ScheduleRequest Model
```javascript
{
  title: String,           // Event title
  start: String,           // ISO datetime (YYYY-MM-DDTHH:mm)
  end: String,             // ISO datetime (optional)
  appointmentType: String, // Type of appointment
  requester: ObjectId,     // User ID (ref: User)
  status: String,          // pending, approved, rejected, expired
  createdAt: Date
}
```

### Appointment Model
```javascript
{
  patientId: ObjectId,     // User ID (ref: User)
  appointmentDate: String, // Date (YYYY-MM-DD)
  appointmentTime: String, // Time (HH:mm)
  appointmentType: String, // Type of appointment
  status: String,          // pending, scheduled, completed, cancelled
  notes: String,
  createdBy: ObjectId,     // Admin who created it
  timestamps: true
}
```

## Usage Instructions

### For Residents

1. **Login** to your account at `/users/login`
2. **View Dashboard** at `/users/dashboard`
3. **See Calendar** - All your schedule requests and appointments appear automatically
4. **Request Appointment** - Go to `/users/schedule` and submit a request
5. **Check Status** - Click on calendar events to see details and current status

### For Administrators

1. **Review Requests** at `/admin/schedule`
2. **Approve/Reject** schedule requests
3. **Create Appointments** directly for residents
4. **Reschedule** if needed
5. Changes reflect **immediately** on resident's calendar

## Technical Details

### Real-time Updates
- Calendar loads fresh data on page load
- Events are fetched via AJAX (no page reload needed)
- Status changes require page refresh to see updates

### Responsive Design
- Calendar adapts to mobile screens
- Touch-friendly event interactions
- Collapsible toolbar on small screens

### Performance
- Efficient data loading (single API call)
- Client-side event rendering
- Minimal server requests

## Troubleshooting

### Calendar Not Showing Events
1. Check if user is logged in
2. Verify API endpoint returns data: `/users/schedule/appointments`
3. Check browser console for errors
4. Ensure FullCalendar library loaded correctly

### Events Have Wrong Dates
1. Verify date format in database (ISO 8601)
2. Check timezone settings
3. Ensure `appointmentDate` and `appointmentTime` are properly combined

### Colors Not Displaying
1. Check `getStatusColor()` function
2. Verify status values match expected enum values
3. Check CSS variables are defined

## Future Enhancements

Potential improvements:
- [ ] Real-time updates via WebSocket/SSE
- [ ] Drag-and-drop rescheduling
- [ ] Calendar export (iCal format)
- [ ] Email reminders for upcoming appointments
- [ ] Multi-day event support
- [ ] Recurring appointments
- [ ] Calendar sharing with family members
- [ ] Mobile app integration

## Support

For issues or questions:
1. Check the browser console for errors
2. Review server logs for API failures
3. Verify database connectivity
4. Contact system administrator

---

**Last Updated**: November 2, 2025
