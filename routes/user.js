const express = require('express');
const router = express.Router();
const User = require('../models/User');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { addClient, removeClient, broadcast } = require('../utils/realtime');
const Notification = require('../models/notification');
const { sendOTPEmail, verifyOTP, generateOTP } = require('../utils/emailService');
const bcrypt = require('bcryptjs');

// User registration
router.post('/register', async (req, res) => {
    try {
        const { firstName, lastName, email, phone, unitNumber, password } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User already exists with this email'
            });
        }

        // Create new user (inactive until approved by admin)
        const newUser = new User({
            firstName,
            lastName,
            email,
            phone,
            unitNumber,
            password,
            isActive: false
        });

        await newUser.save();

        res.json({
            success: true,
            message: 'Registration successful! You can now login.'
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed. Please try again.'
        });
    }
});

// User login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user and include password
        const user = await User.findOne({ email }).select('+password');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Check if user is active (approved by admin)
        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                message: 'Your account is pending approval by an administrator. Please wait for approval before logging in.'
            });
        }

        // Check password
        const isPasswordCorrect = await user.correctPassword(password, user.password);
        if (!isPasswordCorrect) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Update last login and login count
        user.lastLogin = new Date();
        user.loginCount += 1;
        await user.save();

        // Set session
        req.session.userId = user._id;
        req.session.userRole = user.role;
        req.session.userName = user.getFullName();
        req.session.userEmail = user.email;

        res.json({
            success: true,
            message: 'Login successful!',
            user: {
                id: user._id,
                name: user.getFullName(),
                role: user.role,
                email: user.email
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during login'
        });
    }
});

// User dashboard
router.get('/dashboard', async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/');
    }

    try {
        // Check if user is still active
        const user = await User.findById(req.session.userId);
        if (!user || !user.isActive) {
            req.session.destroy();
            return res.redirect('/?message=Account deactivated by administrator');
        }

        res.render('user-dashboard', {
            title: 'User Dashboard',
            user: {
                id: user._id,
                firstName: user.firstName || (user.name ? user.name.split(' ')[0] : ''),
                name: user.getFullName ? user.getFullName() : `${user.firstName || ''} ${user.lastName || ''}`.trim(),
                email: user.email,
                role: user.role,
                unitNumber: user.unitNumber || ''
            }
        });
    } catch (error) {
        console.error('Dashboard access error:', error);
        req.session.destroy();
        res.redirect('/');
    }
});

// User settings page (basic placeholder)
router.get('/settings', async (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/');
    }

    try {
        const user = await User.findById(req.session.userId);
        if (!user || !user.isActive) {
            req.session.destroy();
            return res.redirect('/?message=Account deactivated by administrator');
        }

        res.render('user-settings', {
            title: 'Account Settings',
            user: {
                id: user._id,
                firstName: user.firstName || (user.name ? user.name.split(' ')[0] : ''),
                name: user.getFullName ? user.getFullName() : `${user.firstName || ''} ${user.lastName || ''}`.trim(),
                email: user.email,
                phone: user.phone || '',
                address: user.address || '',
                avatarUrl: user.avatarUrl || '',
                role: user.role,
                unitNumber: user.unitNumber || ''
            }
        });
    } catch (error) {
        console.error('Settings access error:', error);
        req.session.destroy();
        res.redirect('/');
    }
});

// User's appointments (JSON) for dashboard calendar
router.get('/api/appointments', async (req, res) => {
    try {
        if (!req.session || !req.session.userId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        const Appointment = require('../models/appointment');
        const userId = req.session.userId;

        // Fetch user's appointments only
        const appointments = await Appointment.find({ patientId: userId })
            .sort({ appointmentDate: 1, appointmentTime: 1 })
            .lean();

        // Map to FullCalendar-compatible events: exclude cancelled, pending, and no-show; only scheduled/completed
        const events = appointments
            .filter(apt => !['cancelled', 'pending', 'no-show'].includes(apt.status))
            .map(apt => ({
                id: String(apt._id),
                title: `${apt.appointmentType || 'Appointment'}`,
                start: `${apt.appointmentDate}T${apt.appointmentTime}`,
                extendedProps: {
                    status: apt.status,
                    type: apt.appointmentType,
                    notes: apt.notes || ''
                }
            }));

        res.json({ success: true, events });
    } catch (error) {
        console.error('Error loading user appointments:', error);
        res.status(500).json({ success: false, error: 'Failed to load appointments' });
    }
});

// User logout
router.get('/logout', async (req, res) => {
    try {
        const userId = req.session && req.session.userId;
        if (userId) {
            try {
                const user = await User.findById(userId);
                if (user) {
                    user.lastLogout = new Date();
                    // Optionally mark inactive if you want 'Online' to strictly reflect current sessions
                    user.isActive = false;
                    await user.save();
                    // Broadcast offline event
                    broadcast('userStatus', { userId: String(user._id), isActive: false, lastLogin: user.lastLogin || null });
                }
            } catch (e) {
                // ignore broadcast errors
            }
        }
    } catch (e) {}

    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/');
    });
});

// Forgot password - send OTP
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.json({
                success: false,
                message: 'Email is required'
            });
        }

        const normalizedEmail = String(email).trim().toLowerCase();

        // Optional: enforce Gmail only if desired by UI copy
        // if (!/@gmail\.com$/.test(normalizedEmail)) {
        //     return res.json({ success: false, message: 'Please enter a valid Gmail address' });
        // }

        // Ensure user exists before sending OTP
        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            return res.json({
                success: false,
                message: 'No account found with this email address. Please register first.'
            });
        }

        // Generate and send OTP
        const otp = generateOTP();
        await sendOTPEmail(normalizedEmail, otp);

        return res.json({ success: true, message: 'OTP sent' });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send OTP. Please try again.'
        });
    }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.json({
                success: false,
                message: 'Email and OTP are required'
            });
        }

        const result = verifyOTP(email, otp);

        if (!result.valid) {
            return res.json({
                success: false,
                message: result.message
            });
        }

        res.json({
            success: true,
            message: result.message
        });
    } catch (error) {
        console.error('OTP verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to verify OTP. Please try again.'
        });
    }
});

// Reset password
router.post('/reset-password', async (req, res) => {
    try {
        const { email, newPassword } = req.body;

        if (!email || !newPassword) {
            return res.json({
                success: false,
                message: 'Email and new password are required'
            });
        }

        if (newPassword.length < 6) {
            return res.json({
                success: false,
                message: 'Password must be at least 6 characters long'
            });
        }

        // Find user
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.json({
                success: false,
                message: 'No account found with this email address. Please register first.'
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        await user.save();

        res.json({
            success: true,
            message: 'Password reset successfully! You can now login with your new password.'
        });
    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reset password. Please try again.'
        });
    }
});

// Forgot password page
router.get('/forgot-password', (req, res) => {
    res.render('forgot-password', {
        title: 'Forgot Password'
    });
});

module.exports = router;
// SSE stream for user clients (residents) to get realtime updates
router.get('/events', (req, res) => {
    // Only allow logged-in users
    if (!req.session || !req.session.userId) {
        return res.status(401).end();
    }

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

// -------- Settings APIs --------

// Update profile fields (name, phone, address) — email is immutable
router.post('/settings/profile', async (req, res) => {
    try {
        if (!req.session.userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
        const { name, email, phone, address } = req.body;
        const user = await User.findById(req.session.userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        // Block email updates explicitly
        if (typeof email === 'string' && email.trim() && email.toLowerCase().trim() !== user.email) {
            return res.status(400).json({ success: false, message: 'Email cannot be changed' });
        }

        if (name && name.trim()) {
            const parts = name.trim().split(/\s+/);
            user.firstName = parts.shift();
            user.lastName = parts.length ? parts.join(' ') : '';
        }
        if (phone && phone.trim()) user.phone = phone.trim();
        if (typeof address === 'string') user.address = address.trim();

        await user.save();
        res.json({ success: true, message: 'Profile updated', user: {
            id: user._id,
            name: user.getFullName ? user.getFullName() : `${user.firstName} ${user.lastName}`.trim(),
            email: user.email,
            phone: user.phone,
            address: user.address,
            unitNumber: user.unitNumber
        }});
    } catch (error) {
        console.error('Profile update error:', error);
        // No email updates allowed; keep generic error handling
        res.status(500).json({ success: false, message: 'Failed to update profile' });
    }
});

// Change password
router.post('/settings/password', async (req, res) => {
    try {
        if (!req.session.userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) return res.json({ success: false, message: 'Missing fields' });
        if (newPassword.length < 6) return res.json({ success: false, message: 'New password must be at least 6 characters' });

        const user = await User.findById(req.session.userId).select('+password');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) return res.json({ success: false, message: 'Current password is incorrect' });

    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    await user.save();
        res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ success: false, message: 'Failed to update password' });
    }
});

// Multer setup for avatar uploads
const avatarsDir = path.join(__dirname, '..', 'public', 'uploads', 'avatars');
if (!fs.existsSync(avatarsDir)) {
    fs.mkdirSync(avatarsDir, { recursive: true });
}
const storage = multer.diskStorage({
    destination: function(req, file, cb) { cb(null, avatarsDir); },
    filename: function(req, file, cb) {
        const ext = path.extname(file.originalname);
        cb(null, `${req.session.userId}-${Date.now()}${ext}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: function(req, file, cb) {
        const allowed = ['image/jpeg', 'image/png', 'image/gif'];
        if (!allowed.includes(file.mimetype)) {
            return cb(new Error('Only JPG, PNG, or GIF files are allowed'));
        }
        cb(null, true);
    }
});

// Upload/change photo
router.post('/settings/photo', upload.single('photo'), async (req, res) => {
    try {
        if (!req.session.userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
        const relPath = `/uploads/avatars/${req.file.filename}`;
        const user = await User.findById(req.session.userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        user.avatarUrl = relPath;
        await user.save();
        // keep session avatar in sync so views rendered from session can show it immediately
        try { req.session.avatarUrl = relPath; } catch (e) {}
        res.json({ success: true, message: 'Photo updated', avatarUrl: relPath });
    } catch (error) {
        console.error('Photo upload error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to upload photo' });
    }
});

// Delete account
router.post('/settings/delete-account', async (req, res) => {
    try {
        if (!req.session.userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
        const { confirm } = req.body;
        if (confirm !== 'DELETE') return res.json({ success: false, message: 'Confirmation text mismatch' });

        await User.deleteOne({ _id: req.session.userId });
        req.session.destroy(() => {});
        res.json({ success: true, message: 'Account deleted' });
    } catch (error) {
        console.error('Delete account error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete account' });
    }
});

// ---------------- Notifications APIs ----------------

// List notifications for current user
router.get('/api/notifications', async (req, res) => {
    try {
        if (!req.session || !req.session.userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
        const userId = req.session.userId;
        const { unread } = req.query;
        const filter = { userId };
        if (typeof unread !== 'undefined') {
            const onlyUnread = ['1','true','yes'].includes(String(unread).toLowerCase());
            if (onlyUnread) filter.isRead = false;
        }
        const items = await Notification.find(filter).sort({ createdAt: -1 }).limit(100).lean();
        res.json({ success: true, notifications: items });
    } catch (error) {
        console.error('List notifications error:', error);
        res.status(500).json({ success: false, error: 'Failed to load notifications' });
    }
});

// Mark a notification as read
router.post('/api/notifications/:id/read', async (req, res) => {
    try {
        if (!req.session || !req.session.userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
        const notif = await Notification.findById(req.params.id);
        if (!notif || String(notif.userId) !== String(req.session.userId)) {
            return res.status(404).json({ success: false, error: 'Notification not found' });
        }
        notif.isRead = true;
        notif.readAt = new Date();
        await notif.save();
        res.json({ success: true });
    } catch (error) {
        console.error('Mark notification read error:', error);
        res.status(500).json({ success: false, error: 'Failed to update notification' });
    }
});

// Get unread count
router.get('/api/notifications/count', async (req, res) => {
    try {
        if (!req.session || !req.session.userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
        const count = await Notification.countDocuments({ userId: req.session.userId, isRead: false });
        res.json({ success: true, count });
    } catch (error) {
        console.error('Notifications count error:', error);
        res.status(500).json({ success: false, error: 'Failed to get count' });
    }
});
