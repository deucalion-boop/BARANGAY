const express = require('express');
const mongoose = require('mongoose');
// Session and auth middleware
const { sessionMiddleware, requireAuth, requireAdminAuth, attachLocals, errorHandler, notFoundHandler } = require('./middleware/mw');
const bcrypt = require('bcryptjs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

// Import email service
const { sendOTPEmail, verifyOTP, generateOTP, sendWelcomeEmail, sendNotificationEmail } = require('./utils/emailService');

// Import reCAPTCHA config
const recaptchaConfig = require('./config/recaptcha');

// Helper function to verify reCAPTCHA
async function verifyRecaptcha(token) {
  try {
    const response = await axios.post(recaptchaConfig.verifyUrl, null, {
      params: {
        secret: recaptchaConfig.secretKey,
        response: token
      }
    });
    return response.data.success;
  } catch (error) {
    console.error('reCAPTCHA verification error:', error);
    return false;
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// Core middleware
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// If running behind a proxy/ingress (e.g., NGINX/Heroku), enable trust proxy so secure cookies work correctly
if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

// Session and locals middleware
app.use(sessionMiddleware);
app.use(attachLocals);

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/barangay-malimba';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {})
.catch(err => console.log('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, required: true },
  unitNumber: { type: String, required: true },
  address: { type: String, default: '' },
  avatarUrl: { type: String, default: '' },
  password: { type: String, required: true },
  role: { type: String, default: 'resident' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date }
});

// Admin Schema
const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  email: { type: String, required: true },
  role: { type: String, default: 'admin' },
  createdAt: { type: Date, default: Date.now }
});

// Check if models already exist to prevent OverwriteModelError
const User = mongoose.models.User || mongoose.model('User', userSchema);
const Admin = mongoose.models.Admin || mongoose.model('Admin', adminSchema);

// Create initial admin account if none exists
async function createInitialAdmin() {
  try {
    const adminCount = await Admin.countDocuments();
    
    if (adminCount === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      const admin = new Admin({
        username: 'admin',
        password: hashedPassword,
        email: 'admin@communityportal.com',
        role: 'admin'
      });
      
      await admin.save();
    }
  } catch (error) {
    console.error('Error creating initial admin:', error);
  }
}

// Authentication middleware moved to ./middleware/mw

// Routes
app.use('/', require('./routes/index'));
app.use('/admin', require('./routes/admin'));
app.use('/users', require('./routes/user'));

// Start inventory monitor
const inventoryMonitor = require('./jobs/inventoryMonitor');
inventoryMonitor.start();

// Start schedule expiry manager
const scheduleExpiry = require('./jobs/scheduleExpiry');
scheduleExpiry.initializeScheduleExpiry();

// Home route handled in routes/index.js (SSR with latest announcements)

// User Registration Route
app.post('/user/register', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, unitNumber, password, confirmPassword } = req.body;

    // Validation
    if (!firstName || !lastName || !email || !phone || !unitNumber || !password) {
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
        { unitNumber: unitNumber }
      ]
    });

    if (existingUser) {
      if (existingUser.email === email.toLowerCase()) {
        return res.json({ 
          success: false, 
          message: 'Email already registered' 
        });
      }
      if (existingUser.unitNumber === unitNumber) {
        return res.json({ 
          success: false, 
          message: 'Unit number already registered' 
        });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const user = new User({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      unitNumber: unitNumber.trim(),
      password: hashedPassword
    });

    await user.save();

    // Send welcome email
    try {
      await sendWelcomeEmail(email, firstName, lastName);
      console.log(`✅ Welcome email sent to: ${email}`);
    } catch (emailError) {
      console.error('❌ Failed to send welcome email:', emailError.message);
      // Don't fail registration if email fails
    }

    res.json({ 
      success: true, 
      message: 'Registration successful! You can now login.' 
    });

  } catch (error) {
    console.error('Registration error:', error);
    
    if (error.code === 11000) {
      return res.json({ 
        success: false, 
        message: 'Email or unit number already exists' 
      });
    }
    
    res.json({ 
      success: false, 
      message: 'Server error during registration. Please try again.' 
    });
  }
});

// User Login Route
app.post('/user/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    if (!user.isActive) {
      return res.json({ 
        success: false, 
        message: 'Account is deactivated. Please contact administration.' 
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return res.json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Create session
    req.session.userId = user._id;
    req.session.user = {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      unitNumber: user.unitNumber,
      role: user.role,
      avatarUrl: user.avatarUrl || ''
    };
    req.session.avatarUrl = user.avatarUrl || '';

    res.json({ 
      success: true, 
      message: 'Login successful',
      redirectUrl: '/user/dashboard',
      user: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        unitNumber: user.unitNumber
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.json({ 
      success: false, 
      message: 'Server error. Please try again.' 
    });
  }
});

// Admin Login Route
app.post('/admin/login', async (req, res) => {
  try {
    const { username, password, recaptchaToken } = req.body;
    
    // Verify reCAPTCHA
    if (!recaptchaToken) {
      return res.json({
        success: false,
        message: 'Please complete the reCAPTCHA verification'
      });
    }

    const isRecaptchaValid = await verifyRecaptcha(recaptchaToken);
    if (!isRecaptchaValid) {
      return res.json({
        success: false,
        message: 'reCAPTCHA verification failed. Please try again.'
      });
    }
    
    // Find admin by username
    const admin = await Admin.findOne({ username });
    
    if (!admin) {
      return res.json({ 
        success: false, 
        message: 'Invalid username or password' 
      });
    }
    
    // Check password
    const isMatch = await bcrypt.compare(password, admin.password);
    
    if (!isMatch) {
      return res.json({ 
        success: false, 
        message: 'Invalid username or password' 
      });
    }
    
    // Create session
    req.session.adminId = admin._id;
    req.session.username = admin.username;
    req.session.role = admin.role;
    req.session.admin = {
      id: admin._id,
      username: admin.username,
      email: admin.email,
      role: admin.role
    };
    
    res.json({ 
      success: true, 
      message: 'Login successful',
      redirectUrl: '/admin/dashboard',
      user: {
        username: admin.username,
        role: admin.role
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.json({ 
      success: false, 
      message: 'Server error. Please try again.' 
    });
  }
});

// User Dashboard Route (protected)
app.get('/user/dashboard', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    
    if (!user) {
      req.session.destroy();
      return res.redirect('/user/login');
    }
    
    res.render('user-dashboard', {
      title: 'Resident Dashboard',
      user: user,
      activePage: 'dashboard'
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    req.session.destroy();
    res.redirect('/user/login');
  }
});

// Admin Dashboard Route (protected)
app.get('/admin/dashboard', requireAdminAuth, async (req, res) => {
  try {
    const admin = await Admin.findById(req.session.adminId);
    const users = await User.find({}, { password: 0 }).sort({ createdAt: -1 });
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    
    res.render('admin-dashboard', {
      title: 'Admin Dashboard',
      username: req.session.username,
      admin: admin,
      users: users,
      totalUsers: totalUsers,
      activeUsers: activeUsers,
      activePage: 'dashboard'
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.redirect('/');
  }
});

// User Logout Route (GET)
app.get('/user/logout', (req, res) => {
  const cookieName = process.env.SESSION_NAME || 'sid';
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    // Best-effort cookie clear
    try { res.clearCookie(cookieName, { path: '/' }); } catch (_) {}
    res.redirect('/');
  });
});

// Admin Logout Routes
// Support both GET (redirect) and POST (JSON) since some admin pages use fetch() and others use location.href
app.get('/admin/logout', (req, res) => {
  const cookieName = process.env.SESSION_NAME || 'sid';
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    try { res.clearCookie(cookieName, { path: '/' }); } catch (_) {}
    res.redirect('/');
  });
});

app.post('/admin/logout', (req, res) => {
  const cookieName = process.env.SESSION_NAME || 'sid';
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ success: false, message: 'Logout failed' });
    }
    try { res.clearCookie(cookieName, { path: '/' }); } catch (_) {}
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// Get all users (for admin - protected)
app.get('/api/user', requireAdminAuth, async (req, res) => {
  try {
    const users = await User.find({}, { password: 0 });
    res.json({ success: true, users });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.json({ success: false, message: 'Error fetching users' });
  }
});

// Get user profile (protected)
app.get('/api/user/profile', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId, { password: 0 });
    res.json({ success: true, user });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.json({ success: false, message: 'Error fetching profile' });
  }
});

// Centralized error and 404 handlers
app.use(errorHandler);
app.use(notFoundHandler);

// Start server with EADDRINUSE fallback
function startServer(port, attempts = 0) {
  const server = app.listen(port, async () => {
    console.log(`Server running on port ${port}`);
    console.log(`Visit: http://localhost:${port}`);

    // Create initial admin account
    await createInitialAdmin();
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE' && attempts < 10) {
      const nextPort = port + 1;
      console.warn(`Port ${port} is in use. Trying port ${nextPort}...`);
      startServer(nextPort, attempts + 1);
    } else {
      console.error('Failed to start server:', err);
      process.exit(1);
    }
  });
}

startServer(Number(PORT));