// Admin login route
app.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
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

// Admin dashboard route (protected) - FIXED: using requireAdminAuth
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
      activeUsers: activeUsers
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.redirect('/');
  }
});

// Admin logout route
app.post('/admin/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Logout failed' });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
});