const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Appointment = require('../models/appointment');
const Announcement = require('../models/announcements');
const ResidentRequest = require('../models/residentRequest');
const ScheduleRequest = require('../models/scheduleRequest');
const Inventory = require('../models/inventory');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { addClient, removeClient, broadcast } = require('../utils/realtime');
const LOG_FILE = path.join(__dirname, '../text.log');

// Image upload setup for announcements
const uploadsRoot = path.join(__dirname, '../public/uploads/announcements');
// Ensure uploads directory exists
try { fs.mkdirSync(uploadsRoot, { recursive: true }); } catch (e) {}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsRoot);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '.png';
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 50) || 'image';
    cb(null, `${Date.now()}-${base}${ext}`);
  }
});

function imageFileFilter(req, file, cb) {
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (allowed.includes(file.mimetype)) return cb(null, true);
  cb(new Error('Only image files are allowed'));
}

const upload = multer({ storage, fileFilter: imageFileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

function toPublicUrl(filePath) {
  // Convert absolute path under public to URL path
  const publicDir = path.join(__dirname, '../public');
  const rel = path.relative(publicDir, filePath).replace(/\\/g, '/');
  return `/${rel}`;
}

function removeAnnouncementImage(imageUrl) {
  if (!imageUrl) return;
  try {
    const publicDir = path.join(__dirname, '../public');
    const abs = path.join(publicDir, imageUrl.replace(/^\//, ''));
    fs.unlink(abs, () => {});
  } catch (e) {
    // ignore
  }
}

// Admin authentication middleware
const requireAdminAuth = (req, res, next) => {
  if (req.session && req.session.adminId) {
    // Admin is authenticated
    next();
  } else {
    // Admin is not authenticated
    res.redirect('/admin/login');
  }
};

// Admin login page
router.get('/login', (req, res) => {
  if (req.session && req.session.adminId) {
    return res.redirect('/admin/dashboard');
  }
  res.redirect('/#admin-login');
});

// Admin dashboard (protected)
router.get('/dashboard', requireAdminAuth, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const users = await User.find({}, { password: 0 })
                          .sort({ createdAt: -1 })
                          .limit(10);

    // Get schedule stats for dashboard
    const totalAppointments = await Appointment.countDocuments();
    const pendingAppointments = await Appointment.countDocuments({ status: 'pending' });
    const today = new Date().toISOString().split('T')[0];
    const todayAppointments = await Appointment.countDocuments({
      appointmentDate: today,
      status: 'scheduled'
    });

    // Count pending resident requests
    const pendingResidentRequests = await ResidentRequest.countDocuments({ status: 'pending' });
      // Count active announcements
      const activeAnnouncements = await Announcement.countDocuments({ isActive: true });

    res.render('admin-dashboard', {
      title: 'Admin Dashboard',
      username: req.session.username,
      admin: req.session.admin,
      users: users,
      totalUsers: totalUsers,
      activeUsers: activeUsers,
      pendingResidentRequests,
        activeAnnouncements,
      scheduleStats: {
        totalAppointments,
        todayAppointments,
        pendingAppointments
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.redirect('/admin/login');
  }
});

// Admin logout endpoint (JSON)
router.post('/logout', (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ success: false, message: 'Logout failed' });
      }
      res.json({ success: true, message: 'Logged out successfully' });
    });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Logout failed' });
  }
});

// Optional: GET fallback to support direct navigation
router.get('/logout', (req, res) => {
  try {
    req.session.destroy(() => {
      res.redirect('/');
    });
  } catch (e) {
    res.redirect('/');
  }
});

// Admin residents management page
router.get('/residents', requireAdminAuth, async (req, res) => {
  try {
    const [residents, requests] = await Promise.all([
      User.find({ role: 'resident' }, { password: 0 }).sort({ createdAt: -1 }),
      ResidentRequest.find({ status: 'pending' }).sort({ createdAt: -1 })
    ]);

    res.render('admin-residents', {
      title: 'Manage Residents',
      username: req.session.username || 'Admin',
      admin: req.session.admin || { role: 'admin' },
      residents,
      requests
    });
  } catch (error) {
    console.error('Residents page error:', error);
    res.redirect('/admin/login');
  }
});

// Toggle user active/inactive status (used by admin UI)
router.post('/users/:id/toggle-status', requireAdminAuth, async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const wasActive = user.isActive;
    user.isActive = !user.isActive;
    await user.save();

    // If deactivating, broadcast logout event to force user logout
    if (wasActive && !user.isActive) {
      broadcast('userStatus', { userId: String(user._id), isActive: false, lastLogin: user.lastLogin || null });
      broadcast('forceLogout', { userId: String(user._id), reason: 'Account deactivated by admin' });
    }

    // If activating now (approved/accepted), send welcome email (respects Enable emails setting)
    if (!wasActive && user.isActive) {
      try {
        const { sendNotificationEmail } = require('../utils/emailService');
        const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Resident';
        const title = 'Welcome to our Barangay';
        const message = 'Your account has been approved and activated. You can now log in and access the portal.';
        // Fire-and-forget; internal function respects the global emailNotifications toggle
        sendNotificationEmail(user.email, fullName, title, message, 'success')
          .catch(err => console.error('Failed to send activation welcome email:', err.message));
      } catch (mailErr) {
        console.error('Error queuing activation welcome email:', mailErr);
      }
    }

    res.json({
      success: true,
      message: user.isActive ? 'User activated' : 'User deactivated',
      isActive: user.isActive
    });
  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update user status' });
  }
});

// Admin schedule management page - UPDATED WITH ENHANCED DATA
router.get('/schedule', requireAdminAuth, async (req, res) => {
  try {
    // Get appointments, available admins (as doctors), and active appointment types
    const [appointments, doctors, requests] = await Promise.all([
      Appointment.find()
        .populate('patientId', 'firstName lastName email phone unitNumber')
        .populate('doctorId', 'firstName lastName email')
        .sort({ appointmentDate: 1, appointmentTime: 1 }),
      User.find({
        role: 'admin',
        isActive: true
      }, 'firstName lastName email'),
      ScheduleRequest.find({ 
        $or: [
          { status: 'pending' },
          { status: 'reschedule_requested' }
        ]
      })
        .sort({ createdAt: -1 })
        .populate('requester', 'firstName lastName email phone unitNumber')
    ]);

  // Define appointment types
  const appointmentTypes = ['BMI', 'BP', 'Consultation', 'Check up', 'Immunization'];

    res.render('admin-schedule', {
      title: 'Schedule Management',
      username: req.session.username,
      admin: req.session.admin,
      appointments: appointments || [],
      doctors: doctors || [],
      requests: requests || [],
      appointmentTypes: appointmentTypes || []
    });
  } catch (error) {
    console.error('Schedule page error:', error);
    res.redirect('/admin/login');
  }
});

// Admin analytics page
router.get('/analytics', requireAdminAuth, async (req, res) => {
  try {
    // Gather simple statistics used by the analytics view
    const [
      totalUsers,
      activeUsers,
      totalAppointments,
      pendingRequests,
      appointments,
      completedAppointments
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ isActive: true }),
      Appointment.countDocuments(),
      ScheduleRequest.countDocuments({ status: 'pending' }),
      Appointment.find({}),
      Appointment.countDocuments({ status: 'completed' })
    ]);

    const pendingAppointments = appointments.filter(a => a.status === 'pending').length;

    const statistics = {
      totalUsers,
      activeUsers,
      totalAppointments,
      pending: pendingAppointments + (pendingRequests || 0),
      completed: completedAppointments
    };

    res.render('admin-analytics', {
      title: 'Analytics',
      username: req.session.username,
      admin: req.session.admin,
      statistics
    });
  } catch (error) {
    console.error('Analytics page error:', error);
    res.redirect('/admin/login');
  }
});

// Admin settings page
router.get('/settings', requireAdminAuth, async (req, res) => {
  try {
    const settingsSvc = require('../utils/settings');
    const settings = settingsSvc.getAll();

    res.render('admin-settings', {
      title: 'System Settings',
      username: req.session.username || 'Admin',
      admin: req.session.admin || { role: 'admin' },
      settings
    });
  } catch (error) {
    console.error('Settings page error:', error);
    res.redirect('/admin/login');
  }
});

// API endpoint for filtered analytics data
router.get('/api/analytics/filter', requireAdminAuth, async (req, res) => {
  try {
    const { period, mode, date, month, year, start, end } = req.query;
    
    // Philippines timezone (Asia/Manila, UTC+8, no DST)
    const TZ_NAME = 'Asia/Manila';
    const TZ_OFFSET_HOURS = 8; // constant for Manila

    function startOfDayInTzUTC(date) {
      const shifted = new Date(date.getTime() + TZ_OFFSET_HOURS * 3600000);
      shifted.setUTCHours(0, 0, 0, 0);
      return new Date(shifted.getTime() - TZ_OFFSET_HOURS * 3600000);
    }
    function endOfDayInTzUTC(date) {
      const shifted = new Date(date.getTime() + TZ_OFFSET_HOURS * 3600000);
      shifted.setUTCHours(23, 59, 59, 999);
      return new Date(shifted.getTime() - TZ_OFFSET_HOURS * 3600000);
    }
    function monthRangeInTzUTC(year, month /* 0-11 */) {
      const approx = new Date(Date.UTC(year, month, 1));
      const start = startOfDayInTzUTC(approx);
      // end: last day of month at 23:59:59.999 in Manila
      const approxEnd = new Date(Date.UTC(year, month + 1, 0));
      const end = endOfDayInTzUTC(approxEnd);
      return { start, end };
    }

    // Calculate date ranges based on either explicit mode or legacy period (aligned to Asia/Manila)
    const now = new Date();
    let startDate, endDate;

    function parseYYYYMM(v) {
      // expects YYYY-MM
      const m = /^([0-9]{4})-([0-9]{2})$/.exec(String(v||''));
      if (!m) return null;
      const y = parseInt(m[1],10);
      const mm = parseInt(m[2],10) - 1; // 0-based
      if (isNaN(y) || isNaN(mm) || mm < 0 || mm > 11) return null;
      return { y, mm };
    }

    function parseYYYYMMDD(v) {
      // expects YYYY-MM-DD
      const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(String(v||''));
      if (!m) return null;
      const y = parseInt(m[1],10);
      const mm = parseInt(m[2],10) - 1;
      const dd = parseInt(m[3],10);
      if (isNaN(y) || isNaN(mm) || isNaN(dd)) return null;
      const dt = new Date(Date.UTC(y, mm, dd));
      return isNaN(dt) ? null : dt;
    }

    if (mode) {
      switch(String(mode)) {
        case 'today': {
          startDate = startOfDayInTzUTC(now);
          endDate = endOfDayInTzUTC(now);
          break;
        }
        case 'date': {
          const d = parseYYYYMMDD(date);
          if (!d) return res.status(400).json({ error: 'Invalid date parameter' });
          startDate = startOfDayInTzUTC(d);
          endDate = endOfDayInTzUTC(d);
          break;
        }
        case 'month': {
          const pm = parseYYYYMM(month);
          if (!pm) return res.status(400).json({ error: 'Invalid month parameter' });
          const rng = monthRangeInTzUTC(pm.y, pm.mm);
          startDate = rng.start; endDate = rng.end; break;
        }
        case 'year': {
          const y = parseInt(year, 10);
          if (isNaN(y) || y < 1970 || y > 2100) return res.status(400).json({ error: 'Invalid year parameter' });
          startDate = monthRangeInTzUTC(y, 0).start;
          endDate = monthRangeInTzUTC(y, 11).end;
          break;
        }
        case 'range': {
          if (!start || !end) return res.status(400).json({ error: 'Missing start or end for range mode' });
          const s = new Date(start);
          const e = new Date(end);
          if (isNaN(s) || isNaN(e)) return res.status(400).json({ error: 'Invalid start or end datetime' });
          // Assume provided datetimes are in local time; we use as-is in UTC space
          startDate = s;
          endDate = e;
          break;
        }
        case 'this-month': {
          const { start: s, end: e } = monthRangeInTzUTC(now.getFullYear(), now.getMonth());
          startDate = s; endDate = e; break;
        }
        case 'this-year': {
          startDate = monthRangeInTzUTC(now.getFullYear(), 0).start;
          endDate = monthRangeInTzUTC(now.getFullYear(), 11).end;
          break;
        }
        default: {
          const { start: s, end: e } = monthRangeInTzUTC(now.getFullYear(), now.getMonth());
          startDate = s; endDate = e; break;
        }
      }
    } else {
      // Backward compatibility with existing 'period'
      switch(period) {
        case 'month': {
          const { start, end } = monthRangeInTzUTC(now.getFullYear(), now.getMonth());
          startDate = start; endDate = end; break;
        }
        case 'today': {
          startDate = startOfDayInTzUTC(now);
          endDate = endOfDayInTzUTC(now);
          break;
        }
        case 'last-month': {
          const lastMonth = now.getMonth() - 1;
          const yearV = lastMonth < 0 ? now.getFullYear() - 1 : now.getFullYear();
          const monthV = (lastMonth + 12) % 12;
          const { start, end } = monthRangeInTzUTC(yearV, monthV);
          startDate = start; endDate = end; break;
        }
        case 'year': {
          const start = monthRangeInTzUTC(now.getFullYear(), 0).start;
          const end = monthRangeInTzUTC(now.getFullYear(), 11).end;
          startDate = start; endDate = end; break;
        }
        default: {
          const { start, end } = monthRangeInTzUTC(now.getFullYear(), now.getMonth());
          startDate = start; endDate = end; break;
        }
      }
    }

    // Get filtered data based on date range
    const [
      totalUsers,
      activeUsers,
      appointments,
      scheduleRequests,
      users,
      inventoryItems,
      pendingScheduleApprovalsGlobal,
      pendingResidentRequestsGlobal
    ] = await Promise.all([
      User.countDocuments({ createdAt: { $gte: startDate, $lte: endDate } }),
      User.countDocuments({ isActive: true, createdAt: { $gte: startDate, $lte: endDate } }),
      (async () => {
        const startStr = new Date(startDate.getTime() + 0).toISOString().slice(0,10);
        const endStr = new Date(endDate.getTime() + 0).toISOString().slice(0,10);
        return Appointment.find({
          $or: [
            { createdAt: { $gte: startDate, $lte: endDate } },
            { appointmentDate: { $gte: startStr, $lte: endStr } }
          ]
        });
      })(),
      ScheduleRequest.find({ createdAt: { $gte: startDate, $lte: endDate } }),
      User.find({ createdAt: { $gte: startDate, $lte: endDate } }).sort({ createdAt: 1 }),
      Inventory.find({ isActive: true }),
      // Global counts for pending approvals to mirror Admin Schedule, not constrained by date
      ScheduleRequest.countDocuments({ status: 'pending' }),
      ResidentRequest.countDocuments({ status: 'pending' })
    ]);

    // Calculate statistics
    const pendingAppointments = appointments.filter(a => a.status === 'pending').length;
    const completedAppointments = appointments.filter(a => a.status === 'completed').length;
    const scheduledAppointments = appointments.filter(a => a.status === 'scheduled').length;
  const pendingRequests = scheduleRequests.filter(r => r.status === 'pending').length;
  const pendingApprovalsGlobal = (pendingScheduleApprovalsGlobal || 0) + (pendingResidentRequestsGlobal || 0);

    // Generate trend data for charts
  const appointmentsTrend = generateTrendData(appointments, startDate, endDate, period);
    const usersTrend = generateTrendData(users, startDate, endDate, period);

    // Build daily buckets helper
    function dateKey(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
    function daysBetween(a, b) {
      const ms = dateKey(b) - dateKey(a);
      return Math.max(0, Math.floor(ms / (24*60*60*1000)) + 1); // inclusive days
    }

    async function buildDailyBucketsFromAggregation(model, matchField, matchRangeStart, matchRangeEnd) {
      // Aggregate by day for the given date field
      const pipeline = [
        { $match: { [matchField]: { $gte: matchRangeStart, $lte: matchRangeEnd } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: `$${matchField}`, timezone: TZ_NAME } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ];
      const rows = await model.aggregate(pipeline);
      const byDay = new Map(rows.map(r => [r._id, r.count]));
      const totalDays = daysBetween(matchRangeStart, matchRangeEnd);
      const buckets = [];
      for (let i = 0; i < totalDays; i++) {
        const d = new Date(matchRangeStart.getFullYear(), matchRangeStart.getMonth(), matchRangeStart.getDate() + i);
        const key = d.toISOString().slice(0,10);
        buckets.push(byDay.get(key) || 0);
      }
      return buckets;
    }

    // Historical buckets for expired requests (by expiredAt) and inventory expirations (by expirationDate)
    const [reqExpireBuckets, invExpireBuckets] = await Promise.all([
      buildDailyBucketsFromAggregation(ScheduleRequest, 'expiredAt', startDate, endDate),
      buildDailyBucketsFromAggregation(Inventory, 'expirationDate', startDate, endDate)
    ]);

    // Build daily buckets for schedule requests due to expire (expected expiry = createdAt + expiryDays)
    const settingsSvc = require('../utils/settings');
    const expiryDays = settingsSvc.get('scheduleExpiryDays', 3);
    const dueRows = await ScheduleRequest.aggregate([
      { $match: { status: 'pending' } },
      { $addFields: { expectedDate: { $dateAdd: { startDate: '$createdAt', unit: 'day', amount: expiryDays } } } },
      { $match: { expectedDate: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$expectedDate', timezone: TZ_NAME } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    const dueByDay = new Map(dueRows.map(r => [r._id, r.count]));
    const totalDays = (function daysBetween(a,b){
      const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
      const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
      return Math.max(0, Math.floor((db - da) / (24*60*60*1000)) + 1);
    })(startDate, endDate);
    const reqDueBuckets = [];
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
      const key = d.toISOString().slice(0,10);
      reqDueBuckets.push(dueByDay.get(key) || 0);
    }

    // Build PH-local date labels for the range
    const dateLabels = [];
    {
      const fmt = new Intl.DateTimeFormat('en-PH', { timeZone: TZ_NAME, month: 'short', day: '2-digit' });
      for (let i = 0; i < totalDays; i++) {
        const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
        dateLabels.push(fmt.format(d));
      }
    }

    // Appointments by type trend (using createdAt as proxy)
  // Only use scheduled and completed appointments for type trend (matches Admin Schedule expectations)
  const apptsForTypeTrend = appointments.filter(a => a && (a.status === 'scheduled' || a.status === 'completed'));
  const knownTypes = ['BMI', 'BP', 'Consultation', 'Check up', 'Immunization'];
  const typeSet = new Set(apptsForTypeTrend.map(a => a.appointmentType).filter(Boolean));
    knownTypes.forEach(t => typeSet.add(t));
    const types = Array.from(typeSet.values());

    function generateTrendDataUsingField(items, startDate, endDate, period, dateFieldGetter) {
      // Map items to a compatible structure with createdAt = desired date
      const mapped = items
        .map(it => {
          const d = dateFieldGetter(it);
          if (!d || isNaN(d.getTime())) return null;
          return { createdAt: d };
        })
        .filter(Boolean);
      return generateTrendData(mapped, startDate, endDate, period);
    }

    const appointmentsByTypeTrend = {
      labels: (function() {
        // Construct generic labels consistent with generateTrendData intervals
        if (period === 'year') {
          return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        }
        const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
        const intervals = Math.min(12, days);
        return Array.from({ length: intervals }, (_, i) => `P${i+1}`);
      })(),
      series: types.map(t => ({
        label: t,
        // Use appointmentDate for trend timeline to reflect when the appointments occur
        data: generateTrendDataUsingField(
          apptsForTypeTrend.filter(a => a.appointmentType === t && a.appointmentDate),
          startDate,
          endDate,
          period,
          (a) => new Date(a.appointmentDate)
        )
      }))
    };

    // Funnel and timing metrics
    const requestedCount = scheduleRequests.length;
    const approvedCount = scheduleRequests.filter(r => r.status === 'approved' || r.approvedAt).length;
    const scheduledCount = appointments.filter(a => a.status === 'scheduled').length;
    const completedCount = appointments.filter(a => a.status === 'completed').length;

    const averageApprovalHours = (function(){
      const approved = scheduleRequests.filter(r => r.approvedAt && r.createdAt);
      if (!approved.length) return 0;
      const sum = approved.reduce((acc, r) => acc + (r.approvedAt - r.createdAt), 0);
      return Math.max(0, Math.round(sum / approved.length / 3600000));
    })();

    const averageWaitDays = (function(){
      const items = appointments.filter(a => a.appointmentDate && a.createdAt);
      if (!items.length) return 0;
      const sum = items.reduce((acc, a) => {
        const d = new Date(a.appointmentDate);
        if (isNaN(d)) return acc;
        return acc + Math.max(0, (d - a.createdAt));
      }, 0);
      return Math.max(0, Math.round(sum / items.length / 86400000));
    })();

    // Outcomes
    const outcomeCompleted = completedAppointments;
    const outcomeNoShow = appointments.filter(a => a.status === 'no-show').length;
    const outcomeCancelled = appointments.filter(a => a.status === 'cancelled').length;
    const outcomeReschedule = scheduleRequests.filter(r => r.status === 'reschedule_requested').length;

    // Average visits per resident (completed per unique patient)
    const completedApts = appointments.filter(a => a.status === 'completed');
    const uniquePatients = new Set(completedApts.map(a => String(a.patientId))).size || 1;
    const avgVisitsPerResident = +(completedApts.length / uniquePatients).toFixed(2);
    const avgVisitsPerResidentTrend = (function(){
      const trend = generateTrendData(completedApts, startDate, endDate, period);
      return trend.map(v => uniquePatients ? +(v / uniquePatients).toFixed(2) : 0);
    })();

    // Inventory analytics
    const categories = ['medication', 'medical-supplies', 'fluids', 'equipment', 'other'];
  const inventoryByCategory = categories.map(cat => inventoryItems.filter(i => i.category === cat).length);

    function calcDOS(item) {
      // Heuristic: avgDailyUse ~ max(1, reorderPoint / 14)
      const avgDaily = Math.max(1, Math.round((item.reorderPoint || 0) / 14)) || 1;
      return Math.round((item.currentStock || 0) / avgDaily);
    }
    const dosByCategory = categories.map(cat => {
      const items = inventoryItems.filter(i => i.category === cat);
      if (!items.length) return 0;
      const sum = items.reduce((acc, it) => acc + calcDOS(it), 0);
      return Math.round(sum / items.length);
    });

    // Recalculate stock risk on the fly to avoid stale status and ensure mutual exclusivity
    let stockRiskCounts = { low: 0, critical: 0, out: 0, expired: 0 };
    (function normalizeInventoryStatus(items){
      const now = new Date();
      let low = 0, critical = 0, out = 0, expired = 0;
      for (const it of items) {
        const isExpired = it.expirationDate ? (new Date(it.expirationDate) < now) : false;
        if (isExpired) { expired++; continue; }
        const cs = Number(it.currentStock || 0);
        const rp = Number(it.reorderPoint || 0);
        if (cs <= 0) { out++; continue; }
        if (rp > 0) {
          if (cs <= rp * 0.5) { critical++; continue; }
          if (cs <= rp) { low++; continue; }
        } else {
          // Fallback thresholds when reorderPoint is not set
          if (cs <= 2) { critical++; continue; }
          if (cs <= 5) { low++; continue; }
        }
        // in-stock: not counted in risk chart
      }
      stockRiskCounts = { low, critical, out, expired };
    })(inventoryItems);

    // Average handling time per request (approved within period) by day
    const approvedReqs = scheduleRequests.filter(r => r.approvedAt && r.createdAt);
    const handlingByDay = new Map();
    approvedReqs.forEach(r => {
      const day = new Date(r.approvedAt);
      const key = day.toISOString().slice(0,10);
      const hrs = (r.approvedAt - r.createdAt) / 3600000;
      const val = handlingByDay.get(key) || { sum: 0, n: 0 };
      val.sum += hrs; val.n += 1; handlingByDay.set(key, val);
    });
    const handlingTrend = [];
    {
      const totalDays = Math.ceil((endDate - startDate) / 86400000);
      for (let i = 0; i < totalDays; i++) {
        const d = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
        const key = d.toISOString().slice(0,10);
        const rec = handlingByDay.get(key);
        handlingTrend.push(rec ? Math.round(rec.sum / rec.n) : 0);
      }
    }

    const analytics = {
      statistics: {
        totalUsers: totalUsers,
        activeUsers: activeUsers,
        totalAppointments: appointments.length,
        // Show pending approvals (global) + pending appointments to match Admin Schedule expectations
        pending: pendingAppointments + pendingRequests + pendingApprovalsGlobal,
        completed: completedAppointments
      },
      chartData: {
        // Pending slice includes pending approvals (schedule + resident) globally so it's visible even if created earlier
        appointmentsStatus: [pendingAppointments + pendingRequests + pendingApprovalsGlobal, scheduledAppointments, completedAppointments],
        activeUsers: [activeUsers, totalUsers - activeUsers],
        appointmentsTrend: appointmentsTrend,
        usersTrend: usersTrend,
        scheduleRequestsExpiring: { labels: dateLabels, buckets: reqExpireBuckets },
        scheduleRequestsDue: { labels: dateLabels, buckets: reqDueBuckets },
        inventoryItemsExpiring: { labels: dateLabels, buckets: invExpireBuckets },
        appointmentsByTypeTrend,
        funnel: {
          labels: ['Requested','Approved','Scheduled','Completed'],
          data: [requestedCount, approvedCount, scheduledCount, completedCount],
          avgApprovalHours: averageApprovalHours,
          avgWaitDays: averageWaitDays
        },
        outcomes: {
          labels: ['Completed','No-show','Cancelled','Reschedule Requested'],
          data: [outcomeCompleted, outcomeNoShow, outcomeCancelled, outcomeReschedule]
        },
        avgVisitsPerResident: {
          value: avgVisitsPerResident,
          trend: avgVisitsPerResidentTrend
        },
        inventory: {
          categories,
          byCategory: inventoryByCategory,
          dosByCategory,
          stockRiskCounts
        },
        handlingTime: {
          trend: handlingTrend
        }
      }
    };

    res.json(analytics);
  } catch (error) {
    console.error('Analytics filter error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
});

// Current online users count (approximation based on recent login)
router.get('/api/analytics/users-online-now', requireAdminAuth, async (req, res) => {
  try {
    const windowMinutes = 10; // match UI online window
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);

    const count = await User.countDocuments({
      isActive: true,
      lastLogin: { $gte: since },
      $expr: {
        // lastLogout < lastLogin (or null) implies currently logged-in session
        $lt: [ { $ifNull: [ '$lastLogout', new Date(0) ] }, '$lastLogin' ]
      }
    });

    res.json({ count, windowMinutes });
  } catch (error) {
    console.error('users-online-now error:', error);
    res.status(500).json({ error: 'Failed to fetch online users count' });
  }
});

// API endpoint for updating system settings
router.post('/api/settings/update', requireAdminAuth, async (req, res) => {
  try {
    const { settingType, scheduleExpiry, emailNotifications, userRegistration, siteTagline, siteDescription, language } = req.body;
    
    if (settingType === 'system-config') {
      const settingsSvc = require('../utils/settings');
      const messages = [];

      // Update schedule expiry if provided
      if (scheduleExpiry !== undefined && scheduleExpiry !== null && scheduleExpiry !== '') {
      // Store the setting in the database or config file
      // For now, we'll simulate saving to a settings collection
      // You might want to create a Settings model for this
      
      // Validate the expiry value
        const expiryDays = parseInt(scheduleExpiry);
        if (isNaN(expiryDays) || expiryDays < 1 || expiryDays > 30) {
          return res.status(400).json({ 
            success: false, 
            error: 'Schedule expiry must be between 1 and 30 days' 
          });
        }

        // Update job and persist
        const scheduleExpiryJob = require('../jobs/scheduleExpiry');
        scheduleExpiryJob.updateExpiryDuration(expiryDays);
        settingsSvc.set('scheduleExpiryDays', expiryDays);
        messages.push(`Schedule request expiry updated to ${expiryDays} days successfully!`);
      }

      // Update email notifications toggle if provided
      if (typeof emailNotifications !== 'undefined') {
        // emailNotifications may be a string from form submission
        const enabled = (typeof emailNotifications === 'boolean')
          ? emailNotifications
          : ['true','1','yes','on','enabled'].includes(String(emailNotifications).toLowerCase());
        settingsSvc.set('emailNotifications', enabled);
        messages.push(`Email notifications ${enabled ? 'enabled' : 'disabled'}.`);
      }

      // Update user registration toggle if provided
      if (typeof userRegistration !== 'undefined') {
        const enabled = (typeof userRegistration === 'boolean')
          ? userRegistration
          : ['true','1','yes','on','enabled'].includes(String(userRegistration).toLowerCase());
        settingsSvc.set('allowUserRegistration', enabled);
        messages.push(`User registration ${enabled ? 'enabled' : 'disabled'}.`);
      }

      // Update site tagline if provided
      if (typeof siteTagline !== 'undefined') {
        const value = String(siteTagline).trim();
        settingsSvc.set('siteTagline', value);
        messages.push('Site tagline updated.');
      }

      // Update site description if provided
      if (typeof siteDescription !== 'undefined') {
        const value = String(siteDescription).trim();
        settingsSvc.set('siteDescription', value);
        messages.push('Site description updated.');
      }

      // Update default language if provided (restrict to English and Tagalog)
      if (typeof language !== 'undefined') {
        const langVal = String(language).toLowerCase();
        const allowed = ['en', 'fil', 'tl'];
        const normalized = allowed.includes(langVal) ? (langVal === 'tl' ? 'fil' : langVal) : 'en';
        settingsSvc.set('language', normalized);
        messages.push(`Default language set to ${normalized === 'en' ? 'English' : 'Tagalog'}.`);
      }

      if (messages.length === 0) {
        return res.status(400).json({ success: false, error: 'No valid settings provided' });
      }

      return res.json({ success: true, message: messages.join(' ') });
    } else {
      res.status(400).json({ 
        success: false, 
        error: 'Invalid setting type or missing data' 
      });
    }
  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update settings' 
    });
  }
});

// API endpoint to get schedule expiry statistics
router.get('/api/schedule/expiry-stats', requireAdminAuth, async (req, res) => {
  try {
    const scheduleExpiry = require('../jobs/scheduleExpiry');
    const stats = await scheduleExpiry.getExpiryStatistics();
    
    if (stats) {
      res.json({ success: true, stats });
    } else {
      res.status(500).json({ success: false, error: 'Failed to get expiry statistics' });
    }
  } catch (error) {
    console.error('Error getting expiry statistics:', error);
    res.status(500).json({ success: false, error: 'Failed to get expiry statistics' });
  }
});

// API endpoint to manually trigger expiry check
router.post('/api/schedule/expire-old', requireAdminAuth, async (req, res) => {
  try {
    const scheduleExpiry = require('../jobs/scheduleExpiry');
    const result = await scheduleExpiry.manualExpiryCheck();
    res.json(result);
  } catch (error) {
    console.error('Error in manual expiry check:', error);
    res.status(500).json({ success: false, error: 'Failed to expire old requests' });
  }
});

// Helper function to generate trend data based on period
function generateTrendData(data, startDate, endDate, period) {
  const trend = [];
  
  if (period === 'year') {
    // Monthly data for the year
    for (let month = 0; month < 12; month++) {
      const monthStart = new Date(startDate.getFullYear(), month, 1);
  const monthEnd = new Date(startDate.getFullYear(), month + 1, 0, 23, 59, 59, 999);
      
      const count = data.filter(item => {
        const itemDate = new Date(item.createdAt);
        return itemDate >= monthStart && itemDate <= monthEnd;
      }).length;
      
      trend.push(count);
    }
  } else {
    // Daily or weekly data for month/last-month
    const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    const intervals = Math.min(12, days); // Limit to 12 data points
    const intervalDays = Math.ceil(days / intervals);
    
    for (let i = 0; i < intervals; i++) {
      const intervalStart = new Date(startDate.getTime() + (i * intervalDays * 24 * 60 * 60 * 1000));
      const intervalEnd = new Date(intervalStart.getTime() + (intervalDays * 24 * 60 * 60 * 1000));
      
      const count = data.filter(item => {
        const itemDate = new Date(item.createdAt);
        return itemDate >= intervalStart && itemDate < intervalEnd;
      }).length;
      
      trend.push(count);
    }
  }
  
  return trend;
}

// ============================================================================
// SCHEDULE STATISTICS ROUTES - ADD THESE NEW ROUTES
// ============================================================================

// Get schedule statistics
router.get('/schedule/statistics', requireAdminAuth, async (req, res) => {
  try {
    // Get all appointments
    const appointments = await Appointment.find({});
    
    // Get pending schedule requests
    const pendingRequests = await ScheduleRequest.find({ status: 'pending' });
    
    // Calculate statistics
    const statistics = {
      total: appointments.length,
      pending: appointments.filter(apt => apt.status === 'pending').length + pendingRequests.length,
      completed: appointments.filter(apt => apt.status === 'completed').length,
      scheduled: appointments.filter(apt => apt.status === 'scheduled').length
    };
    
    res.json({
      success: true,
      statistics
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});

// Get appointment details
router.get('/schedule/appointments/:id', requireAdminAuth, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id)
      .populate('patientId', 'firstName lastName email phone unitNumber')
      .populate('doctorId', 'firstName lastName email');
    
    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }
    
    res.json({
      success: true,
      appointment
    });
  } catch (error) {
    console.error('Error fetching appointment details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch appointment details'
    });
  }
});

// Approve appointment
router.post('/schedule/appointments/:id/approve', requireAdminAuth, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    
    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }
    
    appointment.status = 'scheduled';
    await appointment.save();
    
    res.json({
      success: true,
      message: 'Appointment approved successfully'
    });
  } catch (error) {
    console.error('Error approving appointment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to approve appointment'
    });
  }
});

// Update appointment status
router.post('/schedule/appointments/:id/status', requireAdminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const appointment = await Appointment.findById(req.params.id);
    
    if (!appointment) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found'
      });
    }
    
    appointment.status = status;
    await appointment.save();
    
    res.json({
      success: true,
      message: `Appointment marked as ${status} successfully`
    });
  } catch (error) {
    console.error('Error updating appointment status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update appointment status'
    });
  }
});

// Filter appointments
router.get('/schedule/appointments', requireAdminAuth, async (req, res) => {
  try {
    const { status, type, date } = req.query;
    let filter = {};

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (type && type !== 'all') {
      filter.appointmentType = type;
    }

    if (date) {
      filter.appointmentDate = date;
    }

    const appointments = await Appointment.find(filter)
      .populate('patientId', 'firstName lastName email phone unitNumber')
      .populate('doctorId', 'firstName lastName email')
      .sort({ appointmentDate: 1, appointmentTime: 1 });

    res.json({
      success: true,
      appointments
    });
  } catch (error) {
    console.error('Error filtering appointments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to filter appointments'
    });
  }
});

// ----------------------------------------------------------------------------
// PATIENT INFORMATION ENDPOINTS (for Admin Schedule page)
// ----------------------------------------------------------------------------

// Get patients with summary (appointmentCount and lastAppointment)
router.get('/schedule/patients', requireAdminAuth, async (req, res) => {
  try {
    // Fetch residents (patients). Optionally, allow query limit/search in future.
    const residents = await User.find({ role: 'resident' }, 'firstName lastName email phone unitNumber isActive')
      .sort({ firstName: 1, lastName: 1 })
      .limit(500)
      .lean();

    if (!residents.length) {
      return res.json({ success: true, patients: [] });
    }

    const ids = residents.map(r => r._id);

    // Aggregate appointment stats per patient: count and last appointment details
    const stats = await Appointment.aggregate([
      { $match: { patientId: { $in: ids } } },
      // Sort so that $first in group is the latest appointment
      { $sort: { appointmentDate: -1, appointmentTime: -1, createdAt: -1 } },
      { $group: {
          _id: '$patientId',
          appointmentCount: { $sum: 1 },
          lastAppointmentId: { $first: '$_id' },
          lastAppointmentDate: { $first: '$appointmentDate' },
          lastAppointmentTime: { $first: '$appointmentTime' },
          lastAppointmentType: { $first: '$appointmentType' },
          lastAppointmentStatus: { $first: '$status' }
        }
      }
    ]);

    const statByPatient = new Map(stats.map(s => [String(s._id), s]));

    const patients = residents.map(r => {
      const s = statByPatient.get(String(r._id));
      const base = {
        _id: r._id,
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        phone: r.phone,
        unitNumber: r.unitNumber,
        isActive: r.isActive,
        appointmentCount: s ? s.appointmentCount : 0
      };
      if (s) {
        base.lastAppointment = {
          _id: s.lastAppointmentId,
          appointmentDate: s.lastAppointmentDate,
          appointmentTime: s.lastAppointmentTime,
          appointmentType: s.lastAppointmentType,
          status: s.lastAppointmentStatus
        };
      }
      return base;
    });

    res.json({ success: true, patients });
  } catch (error) {
    console.error('Error fetching patients summary:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch patients' });
  }
});

// Get a specific patient's appointments with basic patient info
router.get('/schedule/patients/:patientId/appointments', requireAdminAuth, async (req, res) => {
  try {
    const patientId = req.params.patientId;
    const patient = await User.findById(patientId, 'firstName lastName email phone unitNumber isActive');
    if (!patient) {
      return res.status(404).json({ success: false, error: 'Patient not found' });
    }

    const appointments = await Appointment.find({ patientId })
      .populate('doctorId', 'firstName lastName email')
      .sort({ appointmentDate: -1, appointmentTime: -1 });

    res.json({ success: true, patient, appointments });
  } catch (error) {
    console.error('Error fetching patient appointment history:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch patient appointments' });
  }
});

// Get all appointments for a specific patient
router.get('/schedule/patient/:patientId/appointments', requireAdminAuth, async (req, res) => {
  try {
    const patientId = req.params.patientId;
    const appointments = await Appointment.find({ patientId })
      .populate('doctorId', 'firstName lastName email')
      .sort({ appointmentDate: 1, appointmentTime: 1 });

    res.json({
      success: true,
      appointments
    });
  } catch (error) {
    console.error('Error fetching patient appointments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch patient appointments'
    });
  }
});

// ============================================================================
// EXISTING API ROUTES FOR SCHEDULE FUNCTIONALITY
// ============================================================================

// Get appointments with filtering
router.get('/api/appointments', requireAdminAuth, async (req, res) => {
  try {
    const { search, type, status, date } = req.query;
    
    let filter = {};
    
    if (search) {
      filter.$or = [
        { 'patientId.firstName': { $regex: search, $options: 'i' } },
        { 'patientId.lastName': { $regex: search, $options: 'i' } },
        { 'doctorId.firstName': { $regex: search, $options: 'i' } },
        { 'doctorId.lastName': { $regex: search, $options: 'i' } }
      ];
    }
    
    if (type && type !== 'all') {
      filter.appointmentType = type;
    }
    
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    if (date) {
      filter.appointmentDate = date;
    }

    const appointments = await Appointment.find(filter)
      .populate('patientId', 'firstName lastName email phone unitNumber')
      .populate('doctorId', 'firstName lastName email')
      .sort({ appointmentDate: 1, appointmentTime: 1 });

    res.json(appointments);
  } catch (error) {
    console.error('Get appointments error:', error);
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// Create new appointment
router.post('/api/appointments', requireAdminAuth, async (req, res) => {
  try {
    const {
      patientName,
      patientEmail,
      patientPhone,
      unitNumber,
      appointmentDate,
      appointmentTime,
      appointmentType,
      doctorId,
      notes
    } = req.body;

    // Validate required fields
    if (!patientName || !appointmentDate || !appointmentTime || !appointmentType || !doctorId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Note: AppointmentType model removed; accept provided appointmentType string
    if (!appointmentType || typeof appointmentType !== 'string') {
      return res.status(400).json({ error: 'Invalid appointment type' });
    }

    // Find or create patient
    let patient = await User.findOne({ email: patientEmail });
    if (!patient) {
      const nameParts = patientName.split(' ');
      patient = new User({
        firstName: nameParts[0],
        lastName: nameParts.slice(1).join(' ') || 'Unknown',
        email: patientEmail,
        phone: patientPhone,
        unitNumber: unitNumber || 'N/A',
        password: 'temporary123', // Will need to reset
        role: 'resident',
        isActive: true
      });
      await patient.save();
    }

    // Check for scheduling conflicts
    const existingAppointment = await Appointment.findOne({
      doctorId,
      appointmentDate,
      appointmentTime,
      status: { $in: ['scheduled', 'pending'] }
    });

    if (existingAppointment) {
      return res.status(400).json({ error: 'Time slot already booked for this doctor' });
    }

    const appointment = new Appointment({
      patientId: patient._id,
      doctorId,
      appointmentDate,
      appointmentTime,
      appointmentType: appointmentType,
      notes: notes || '',
      status: 'scheduled',
      createdBy: req.session.adminId
    });

    await appointment.save();

    // Return populated appointment
    const savedAppointment = await Appointment.findById(appointment._id)
      .populate('patientId', 'firstName lastName email phone unitNumber')
      .populate('doctorId', 'firstName lastName email');

    res.status(201).json(savedAppointment);
  } catch (error) {
    console.error('Create appointment error:', error);
    res.status(500).json({ error: 'Failed to create appointment' });
  }
});

// Update appointment status (approve/decline/complete/cancel)
router.patch('/api/appointments/:id/status', requireAdminAuth, async (req, res) => {
  try {
    const { status, declineReason, recommendation } = req.body;
    
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    appointment.status = status;
    
    if (status === 'cancelled' && declineReason) {
      appointment.declineReason = declineReason;
      appointment.recommendation = recommendation || '';
    }

    await appointment.save();

    const updatedAppointment = await Appointment.findById(appointment._id)
      .populate('patientId', 'firstName lastName email phone unitNumber')
      .populate('doctorId', 'firstName lastName email');

    res.json(updatedAppointment);
  } catch (error) {
    console.error('Update appointment status error:', error);
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

// Update appointment details
router.put('/api/appointments/:id', requireAdminAuth, async (req, res) => {
  try {
    const { appointmentDate, appointmentTime, appointmentType, doctorId, notes } = req.body;
    
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    // Update fields if provided
    if (appointmentDate) appointment.appointmentDate = appointmentDate;
    if (appointmentTime) appointment.appointmentTime = appointmentTime;
    if (appointmentType) appointment.appointmentType = appointmentType;
    if (doctorId) appointment.doctorId = doctorId;
    if (notes !== undefined) appointment.notes = notes;

    await appointment.save();

    const updatedAppointment = await Appointment.findById(appointment._id)
      .populate('patientId', 'firstName lastName email phone unitNumber')
      .populate('doctorId', 'firstName lastName email');

    res.json(updatedAppointment);
  } catch (error) {
    console.error('Update appointment error:', error);
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

// Delete appointment
router.delete('/api/appointments/:id', requireAdminAuth, async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    await Appointment.findByIdAndDelete(req.params.id);
    res.json({ message: 'Appointment deleted successfully' });
  } catch (error) {
    console.error('Delete appointment error:', error);
    res.status(500).json({ error: 'Failed to delete appointment' });
  }
});

// Get available doctors (admins)
router.get('/api/doctors', requireAdminAuth, async (req, res) => {
  try {
    const doctors = await User.find(
      { role: 'admin', isActive: true },
      'firstName lastName email'
    ).sort({ firstName: 1 });

    res.json(doctors);
  } catch (error) {
    console.error('Get doctors error:', error);
    res.status(500).json({ error: 'Failed to fetch doctors' });
  }
});

// Get residents (for real-time status refresh)
router.get('/api/residents', requireAdminAuth, async (req, res) => {
  try {
    const residents = await User.find({ role: 'resident' }, { password: 0 }).sort({ createdAt: -1 });
    res.json(residents);
  } catch (error) {
    console.error('Get residents error:', error);
    res.status(500).json({ error: 'Failed to fetch residents' });
  }
});

// Get calendar data for specific month
router.get('/api/calendar', requireAdminAuth, async (req, res) => {
  try {
    const { year, month } = req.query;
    
    if (!year || !month) {
      return res.status(400).json({ error: 'Year and month are required' });
    }

    // Calculate start and end dates for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const appointments = await Appointment.find({
      appointmentDate: {
        $gte: startDate.toISOString().split('T')[0],
        $lte: endDate.toISOString().split('T')[0]
      },
      status: { $in: ['scheduled', 'pending'] }
    })
    .populate('patientId', 'firstName lastName')
    .populate('doctorId', 'firstName lastName')
    .select('appointmentDate appointmentType patientId doctorId');

    // Format for calendar display
    const calendarData = appointments.map(appt => ({
      date: parseInt(appt.appointmentDate.split('-')[2]),
      title: `${appt.patientId.firstName} - ${appt.doctorId.firstName}`,
      type: appt.appointmentType
    }));

    res.json(calendarData);
  } catch (error) {
    console.error('Get calendar data error:', error);
    res.status(500).json({ error: 'Failed to fetch calendar data' });
  }
});

// Admin inventory management page
router.get('/inventory', requireAdminAuth, async (req, res) => {
  try {
    const now = new Date();
    const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const [items, recentItems, totalItems] = await Promise.all([
      Inventory.find({ isActive: true }).select('currentStock reorderPoint expirationDate status').lean(),
      Inventory.find({ isActive: true })
        .populate('createdBy', 'firstName lastName')
        .sort({ createdAt: -1 })
        .limit(10),
      Inventory.countDocuments({ isActive: true })
    ]);

    // Compute risk counts with fallback thresholds when reorderPoint is not set
    let low = 0, critical = 0, out = 0, expired = 0, expiring = 0;
    for (const it of items) {
      const cs = Number(it.currentStock || 0);
      const rp = Number(it.reorderPoint || 0);
      const exp = it.expirationDate ? new Date(it.expirationDate) : null;
      if (exp && exp < now) { expired++; }
      // Out of stock items should not be counted as expiring soon
      if (cs <= 0) { out++; continue; }
      if (exp && exp >= now && exp <= in30) { expiring++; }
      if (rp > 0) {
        if (cs <= rp * 0.5) { critical++; continue; }
        if (cs <= rp) { low++; continue; }
      } else {
        if (cs <= 2) { critical++; continue; }
        if (cs <= 5) { low++; continue; }
      }
    }

    const inventoryStats = {
      totalItems: totalItems || 0,
      criticalItems: (low + critical) || 0,
      expiringItems: expiring || 0,
      outOfStockItems: out || 0,
      expiredItems: expired || 0
    };

    res.render('admin-inventory', {
      title: 'Inventory Management',
      username: req.session.username,
      admin: req.session.admin,
      inventoryStats,
      recentItems: recentItems || []
    });
  } catch (error) {
    console.error('Inventory page error:', error);
    res.redirect('/admin/login');
  }
});

// Admin settings page
router.get('/settings', requireAdminAuth, (req, res) => {
  try {
    const settings = require('../utils/settings').getAll();
    res.render('admin-settings', {
      title: 'Admin Settings',
      username: req.session.username,
      settings
    });
  } catch (err) {
    console.error('Settings page load error:', err);
    res.render('admin-settings', {
      title: 'Admin Settings',
      username: req.session.username,
      settings: { emailNotifications: true, scheduleExpiryDays: 3 }
    });
  }
});

// ANNOUNCEMENT ROUTES

// Announcements management page
router.get('/announcements', requireAdminAuth, async (req, res) => {
  try {
    const announcements = await Announcement.find()
      .populate('createdBy', 'firstName lastName')
      .sort({ createdAt: -1 });
    
    res.render('admin-announcements', {
      title: 'Manage Announcements',
      username: req.session.username,
      announcements: announcements
    });
  } catch (error) {
    console.error('Announcements page error:', error);
    res.redirect('/admin/login');
  }
});

// Get all announcements with filtering
router.get('/api/announcements', requireAdminAuth, async (req, res) => {
  try {
  const { search, status, type, priority, date } = req.query;
    
    let filter = {};
    
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } }
      ];
    }
    // Status filtering: active/inactive/archived; default excludes archived
    if (status && status !== 'all') {
      if (status === 'archived') {
        filter.isArchived = true;
      } else {
        filter.isActive = status === 'active';
        filter.isArchived = { $ne: true };
      }
    } else {
      // Default: exclude archived
      filter.isArchived = { $ne: true };
    }
    if (type && type !== 'all') filter.type = type;
    if (priority && priority !== 'all') filter.priority = priority;
    if (date) {
      // Filter by creation date (YYYY-MM-DD)
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      filter.createdAt = { $gte: start, $lte: end };
    }

    const announcements = await Announcement.find(filter)
      .populate('createdBy', 'firstName lastName')
      .sort({ createdAt: -1 });

    res.json(announcements);
  } catch (error) {
    console.error('Get announcements error:', error);
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

// Get single announcement by ID
router.get('/api/announcements/:id', requireAdminAuth, async (req, res, next) => {
  try {
    // Allow specially-named routes like '/api/announcements/active' to fall through
    if (req.params.id === 'active') return next();
    const announcement = await Announcement.findById(req.params.id)
      .populate('createdBy', 'firstName lastName');

    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }

    res.json(announcement);
  } catch (error) {
    console.error('Get announcement error:', error);
    res.status(500).json({ error: 'Failed to fetch announcement' });
  }
});

// Create new announcement
router.post('/api/announcements', requireAdminAuth, upload.single('image'), async (req, res) => {
  try {
    const { title, content, type, priority, expiryDate, isActive, scheduleDate } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }
    // Validate priority
    const validPriorities = ['low', 'medium', 'high', 'urgent'];
    if (priority && !validPriorities.includes(priority)) {
      return res.status(400).json({ error: 'Invalid priority type' });
    }

    // Normalize boolean and date fields from multipart (strings)
    const parseBool = (val, defaultVal = false) => {
      if (val === undefined || val === null) return defaultVal;
      if (typeof val === 'boolean') return val;
      if (typeof val === 'number') return val === 1;
      const s = String(val).toLowerCase();
      return s === 'true' || s === '1' || s === 'yes' || s === 'on';
    };

    let activeFlag = parseBool(isActive, true);
    let schedule = scheduleDate ? new Date(scheduleDate) : null;
    if (schedule && schedule > new Date()) {
      activeFlag = false; // Scheduled for future, not active yet
    }
    const announcement = new Announcement({
      title,
      content,
      type: type || 'general',
      priority: priority || 'medium',
      expiryDate: expiryDate || null,
      isActive: activeFlag,
      createdBy: req.session.adminId,
      scheduleDate: schedule,
      imageUrl: req.file ? toPublicUrl(req.file.path) : null
    });

  await announcement.save();

    const savedAnnouncement = await Announcement.findById(announcement._id)
      .populate('createdBy', 'firstName lastName');

    // Broadcast to all SSE clients (admins and users)
    try { broadcast('announcement_updated', { action: 'created', announcement: savedAnnouncement }); } catch (e) {}

    // Optionally notify all active residents via email if notifications enabled and announcement is active (or scheduled soon)
    try {
      const settingsSvc = require('../utils/settings');
      const emailEnabled = settingsSvc.get('emailNotifications', true);
      if (emailEnabled && savedAnnouncement.isActive) {
        const User = require('../models/User');
        const { sendNotificationEmail } = require('../utils/emailService');
        const recipients = await User.find({ isActive: true, role: 'resident' }, 'email firstName lastName').limit(500);
        console.log(`Queuing announcement email to ${recipients.length} users...`);
        // Send in background without blocking response
        (async () => {
          for (const u of recipients) {
            const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Resident';
            const preview = (savedAnnouncement.content || '').replace(/<[^>]+>/g, '').slice(0, 140);
            try {
              await sendNotificationEmail(u.email, name, savedAnnouncement.title, preview || 'New announcement posted.', 'info');
            } catch (e) {
              console.error('Failed sending announcement email to', u.email, e.message);
            }
          }
          console.log('Finished sending announcement emails.');
        })();
      }
    } catch (mailErr) {
      console.error('Announcement email notify error:', mailErr);
    }

    // Create in-app notifications for all active residents if announcement is active
    try {
      if (savedAnnouncement.isActive) {
        const User = require('../models/User');
        const Notification = require('../models/notification');
        const users = await User.find({ isActive: true, role: 'resident' }, '_id').limit(1000);
        const preview = (savedAnnouncement.content || '').replace(/<[^>]+>/g, '').slice(0, 180) || 'New announcement posted.';
        const docs = users.map(u => ({
          userId: u._id,
          title: savedAnnouncement.title,
          message: preview,
          type: 'general',
          relatedId: savedAnnouncement._id,
          priority: savedAnnouncement.priority || 'medium',
          actionUrl: '/users/announcements'
        }));
        if (docs.length) {
          await Notification.insertMany(docs, { ordered: false });
          console.log(`Created ${docs.length} announcement notifications.`);
        }
      }
    } catch (notifErr) {
      console.error('Error creating announcement notifications:', notifErr);
    }

    res.status(201).json(savedAnnouncement);
  } catch (error) {
    console.error('Create announcement error:', error);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

// Update announcement
router.put('/api/announcements/:id', requireAdminAuth, upload.single('image'), async (req, res) => {
  try {
    const { title, content, type, priority, isActive, expiryDate, removeImage } = req.body;
    
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }
    const wasActive = !!announcement.isActive;

    if (title) announcement.title = title;
    if (content) announcement.content = content;
    if (type) announcement.type = type;
    if (priority) announcement.priority = priority;
    if (isActive !== undefined) {
      const parseBool = (val) => {
        if (typeof val === 'boolean') return val;
        if (typeof val === 'number') return val === 1;
        const s = String(val).toLowerCase();
        return s === 'true' || s === '1' || s === 'yes' || s === 'on';
      };
      announcement.isActive = parseBool(isActive);
    }
    if (expiryDate !== undefined) announcement.expiryDate = expiryDate;

    // Handle image updates
    if (req.file) {
      // Replace existing image
      if (announcement.imageUrl) {
        removeAnnouncementImage(announcement.imageUrl);
      }
      announcement.imageUrl = toPublicUrl(req.file.path);
    } else if (removeImage === 'true' || removeImage === true || removeImage === '1') {
      if (announcement.imageUrl) {
        removeAnnouncementImage(announcement.imageUrl);
      }
      announcement.imageUrl = null;
    }

    await announcement.save();

    const updatedAnnouncement = await Announcement.findById(announcement._id)
      .populate('createdBy', 'firstName lastName');
    // Broadcast update
    try { broadcast('announcement_updated', { action: 'updated', announcement: updatedAnnouncement }); } catch (e) {}

    // If activation toggled on, create notifications for residents
    try {
      if (!wasActive && updatedAnnouncement.isActive) {
        const User = require('../models/User');
        const Notification = require('../models/notification');
        const users = await User.find({ isActive: true, role: 'resident' }, '_id').limit(1000);
        const preview = (updatedAnnouncement.content || '').replace(/<[^>]+>/g, '').slice(0, 180) || 'Announcement activated.';
        const docs = users.map(u => ({
          userId: u._id,
          title: updatedAnnouncement.title,
          message: preview,
          type: 'general',
          relatedId: updatedAnnouncement._id,
          priority: updatedAnnouncement.priority || 'medium',
          actionUrl: '/users/announcements'
        }));
        if (docs.length) await Notification.insertMany(docs, { ordered: false });
      }
    } catch (notifErr) {
      console.error('Error creating activation notifications:', notifErr);
    }

    res.json(updatedAnnouncement);
  } catch (error) {
    console.error('Update announcement error:', error);
    res.status(500).json({ error: 'Failed to update announcement' });
  }
});

// Delete announcement
router.delete('/api/announcements/:id', requireAdminAuth, async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) {
      return res.status(404).json({ error: 'Announcement not found' });
    }
    // Remove image from disk if present
    if (announcement.imageUrl) {
      removeAnnouncementImage(announcement.imageUrl);
    }
    await Announcement.findByIdAndDelete(req.params.id);
    try { broadcast('announcement_updated', { action: 'deleted', id: String(announcement._id) }); } catch (e) {}
    res.json({ message: 'Announcement deleted successfully' });
  } catch (error) {
    console.error('Delete announcement error:', error);
    res.status(500).json({ error: 'Failed to delete announcement' });
  }
});

// Get active announcements for users
router.get('/api/announcements/active', async (req, res) => {
  try {
    // Treat expiryDate as date-only (inclusive through the end of the day)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const announcements = await Announcement.find({
      isActive: true,
      isArchived: { $ne: true },
      $or: [
        { expiryDate: { $exists: false } },
        { expiryDate: null },
        { expiryDate: { $gte: todayStart } }
      ]
    })
      .populate('createdBy', 'firstName lastName')
      .sort({ priority: -1, createdAt: -1 })
      .limit(10);

    res.json(announcements);
  } catch (error) {
    console.error('Get active announcements error:', error);
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

// Archive announcement
router.put('/api/announcements/:id/archive', requireAdminAuth, async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) return res.status(404).json({ error: 'Announcement not found' });
    announcement.isArchived = true;
    announcement.isActive = false; // archived items are not active
    await announcement.save();
    const updated = await Announcement.findById(announcement._id).populate('createdBy', 'firstName lastName');
    try { broadcast('announcement_updated', { action: 'archived', announcement: updated }); } catch (e) {}
    res.json(updated);
  } catch (error) {
    console.error('Archive announcement error:', error);
    res.status(500).json({ error: 'Failed to archive announcement' });
  }
});

// Some environments block PUT; provide POST alias
router.post('/api/announcements/:id/archive', requireAdminAuth, async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) return res.status(404).json({ error: 'Announcement not found' });
    announcement.isArchived = true;
    announcement.isActive = false;
    await announcement.save();
    const updated = await Announcement.findById(announcement._id).populate('createdBy', 'firstName lastName');
    try { broadcast('announcement_updated', { action: 'archived', announcement: updated }); } catch (e) {}
    res.json(updated);
  } catch (error) {
    console.error('Archive announcement error (POST):', error);
    res.status(500).json({ error: 'Failed to archive announcement' });
  }
});

// Unarchive announcement
router.put('/api/announcements/:id/unarchive', requireAdminAuth, async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) return res.status(404).json({ error: 'Announcement not found' });
    announcement.isArchived = false;
    // Keep inactive by default after unarchive; admin can activate explicitly
    await announcement.save();
    const updated = await Announcement.findById(announcement._id).populate('createdBy', 'firstName lastName');
    try { broadcast('announcement_updated', { action: 'unarchived', announcement: updated }); } catch (e) {}
    res.json(updated);
  } catch (error) {
    console.error('Unarchive announcement error:', error);
    res.status(500).json({ error: 'Failed to unarchive announcement' });
  }
});

// POST alias for unarchive
router.post('/api/announcements/:id/unarchive', requireAdminAuth, async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) return res.status(404).json({ error: 'Announcement not found' });
    announcement.isArchived = false;
    await announcement.save();
    const updated = await Announcement.findById(announcement._id).populate('createdBy', 'firstName lastName');
    try { broadcast('announcement_updated', { action: 'unarchived', announcement: updated }); } catch (e) {}
    res.json(updated);
  } catch (error) {
    console.error('Unarchive announcement error (POST):', error);
    res.status(500).json({ error: 'Failed to unarchive announcement' });
  }
});


// --- Pending Requests (admin review) ---
// List resident update requests
router.get('/requests/residents', requireAdminAuth, async (req, res) => {
  try {
    const requests = await ResidentRequest.find({ status: 'pending' }).sort({ createdAt: -1 });
    const rejectedMessage = req.session.rejectedMessage;
    req.session.rejectedMessage = null;
    res.render('admin-requests-residents', { title: 'Resident Requests', username: req.session.username, requests, rejectedMessage });
  } catch (error) {
    console.error('Resident requests error:', error);
    res.redirect('/admin/dashboard');
  }
});

// Approve resident request (import into User collection)
router.post('/requests/residents/:id/approve', requireAdminAuth, async (req, res) => {
  try {
    const reqDoc = await ResidentRequest.findById(req.params.id);
    if (!reqDoc) return res.status(404).send('Request not found');

    // Create user if not exists; otherwise activate existing user
    let user = await User.findOne({ email: reqDoc.email });
    if (!user) {
      user = new User({
        firstName: reqDoc.firstName,
        lastName: reqDoc.lastName || '',
        email: reqDoc.email,
        phone: reqDoc.phone || '',
        unitNumber: reqDoc.unitNumber || '',
        password: 'temporary123',
        role: 'resident',
        isActive: true,
        createdAt: new Date()
      });
      await user.save();
    } else {
      // Activate and optionally backfill missing fields
      user.firstName = user.firstName || reqDoc.firstName;
      user.lastName = user.lastName || reqDoc.lastName || '';
      user.phone = user.phone || reqDoc.phone || '';
      user.unitNumber = user.unitNumber || reqDoc.unitNumber || '';
      user.isActive = true;
      await user.save();
    }

    reqDoc.status = 'approved';
    await reqDoc.save();

    // Send welcome email upon approval (respects Enable emails setting)
    try {
      const { sendNotificationEmail } = require('../utils/emailService');
      const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Resident';
      const title = 'Welcome to our Barangay';
      const message = 'Your registration has been approved. Welcome to our Barangay! You can now log in and use the portal.';
      // Fire-and-forget; internal function respects the global emailNotifications toggle
      sendNotificationEmail(user.email, fullName, title, message, 'success')
        .catch(err => console.error('Failed to send approval welcome email:', err.message));
    } catch (mailErr) {
      console.error('Error queuing approval welcome email:', mailErr);
    }

    // In-app notification for resident approval
    try {
      const Notification = require('../models/notification');
      const notif = new Notification({
        userId: user._id,
        title: 'Account Approved',
        message: 'Your registration has been approved. You can now access the resident portal.',
        type: 'general',
        priority: 'medium',
        actionUrl: '/users/dashboard'
      });
      await notif.save();
    } catch (notifErr) {
      console.error('Error creating resident approval notification:', notifErr);
    }
    res.redirect('/admin/requests/residents');
  } catch (error) {
    console.error('Approve resident request error:', error);
    res.redirect('/admin/requests/residents');
  }
});

// Reject resident request
router.post('/requests/residents/:id/reject', requireAdminAuth, async (req, res) => {
  try {
    const reqDoc = await ResidentRequest.findById(req.params.id);
    if (!reqDoc || reqDoc.status !== 'pending') {
      const msg = `Reject failed: ResidentRequest not found or already processed. ID: ${req.params.id}`;
      logToFile(msg);
      req.session.rejectedMessage = 'Resident request not found or already processed.';
      return res.redirect('/admin/requests/residents');
    }
    reqDoc.status = 'rejected';
    await reqDoc.save();
    logToFile(`ResidentRequest rejected successfully. ID: ${req.params.id}`);
    req.session.rejectedMessage = 'Resident request rejected successfully.';
    res.redirect('/admin/requests/residents');
  } catch (error) {
    logToFile(`Reject resident request error: ${error.stack}`);
    req.session.rejectedMessage = 'An error occurred while rejecting the request.';
    res.redirect('/admin/requests/residents');
  }
});

// List schedule requests
router.get('/requests/schedule', requireAdminAuth, async (req, res) => {
  try {
    // also provide list of doctors (admins) for assigning
    const [requests, doctors] = await Promise.all([
      ScheduleRequest.find({ status: 'pending' }).sort({ createdAt: -1 }).populate('requester', 'firstName lastName email'),
      User.find({ role: 'admin', isActive: true }, 'firstName lastName email')
    ]);

    res.render('admin-requests-schedule', { title: 'Schedule Requests', username: req.session.username, requests, doctors });
  } catch (error) {
    console.error('Schedule requests error:', error);
    res.redirect('/admin/dashboard');
  }
});

// Approve schedule request (create appointment)
// Approve schedule request (create appointment) - accepts JSON with date, time, notes
router.post('/requests/schedule/:id/approve', requireAdminAuth, async (req, res) => {
  try {
    const { date, time, notes, appointmentType: requestedType } = req.body;
    const reqDoc = await ScheduleRequest.findById(req.params.id).populate('requester');
    if (!reqDoc) return res.status(404).json({ success: false, error: 'Request not found' });

    // Validate
    if (!date || !time) {
      return res.status(400).json({ success: false, error: 'Appointment date and time are required' });
    }

    // Enforce user's requested appointment type if present; otherwise require admin to choose one
    let appointmentTypeName = null;
    if (reqDoc.appointmentType) {
      appointmentTypeName = reqDoc.appointmentType;
    } else if (requestedType) {
      appointmentTypeName = requestedType;
    } else {
      return res.status(400).json({ success: false, error: 'Appointment type is required' });
    }

    const appointment = new Appointment({
      patientId: reqDoc.requester ? reqDoc.requester._id : null,
      appointmentDate: date,
      appointmentTime: time,
      appointmentType: appointmentTypeName,
      status: 'scheduled',
      notes: notes || '',
      createdBy: req.session.adminId
    });
    try {
      await appointment.save();
    } catch (saveErr) {
      console.error('Approve schedule request save error:', saveErr);
      // Return validation details to client
      const message = saveErr && saveErr.message ? saveErr.message : 'Failed saving appointment';
      return res.status(400).json({ success: false, error: message });
    }

    reqDoc.status = 'approved';
    reqDoc.adminId = req.session.adminId;
    reqDoc.approvedAt = new Date();
    await reqDoc.save();

    // Fire-and-forget notification email to the requester
    try {
      if (reqDoc.requester && reqDoc.requester.email) {
        const { sendNotificationEmail } = require('../utils/emailService');
        const fullName = `${reqDoc.requester.firstName || ''} ${reqDoc.requester.lastName || ''}`.trim();
        const title = 'Appointment Scheduled';
        const message = `Your appointment (${appointmentTypeName}) has been scheduled on ${date} at ${time}.`;
        // Do not await to avoid delaying response significantly
        sendNotificationEmail(reqDoc.requester.email, fullName || 'Resident', title, message, 'success')
          .catch(err => console.error('Failed to send appointment approval email:', err.message));
      }
    } catch (mailErr) {
      console.error('Error queuing appointment approval email:', mailErr);
    }

    // Create in-app notification for the requester
    try {
      if (reqDoc.requester && reqDoc.requester._id) {
        const Notification = require('../models/notification');
        const notif = new Notification({
          userId: reqDoc.requester._id,
          title: 'Appointment Scheduled',
          message: `Your appointment (${appointmentTypeName}) has been scheduled on ${date} at ${time}.`,
          type: 'appointment_approved',
          relatedId: appointment._id,
          priority: 'medium',
          actionUrl: '/users/schedule'
        });
        await notif.save();
      }
    } catch (notifErr) {
      console.error('Error creating appointment approval notification:', notifErr);
      // Non-fatal
    }

    res.json({ success: true, appointment });
  } catch (error) {
    console.error('Approve schedule request error:', error);
    res.status(500).json({ success: false, error: 'Failed to approve request' });
  }
});

// Reschedule schedule request - accepts JSON with rescheduleReason and notes
router.post('/requests/schedule/:id/decline', requireAdminAuth, async (req, res) => {
  try {
    const { reason, customReason, notes } = req.body;
    const reqDoc = await ScheduleRequest.findById(req.params.id).populate('requester');
    if (!reqDoc) return res.status(404).json({ success: false, error: 'Request not found' });

    // Set reschedule reason
    let rescheduleReason = reason;
    if (reason === 'other' && customReason) {
      rescheduleReason = customReason;
    }

    // Update request status to reschedule_requested
    reqDoc.status = 'reschedule_requested';
    reqDoc.rescheduleReason = rescheduleReason || '';
    reqDoc.rescheduleNotes = notes || '';
    reqDoc.rescheduleRequestedAt = new Date();
    reqDoc.adminId = req.session.adminId;
    await reqDoc.save();

    // Create notification for resident about reschedule request
    try {
      const Notification = require('../models/notification');
      const notification = new Notification({
        userId: reqDoc.requester._id,
        title: 'Reschedule Request',
        message: `Your appointment request "${reqDoc.title}" needs to be rescheduled. Please provide new preferred dates.`,
        type: 'reschedule_request',
        relatedId: reqDoc._id,
        priority: 'high',
        actionUrl: '/users/schedule'
      });
      await notification.save();
      console.log(`Notification created for resident: ${reqDoc.requester?.email}`);
    } catch (notifError) {
      console.error('Error creating notification:', notifError);
      // Don't fail the main operation if notification fails
    }

    res.json({ success: true, message: 'Reschedule request sent to resident' });
  } catch (error) {
    console.error('Reschedule request error:', error);
    res.status(500).json({ success: false, error: 'Failed to send reschedule request' });
  }
});

// Approve reschedule request - when admin approves resident's new dates
router.post('/requests/schedule/:id/approve-reschedule', requireAdminAuth, async (req, res) => {
  try {
    const { date, time, notes } = req.body;
    const reqDoc = await ScheduleRequest.findById(req.params.id).populate('requester');
    if (!reqDoc) return res.status(404).json({ success: false, error: 'Request not found' });

    // Validate
    if (!date || !time) {
      return res.status(400).json({ success: false, error: 'Appointment date and time are required' });
    }

    // Verify the request is in reschedule_requested status with new dates
    if (reqDoc.status !== 'reschedule_requested' || !reqDoc.newStart) {
      return res.status(400).json({ success: false, error: 'Request is not eligible for reschedule approval' });
    }

    // Create appointment with the new dates
    const appointment = new Appointment({
      patientId: reqDoc.requester ? reqDoc.requester._id : null,
      appointmentDate: date,
      appointmentTime: time,
      appointmentType: reqDoc.appointmentType || 'Consultation',
      status: 'scheduled',
      notes: notes || `Rescheduled appointment: ${reqDoc.title}`,
      createdBy: req.session.adminId
    });

    try {
      await appointment.save();
    } catch (saveErr) {
      console.error('Approve reschedule request save error:', saveErr);
      const message = saveErr && saveErr.message ? saveErr.message : 'Failed saving appointment';
      return res.status(400).json({ success: false, error: message });
    }

  // Update request status
    reqDoc.status = 'approved';
    reqDoc.rescheduleStatus = 'approved';
    reqDoc.rescheduleApprovedAt = new Date();
    reqDoc.adminId = req.session.adminId;
    await reqDoc.save();

    // Notify requester of approved reschedule
    try {
      if (reqDoc.requester && reqDoc.requester.email) {
        const { sendNotificationEmail } = require('../utils/emailService');
        const fullName = `${reqDoc.requester.firstName || ''} ${reqDoc.requester.lastName || ''}`.trim();
        const title = 'Reschedule Approved';
        const message = `Your appointment has been rescheduled to ${date} at ${time}.`;
        sendNotificationEmail(reqDoc.requester.email, fullName || 'Resident', title, message, 'info')
          .catch(err => console.error('Failed to send reschedule approval email:', err.message));
      }
    } catch (mailErr) {
      console.error('Error queuing reschedule approval email:', mailErr);
    }

    // In-app notification for reschedule approval
    try {
      if (reqDoc.requester && reqDoc.requester._id) {
        const Notification = require('../models/notification');
        const notif = new Notification({
          userId: reqDoc.requester._id,
          title: 'Appointment Rescheduled',
          message: `Your appointment has been rescheduled to ${date} at ${time}.`,
          type: 'appointment_approved',
          relatedId: appointment._id,
          priority: 'medium',
          actionUrl: '/users/schedule'
        });
        await notif.save();
      }
    } catch (notifErr) {
      console.error('Error creating reschedule approval notification:', notifErr);
    }

    res.json({ success: true, appointment });
  } catch (error) {
    console.error('Approve reschedule request error:', error);
    res.status(500).json({ success: false, error: 'Failed to approve reschedule request' });
  }
});

// Reject reschedule request - when admin rejects resident's new dates
router.post('/requests/schedule/:id/reject-reschedule', requireAdminAuth, async (req, res) => {
  try {
    const { reason } = req.body;
    const reqDoc = await ScheduleRequest.findById(req.params.id);
    if (!reqDoc) return res.status(404).json({ success: false, error: 'Request not found' });

    // Update request status
    reqDoc.status = 'rejected';
    reqDoc.rescheduleStatus = 'rejected';
    reqDoc.declineReason = reason || 'Reschedule request rejected';
    reqDoc.adminId = req.session.adminId;
    await reqDoc.save();

    res.json({ success: true, message: 'Reschedule request rejected' });
  } catch (error) {
    console.error('Reject reschedule request error:', error);
    res.status(500).json({ success: false, error: 'Failed to reject reschedule request' });
  }
});

// Reschedule appointment - when admin requests reschedule for an existing appointment
router.post('/appointments/:id/reschedule', requireAdminAuth, async (req, res) => {
  try {
    const { reason, notes } = req.body;
    const appointment = await Appointment.findById(req.params.id).populate('patientId');
    if (!appointment) return res.status(404).json({ success: false, error: 'Appointment not found' });

    // Update appointment status to reschedule
    appointment.status = 'reschedule';
    appointment.declineReason = reason || '';
    appointment.recommendation = notes || '';
    await appointment.save();

    // Create notification for patient about reschedule request
    try {
      const Notification = require('../models/notification');
      const notification = new Notification({
        userId: appointment.patientId._id,
        title: 'Appointment Reschedule Request',
        message: `Your appointment on ${appointment.appointmentDate} at ${appointment.appointmentTime} needs to be rescheduled. Please provide new preferred dates.`,
        type: 'reschedule_request',
        relatedId: appointment._id,
        priority: 'high',
        actionUrl: '/users/schedule'
      });
      await notification.save();
      console.log(`Reschedule notification created for patient: ${appointment.patientId?.email}`);
    } catch (notifError) {
      console.error('Error creating reschedule notification:', notifError);
      // Don't fail the main operation if notification fails
    }

    res.json({ success: true, message: 'Reschedule request sent to patient' });
  } catch (error) {
    console.error('Reschedule appointment error:', error);
    res.status(500).json({ success: false, error: 'Failed to send reschedule request' });
  }
});

// Log function
function logToFile(message) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`);
}

// ============================================================================
// INVENTORY MANAGEMENT API ROUTES
// ============================================================================

// Get inventory statistics
router.get('/api/inventory/statistics', requireAdminAuth, async (req, res) => {
  try {
    const now = new Date();
    const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const [items, totalItems, totalValueAgg] = await Promise.all([
      Inventory.find({ isActive: true }).select('currentStock reorderPoint expirationDate unitPrice').lean(),
      Inventory.countDocuments({ isActive: true }),
      Inventory.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: null, totalValue: { $sum: { $multiply: ['$currentStock', '$unitPrice'] } } } }
      ])
    ]);

    let low = 0, critical = 0, out = 0, expired = 0, expiring = 0;
    for (const it of items) {
      const cs = Number(it.currentStock || 0);
      const rp = Number(it.reorderPoint || 0);
      const exp = it.expirationDate ? new Date(it.expirationDate) : null;
      if (exp && exp < now) { expired++; }
      // Out of stock items should not be counted as expiring soon
      if (cs <= 0) { out++; continue; }
      if (exp && exp >= now && exp <= in30) { expiring++; }
      if (rp > 0) {
        if (cs <= rp * 0.5) { critical++; continue; }
        if (cs <= rp) { low++; continue; }
      } else {
        if (cs <= 2) { critical++; continue; }
        if (cs <= 5) { low++; continue; }
      }
    }

    res.json({
      success: true,
      statistics: {
        totalItems,
        criticalItems: low + critical,
        lowStockItems: low,
        criticalStockItems: critical,
        expiringItems: expiring,
        outOfStockItems: out,
        expiredItems: expired,
        totalValue: totalValueAgg[0]?.totalValue || 0
      }
    });
  } catch (error) {
    console.error('Get inventory statistics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch inventory statistics'
    });
  }
});

// Get inventory statistics
// (Removed duplicate '/api/inventory/statistics' route)

// Get all inventory items with filtering
router.get('/api/inventory', requireAdminAuth, async (req, res) => {
  try {
    const { search, category, location, status, expiration } = req.query;

    let filter = { isActive: true };

    if (search) {
      filter.$or = [
        { itemName: { $regex: search, $options: 'i' } },
        { itemId: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    if (category && category !== 'all') {
      filter.category = category;
    }

    if (location && location !== 'all') {
      filter.location = location;
    }

    // We'll handle status filtering with computed fallback for low/critical later
    let requestedStatuses = null;
    if (status && status !== 'all') {
      const alias = {
        low: 'low-stock',
        critical: 'critical-stock',
        instock: 'in-stock',
        'in-stock': 'in-stock',
        'out-of-stock': 'out-of-stock'
      };
      requestedStatuses = String(status).split(',').map(s => alias[s] || s);
      // Only pre-filter by DB status if not requesting low/critical (we'll compute those)
      const wantsComputed = requestedStatuses.some(s => s === 'low-stock' || s === 'critical-stock');
      if (!wantsComputed) {
        if (requestedStatuses.length > 1) {
          filter.status = { $in: requestedStatuses };
        } else {
          filter.status = requestedStatuses[0];
        }
      }
    }

    if (expiration) {
      const now = new Date();
      const expDate = new Date(expiration);

      if (expiration === 'expiring') {
        filter.expirationDate = {
          $gte: now,
          $lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // 30 days
        };
        // Exclude out-of-stock from expiring soon listing
        filter.currentStock = { $gt: 0 };
      } else if (expiration === 'expired') {
        filter.expirationDate = { $lt: now };
      } else {
        filter.expirationDate = expDate;
      }
    }

    const items = await Inventory.find(filter)
      .populate('createdBy', 'firstName lastName')
      .sort({ createdAt: -1 });

    // If low/critical requested, apply computed filter with fallback thresholds
    let filtered = items;
    if (requestedStatuses && requestedStatuses.some(s => s === 'low-stock' || s === 'critical-stock')) {
      const wantLow = requestedStatuses.includes('low-stock');
      const wantCritical = requestedStatuses.includes('critical-stock');
      filtered = items.filter(it => {
        const cs = Number(it.currentStock || 0);
        const rp = Number(it.reorderPoint || 0);
        if (cs <= 0) return false; // not low/critical
        let isCrit = false, isLow = false;
        if (rp > 0) {
          isCrit = cs <= rp * 0.5;
          isLow = !isCrit && cs <= rp;
        } else {
          isCrit = cs <= 2;
          isLow = !isCrit && cs <= 5;
        }
        return (wantCritical && isCrit) || (wantLow && isLow);
      });
    }

    res.json({
      success: true,
      items: filtered
    });
  } catch (error) {
    console.error('Get inventory error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch inventory items'
    });
  }
});

// Get single inventory item
router.get('/api/inventory/:id([0-9a-fA-F]{24})', requireAdminAuth, async (req, res) => {
  try {
    const item = await Inventory.findById(req.params.id)
      .populate('createdBy', 'firstName lastName');

    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Inventory item not found'
      });
    }

    res.json({
      success: true,
      item
    });
  } catch (error) {
    console.error('Get inventory item error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch inventory item'
    });
  }
});

// Create new inventory item
router.post('/api/inventory', requireAdminAuth, async (req, res) => {
  try {
    const {
      itemId,
      itemName,
      category,
      location,
      currentStock,
      reorderPoint,
      expirationDate,
      supplier,
      unitPrice,
      description
    } = req.body;

    // Validate required fields
    if (!itemName || !category || !location || currentStock === undefined || reorderPoint === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Prepare or generate Item ID (uppercase 5-char code if not provided)
    let finalItemId = itemId ? String(itemId).toUpperCase() : null;
    if (!finalItemId) {
      const genCode = (len = 5) => {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let out = '';
        for (let i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
        return out;
      };
      let attempts = 0;
      while (attempts < 10 && !finalItemId) {
        const candidate = genCode(5);
        const exists = await Inventory.findOne({ itemId: candidate });
        if (!exists) {
          finalItemId = candidate;
          break;
        }
        attempts++;
      }
      if (!finalItemId) {
        return res.status(500).json({ success: false, error: 'Failed to generate unique Item ID' });
      }
    } else {
      // If client provided an ID, ensure it's unique
      const dup = await Inventory.findOne({ itemId: finalItemId });
      if (dup) {
        return res.status(400).json({ success: false, error: 'Item ID already exists' });
      }
    }

    const item = new Inventory({
      itemId: finalItemId,
      itemName,
      category,
      location,
      currentStock: parseInt(currentStock),
      reorderPoint: parseInt(reorderPoint),
      expirationDate: expirationDate || null,
      supplier: supplier || '',
      unitPrice: parseFloat(unitPrice) || 0,
      description: description || '',
      createdBy: req.session.adminId
    });

    await item.save();

    const savedItem = await Inventory.findById(item._id)
      .populate('createdBy', 'firstName lastName');

    // Broadcast update to all connected clients
    broadcast({
      type: 'inventory_created',
      payload: savedItem
    });

    res.status(201).json({
      success: true,
      item: savedItem
    });
  } catch (error) {
    console.error('Create inventory item error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create inventory item'
    });
  }
});

// Update inventory item
router.put('/api/inventory/:id', requireAdminAuth, async (req, res) => {
  try {
    const {
      itemName,
      category,
      location,
      currentStock,
      reorderPoint,
      expirationDate,
      supplier,
      unitPrice,
      description
    } = req.body;

    const item = await Inventory.findById(req.params.id);
    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Inventory item not found'
      });
    }

    // Update fields if provided
    if (itemName) item.itemName = itemName;
    if (category) item.category = category;
    if (location) item.location = location;
    if (currentStock !== undefined) item.currentStock = parseInt(currentStock);
    if (reorderPoint !== undefined) item.reorderPoint = parseInt(reorderPoint);
    if (expirationDate !== undefined) item.expirationDate = expirationDate || null;
    if (supplier !== undefined) item.supplier = supplier;
    if (unitPrice !== undefined) item.unitPrice = parseFloat(unitPrice) || 0;
    if (description !== undefined) item.description = description;

    await item.save();

    const updatedItem = await Inventory.findById(item._id)
      .populate('createdBy', 'firstName lastName');

    // Broadcast update to all connected clients
    broadcast({
      type: 'inventory_updated',
      payload: updatedItem
    });

    res.json({
      success: true,
      item: updatedItem
    });
  } catch (error) {
    console.error('Update inventory item error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update inventory item'
    });
  }
});

// Delete inventory item (soft delete)
router.delete('/api/inventory/:id', requireAdminAuth, async (req, res) => {
  try {
    const item = await Inventory.findById(req.params.id);
    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Inventory item not found'
      });
    }

    item.isActive = false;
    await item.save();

    // Broadcast update to all connected clients
    broadcast({
      type: 'inventory_deleted',
      payload: { id: item._id }
    });

    res.json({
      success: true,
      message: 'Inventory item deleted successfully'
    });
  } catch (error) {
    console.error('Delete inventory item error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete inventory item'
    });
  }
});

// Update stock levels (for restocking/adjustments)
router.patch('/api/inventory/:id/stock', requireAdminAuth, async (req, res) => {
  try {
    const { action, quantity, reason } = req.body; // action: 'add', 'subtract', 'set'

    const item = await Inventory.findById(req.params.id);
    if (!item) {
      return res.status(404).json({
        success: false,
        error: 'Inventory item not found'
      });
    }

    const qty = parseInt(quantity);
    if (isNaN(qty) || qty < 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid quantity'
      });
    }

    switch (action) {
      case 'add':
        item.currentStock += qty;
        break;
      case 'subtract':
        if (item.currentStock < qty) {
          return res.status(400).json({
            success: false,
            error: 'Insufficient stock'
          });
        }
        item.currentStock -= qty;
        break;
      case 'set':
        item.currentStock = qty;
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action'
        });
    }

    await item.save();

    const updatedItem = await Inventory.findById(item._id)
      .populate('createdBy', 'firstName lastName');

    // Broadcast update to all connected clients
    broadcast({
      type: 'inventory_stock_updated',
      payload: {
        item: updatedItem,
        action,
        quantity: qty,
        reason: reason || ''
      }
    });

    res.json({
      success: true,
      item: updatedItem
    });
  } catch (error) {
    console.error('Update stock error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update stock'
    });
  }
});

// SSE stream for admin clients to get realtime updates
router.get('/events', requireAdminAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  addClient(res);

  // Initial ping
  res.write(`data: ${JSON.stringify({ type: 'ping', payload: Date.now() })}\n\n`);

  req.on('close', () => {
    removeClient(res);
    try { res.end(); } catch (e) {}
  });
});

// Admin logout endpoint (used by admin pages' Logout button)
router.post('/logout', (req, res) => {
  try {
    if (!req.session) {
      return res.json({ success: true });
    }
    req.session.destroy((err) => {
      if (err) {
        console.error('Admin logout error:', err);
        return res.status(500).json({ success: false, message: 'Logout failed' });
      }
      res.json({ success: true, message: 'Logged out successfully' });
    });
  } catch (e) {
    console.error('Admin logout exception:', e);
    res.status(500).json({ success: false, message: 'Logout failed' });
  }
});

module.exports = router;