const express = require('express');
const router = express.Router();
const User = require('../models/User');
const ResidentRequest = require('../models/residentRequest');
const Announcement = require('../models/announcements');
const ScheduleRequest = require('../models/scheduleRequest');
const Appointment = require('../models/appointment');
// reCAPTCHA config (provides site key for client widget)
const recaptchaConfig = require('../config/recaptcha');
const { verifyRecaptcha } = require('../utils/recaptcha');
const { createSupabaseAuthClient, createSupabaseAdminClient } = require('../config/supabase');

// Homepage route
router.get('/', async (req, res) => {
  const settings = require('../utils/settings').getAll();

  // Preload latest active announcements for SSR preview on homepage
  let homeAnnouncements = [];
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    homeAnnouncements = await Announcement.find({
      isActive: true,
      isArchived: { $ne: true },
      $or: [
        { expiryDate: { $exists: false } },
        { expiryDate: null },
        { expiryDate: { $gte: todayStart } }
      ]
    })
      .select('title content type priority imageUrl createdAt')
      .sort({ priority: -1, createdAt: -1 })
  .limit(3)
      .lean();
  } catch (e) {
    console.warn('Failed to preload home announcements:', e.message);
    homeAnnouncements = [];
  }

  res.render('index', { 
    title: 'Community Portal - Home',
    activePage: 'home',
    allowUserRegistration: settings.allowUserRegistration !== false,
    siteTagline: settings.siteTagline || 'Serving Our Community',
    siteDescription: settings.siteDescription || 'Welcome to our Barangay Health Center management system. We provide comprehensive healthcare services to our community.',
    // Provide reCAPTCHA site key to the view (falls back to test key when unset)
    recaptchaSiteKey: recaptchaConfig.siteKey,
    // Server-side rendered announcements list for the preview section
    homeAnnouncements
  });
});

// Language switching removed

// About route
router.get('/about', (req, res) => {
  res.render('about', { 
    title: 'About Us',
    activePage: 'about'
  });
});

// Contact route
router.get('/contact', (req, res) => {
  res.render('contact', { 
    title: 'Contact Us',
    activePage: 'contact'
  });
});

// Terms of Service route
router.get('/terms', (req, res) => {
  res.render('terms', { 
    title: 'Terms of Service',
    activePage: 'terms'
  });
});

// Privacy Policy route
router.get('/privacy', (req, res) => {
  res.render('privacy', { 
    title: 'Privacy Policy',
    activePage: 'privacy'
  });
});

// Forgot Password route
router.get('/users/forgot-password', (req, res) => {
  res.render('forgot-password', { 
    title: 'Forgot Password',
    activePage: 'forgot-password'
  });
});

// Admin Forgot Password route
router.get('/admin/forgot-password', (req, res) => {
  res.render('admin-forgot-password', { 
    title: 'Admin Forgot Password',
    activePage: 'admin-forgot-password'
  });
});

// User Registration Page - Redirect to home with modal trigger
router.get('/users/register', (req, res) => {
  // If already logged in, redirect to dashboard
  if (req.session && req.session.userId) {
    return res.redirect('/users/dashboard');
  }
  
  // Redirect to home page where the registration modal exists
  res.redirect('/#register');
});

// User Login Page - Redirect to home with modal trigger
router.get('/users/login', (req, res) => {
  // If already logged in, redirect to dashboard
  if (req.session && req.session.userId) {
    return res.redirect('/users/dashboard');
  }
  
  // Redirect to home page where the login modal exists
  res.redirect('/#login');
});

// User Registration POST route
router.post('/users/register', async (req, res) => {
  try {
    const isRecaptchaValid = await verifyRecaptcha(req.body.recaptchaToken, req.ip);
    if (!isRecaptchaValid) {
      return res.status(400).json({
        success: false,
        message: 'reCAPTCHA verification failed. Please try again.'
      });
    }

    const settings = require('../utils/settings');
    if (settings.get('allowUserRegistration', true) === false) {
      return res.json({
        success: false,
        message: 'The system is under maintenance. Registration is currently disabled.'
      });
    }

    const { firstName, lastName, email, phone, unitNumber, password, confirmPassword } = req.body;

    // Validation checks
    if (!firstName || !lastName || !email || !phone || !unitNumber || !password || !confirmPassword) {
      return res.json({
        success: false,
        message: 'All fields are required'
      });
    }

    if (password !== confirmPassword) {
      return res.json({
        success: false,
        message: 'Passwords do not match'
      });
    }

    if (password.length < 6) {
      return res.json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [
        { email: email.toLowerCase() },
        { unitNumber: unitNumber.toUpperCase() }
      ]
    });

    if (existingUser) {
      if (existingUser.email === email.toLowerCase()) {
        return res.json({
          success: false,
          message: 'User already exists with this email'
        });
      } else {
        return res.json({
          success: false,
          message: 'Unit number is already registered'
        });
      }
    }

    // Create the credential in Supabase Auth. The SQL trigger creates its profile.
    const supabaseAdmin = createSupabaseAdminClient();
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedUnit = unitNumber.toUpperCase().trim();
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        unitNumber: normalizedUnit,
        role: 'resident',
        isActive: false,
      },
      app_metadata: { role: 'resident' },
    });
    if (authError) throw authError;

    const newUser = new User({
      id: authData.user.id,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: normalizedEmail,
      phone: phone.trim(),
      unitNumber: normalizedUnit,
      role: 'resident',
      isActive: false,
      emailVerified: true,
    });

    try {
      await newUser.save();
    } catch (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      throw profileError;
    }

    // Create a pending ResidentRequest for admin review
    try {
      const pendingReq = new ResidentRequest({
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
        phone: newUser.phone,
        unitNumber: newUser.unitNumber,
        createdBy: newUser._id,
        status: 'pending'
      });
      await pendingReq.save();
    } catch (e) {
      console.error('Failed to create ResidentRequest for new registration:', e);
    }

    res.json({
      success: true,
      message: 'Registration submitted. Please wait for the approval of the admin.'
    });

  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.json({
        success: false,
        message: errors.join(', ')
      });
    }

    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.json({
        success: false,
        message: 'User with this email or unit number already exists'
      });
    }

    res.json({
      success: false,
      message: 'Registration failed. Please try again.'
    });
  }
});

// User Login POST route
router.post('/users/login', async (req, res) => {
  try {
    const isRecaptchaValid = await verifyRecaptcha(req.body.recaptchaToken, req.ip);
    if (!isRecaptchaValid) {
      return res.status(400).json({
        success: false,
        message: 'reCAPTCHA verification failed. Please try again.'
      });
    }

    const { email, password } = req.body;

    const normalizedEmail = email.toLowerCase().trim();
    const supabase = createSupabaseAuthClient();
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (authError || !authData.user) {
      return res.json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const user = await User.findById(authData.user.id);
    if (!user) return res.json({ success: false, message: 'Resident profile was not found' });

    // Check if user is active (pending admin approval if inactive)
    if (!user.isActive) {
      return res.json({
        success: false,
        message: 'Your account is pending approval by an admin. Please wait for approval.'
      });
    }

    // Update last login and login count
    user.lastLogin = new Date();
    user.loginCount += 1;
    await user.save();

  // Set session
    req.session.userId = user._id;
    req.session.userRole = user.role;
    req.session.userName = user.firstName + ' ' + user.lastName;
    req.session.userEmail = user.email;
    req.session.unitNumber = user.unitNumber;
  req.session.avatarUrl = user.avatarUrl || '';

    res.json({
      success: true,
      message: 'Login successful!',
      redirectUrl: '/users/dashboard',
      user: {
        id: user._id,
        name: user.firstName + ' ' + user.lastName,
        role: user.role,
        email: user.email
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// User Dashboard route
router.get('/users/dashboard', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/');
  }
  
  // Also fetch user's schedule requests and appointments so the dashboard can render the calendar and requests
  (async () => {
    try {
      const userId = req.session.userId;
      const [requests, appointments] = await Promise.all([
        ScheduleRequest.find({ requester: userId }).sort({ createdAt: -1 }).lean(),
        Appointment.find({ patientId: userId }).sort({ appointmentDate: 1 }).lean()
      ]);

      res.render('user-dashboard', { 
        title: 'User Dashboard',
        activePage: 'dashboard',
        requests: requests || [],
        appointments: appointments || [],
        appointmentTypes: [],
        user: {
          firstName: (req.session.userName || '').split(' ')[0] || 'User',
          name: req.session.userName,
          email: req.session.userEmail,
          role: req.session.userRole,
          unitNumber: req.session.unitNumber,
          avatarUrl: req.session.avatarUrl || ''
        }
      });
    } catch (error) {
      console.error('Error loading dashboard schedule data:', error);
      // Render dashboard without schedule data on error
      res.render('user-dashboard', { 
        title: 'User Dashboard',
        activePage: 'dashboard',
        requests: [],
        appointments: [],
        appointmentTypes: [],
        user: {
          firstName: (req.session.userName || '').split(' ')[0] || 'User',
          name: req.session.userName,
          email: req.session.userEmail,
          role: req.session.userRole,
          unitNumber: req.session.unitNumber,
          avatarUrl: req.session.avatarUrl || ''
        }
      });
    }
  })();
});

// User Profile route
router.get('/users/profile', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/');
  }
  
  res.render('user-profile', { 
    title: 'My Profile',
    activePage: 'profile',
    user: {
      name: req.session.userName,
      email: req.session.userEmail,
      role: req.session.userRole,
      unitNumber: req.session.unitNumber
    }
  });
});

// Maintenance Requests route
router.get('/users/maintenance', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/');
  }
  
  res.render('maintenance', { 
    title: 'Maintenance Requests',
    activePage: 'maintenance',
    user: {
      name: req.session.userName,
      email: req.session.userEmail,
      role: req.session.userRole,
      unitNumber: req.session.unitNumber
    }
  });
});

// Announcements route - show ONLY active, non-expired announcements to users
router.get('/users/announcements', async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/');
  }

  try {
    const now = new Date();
    // Show announcements that are active and not expired (or with no expiry)
    const announcements = await Announcement.find({
      isActive: true,
      $or: [
        { expiryDate: { $exists: false } },
        { expiryDate: null },
        { expiryDate: { $gte: now } }
      ]
    })
      .sort({ priority: -1, createdAt: -1 })
      .lean();

    res.render('user-announcements', {
      title: 'Community Announcements',
      activePage: 'announcements',
      announcements,
      user: {
        firstName: (req.session.userName || '').split(' ')[0] || 'User',
        name: req.session.userName,
        email: req.session.userEmail,
        role: req.session.userRole,
        unitNumber: req.session.unitNumber,
        avatarUrl: req.session.avatarUrl || ''
      }
    });
  } catch (error) {
    console.error('Error loading announcements for users:', error);
    // Render page without announcements on error
    res.render('user-announcements', {
      title: 'Community Announcements',
      activePage: 'announcements',
      announcements: [],
      user: {
        firstName: (req.session.userName || '').split(' ')[0] || 'User',
        name: req.session.userName,
        email: req.session.userEmail,
        role: req.session.userRole,
        unitNumber: req.session.unitNumber,
        avatarUrl: req.session.avatarUrl || ''
      }
    });
  }
});

// User Schedule route - show user's schedule requests and scheduled appointments
router.get('/users/schedule', async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/');
  }

  try {
    const userId = req.session.userId;

    // Fetch the user's schedule requests and their appointments
    const [requests, appointments] = await Promise.all([
      ScheduleRequest.find({ requester: userId }).sort({ createdAt: -1 }).lean(),
      Appointment.find({ patientId: userId }).sort({ appointmentDate: 1 }).lean()
    ]);

    // Convert reschedule appointments to reschedule requests for display
    const rescheduleAppointments = appointments.filter(apt => apt.status === 'reschedule');
    const rescheduleRequests = rescheduleAppointments.map(apt => ({
      _id: apt._id,
      title: `${apt.appointmentType} Appointment`,
      start: `${apt.appointmentDate}T${apt.appointmentTime}`,
      end: null,
      appointmentType: apt.appointmentType,
      status: 'reschedule_requested',
      rescheduleReason: apt.declineReason || 'Appointment needs to be rescheduled',
      rescheduleNotes: apt.recommendation || '',
      requester: userId,
      createdAt: apt.createdAt,
      updatedAt: apt.updatedAt
    }));

    // Combine regular requests with reschedule requests
    const allRequests = [...requests, ...rescheduleRequests];
    const appointmentTypes = [];


    res.render('user-schedule', {
      title: 'My Schedule',
      activePage: 'schedule',
      requests: allRequests,
      appointments,
      appointmentTypes,
      user: {
        firstName: (req.session.userName || '').split(' ')[0] || 'User',
        name: req.session.userName,
        email: req.session.userEmail,
        role: req.session.userRole,
        unitNumber: req.session.unitNumber,
        avatarUrl: req.session.avatarUrl || ''
      }
    });
  } catch (error) {
    console.error('Error loading user schedule:', error);
    res.render('user-schedule', {
      title: 'My Schedule',
      activePage: 'schedule',
      requests: [],
      appointments: [],
      appointmentTypes: [],
      user: {
        firstName: (req.session.userName || '').split(' ')[0] || 'User',
        name: req.session.userName,
        email: req.session.userEmail,
        role: req.session.userRole,
        unitNumber: req.session.unitNumber,
        avatarUrl: req.session.avatarUrl || ''
      }
    });
  }
});

// Resident update request (from user-facing form)
router.post('/users/residents/request-update', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, unitNumber } = req.body;
    const createdBy = req.session.userId || null;

    const reqDoc = new ResidentRequest({ firstName, lastName, email, phone, unitNumber, createdBy });
    await reqDoc.save();

    res.redirect('/users/profile');
  } catch (error) {
    console.error('Resident request error:', error);
    res.status(500).send('Failed to submit request');
  }
});


// Schedule request
router.post('/users/schedule/request', async (req, res) => {
  try {
    const { title, start, end, appointmentType } = req.body;
    const requester = req.session.userId || null;

    const reqDoc = new ScheduleRequest({ title, start, end, appointmentType, requester });
    await reqDoc.save();

    res.redirect('/users/schedule');
  } catch (error) {
    console.error('Schedule request error:', error);
    res.status(500).send('Failed to submit schedule request');
  }
});

// Reschedule request - when resident provides new dates after admin requests reschedule
router.post('/users/schedule/reschedule', async (req, res) => {
  try {
    const { requestId, newStart, newEnd, comments } = req.body;
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    // First try to find as schedule request
    let reqDoc = await ScheduleRequest.findById(requestId);
    let isAppointment = false;

    // If not found as schedule request, try as appointment
    if (!reqDoc) {
      const Appointment = require('../models/appointment');
      reqDoc = await Appointment.findById(requestId);
      isAppointment = true;
    }

    if (!reqDoc) {
      return res.status(404).json({ success: false, error: 'Request not found' });
    }

    // Verify the request belongs to the current user
    if (reqDoc.requester && reqDoc.requester.toString() !== userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }
    if (reqDoc.patientId && reqDoc.patientId.toString() !== userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    if (isAppointment) {
      // Handle appointment reschedule
      if (reqDoc.status !== 'reschedule') {
        return res.status(400).json({ success: false, error: 'Appointment is not eligible for rescheduling' });
      }

      // Create a new schedule request for the rescheduled appointment
      const ScheduleRequest = require('../models/scheduleRequest');
      const newScheduleRequest = new ScheduleRequest({
        title: `${reqDoc.appointmentType} Appointment (Rescheduled)`,
        start: newStart,
        end: newEnd,
        appointmentType: reqDoc.appointmentType,
        requester: userId,
        status: 'reschedule_requested',
        rescheduleReason: reqDoc.declineReason || 'Appointment reschedule request',
        rescheduleNotes: (reqDoc.recommendation || '') + (comments ? '\n\nResident Comments: ' + comments : ''),
        rescheduleRequestedAt: new Date(),
        rescheduleStatus: 'pending'
      });

      await newScheduleRequest.save();

      // Update original appointment status
      reqDoc.status = 'cancelled';
      reqDoc.declineReason = 'Rescheduled by patient';
      await reqDoc.save();

      console.log(`New reschedule request created for appointment ${requestId} by user ${userId}`);
    } else {
      // Handle schedule request reschedule
      if (reqDoc.status !== 'reschedule_requested') {
        return res.status(400).json({ success: false, error: 'Request is not eligible for rescheduling' });
      }

      // Update the request with new dates
      reqDoc.newStart = newStart;
      reqDoc.newEnd = newEnd;
      reqDoc.rescheduleStatus = 'pending';
      reqDoc.rescheduleRequestedAt = new Date();
      
      // Add comments if provided
      if (comments) {
        reqDoc.rescheduleNotes = (reqDoc.rescheduleNotes || '') + '\n\nResident Comments: ' + comments;
      }

      await reqDoc.save();
      console.log(`Reschedule request updated by user ${userId} for request ${requestId}`);
    }

    res.json({ success: true, message: 'Reschedule request submitted successfully' });
  } catch (error) {
    console.error('Reschedule request error:', error);
    res.status(500).json({ success: false, error: 'Failed to submit reschedule request' });
  }
});

// Get notification count for user
router.get('/users/notifications/count', async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.json({ count: 0 });
    }

    const Notification = require('../models/notification');
    const count = await Notification.countDocuments({ 
      userId: userId, 
      isRead: false 
    });

    res.json({ count });
  } catch (error) {
    console.error('Error fetching notification count:', error);
    res.json({ count: 0 });
  }
});

// Get notifications for user
router.get('/users/notifications', async (req, res) => {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const Notification = require('../models/notification');
    const notifications = await Notification.find({ userId: userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({ notifications });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark notification as read
router.post('/users/notifications/:id/read', async (req, res) => {
  try {
    const userId = req.session.userId;
    const notificationId = req.params.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const Notification = require('../models/notification');
    const notification = await Notification.findOne({ 
      _id: notificationId, 
      userId: userId 
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    await notification.markAsRead();
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});


// Payment Portal route
router.get('/users/payments', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/');
  }
  
  res.render('payments', { 
    title: 'Payment Portal',
    activePage: 'payments',
    user: {
      name: req.session.userName,
      email: req.session.userEmail,
      role: req.session.userRole,
      unitNumber: req.session.unitNumber
    }
  });
});

// User Logout route
router.get('/users/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({
        success: false,
        message: 'Logout failed'
      });
    }
    res.redirect('/');
  });
});

// API Status endpoint
router.get('/api/status', async (req, res) => {
  try {
    // Check database connection by making a simple query
    const userCount = await User.countDocuments();
    
    res.json({
      connected: true,
      message: 'Database connected successfully',
      userCount: userCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Database status check failed:', error);
    res.json({
      connected: false,
      message: 'Database connection failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Health check endpoint
router.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

module.exports = router;
