// Mobile menu toggle
document.addEventListener('DOMContentLoaded', function() {
  const hamburger = document.querySelector('.hamburger');
  const navLinks = document.querySelector('.nav-links');
  
  if (hamburger) {
    hamburger.addEventListener('click', function() {
      navLinks.classList.toggle('active');
    });
  }
  
  // Close mobile menu when clicking outside
  document.addEventListener('click', function(event) {
    if (!event.target.closest('.nav-container') && navLinks.classList.contains('active')) {
      navLinks.classList.remove('active');
    }
  });
  
  // MongoDB connection status indicator
  const updateConnectionStatus = async () => {
    try {
      const response = await fetch('/api/status');
      const data = await response.json();
      
      const statusIndicator = document.getElementById('db-status');
      if (statusIndicator) {
        if (data.connected) {
          statusIndicator.innerHTML = '<i class="fas fa-database"></i> Database Connected';
          statusIndicator.style.color = '#568203';
        } else {
          statusIndicator.innerHTML = '<i class="fas fa-database"></i> Database Offline';
          statusIndicator.style.color = '#dc3545';
        }
      }
    } catch (error) {
      console.error('Error checking database status:', error);
    }
  };
  
  // Check connection status on page load
  updateConnectionStatus();
});