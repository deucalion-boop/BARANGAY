const sidebar = document.querySelector('.sidebar');
const mainContent = document.querySelector('.main-content');
const toggleBtn = document.querySelector('.toggle-btn');
let overlay = document.querySelector('.overlay');
const submenuToggles = document.querySelectorAll('.sidebar-menu > li > a');

// Create overlay if it doesn't exist
if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'overlay';
    document.body.appendChild(overlay);
}

// Create mobile menu button for small screens
function createMobileMenuButton() {
    if (window.innerWidth <= 768) {
        let mobileBtn = document.querySelector('.mobile-menu-btn');
        if (!mobileBtn) {
            mobileBtn = document.createElement('button');
            mobileBtn.className = 'mobile-menu-btn';
            mobileBtn.innerHTML = '<i class="fas fa-bars"></i>';
            mobileBtn.setAttribute('aria-label', 'Toggle menu');
            document.body.appendChild(mobileBtn);
            
            mobileBtn.addEventListener('click', () => {
                sidebar.classList.toggle('active');
                overlay.classList.toggle('active');
                document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
            });
        }
    } else {
        // Remove mobile button on larger screens
        const mobileBtn = document.querySelector('.mobile-menu-btn');
        if (mobileBtn) {
            mobileBtn.remove();
        }
    }
}

// Load saved sidebar state
const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
if (isCollapsed && sidebar && mainContent) {
    sidebar.classList.add('collapsed');
    mainContent.classList.add('collapsed');
}

// Toggle sidebar for desktop
if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
        if (!sidebar || !mainContent) return;
        
        if (window.innerWidth > 768) {
            // Desktop behavior
            sidebar.classList.toggle('collapsed');
            mainContent.classList.toggle('collapsed');
            localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
        } else {
            // Mobile behavior
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
            document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
        }
    });
}

// Mobile overlay click
if (overlay) {
    overlay.addEventListener('click', () => {
        if (sidebar) {
            sidebar.classList.remove('active');
        }
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    });
}

// Submenu toggle
submenuToggles.forEach(toggle => {
    if (toggle.nextElementSibling && toggle.nextElementSibling.classList.contains('submenu')) {
        toggle.addEventListener('click', (e) => {
            if (window.innerWidth > 768) {
                e.preventDefault();
                const submenu = toggle.nextElementSibling;
                submenu.classList.toggle('active');
            }
        });
    }
});

// Close sidebar on mobile when clicking outside or navigating
document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && sidebar && overlay) {
        const isClickInsideSidebar = sidebar.contains(e.target);
        const isClickOnMobileBtn = e.target.closest('.mobile-menu-btn');
        
        if (!isClickInsideSidebar && !isClickOnMobileBtn && sidebar.classList.contains('active')) {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    }
});

// Close sidebar when a menu item is clicked on mobile
document.querySelectorAll('.sidebar-menu a').forEach(link => {
    link.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    });
});

// Handle window resize
window.addEventListener('resize', () => {
    createMobileMenuButton();
    
    if (window.innerWidth > 768) {
        // Ensure sidebar is visible on desktop
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    } else {
        // Apply mobile styles
        sidebar.classList.remove('collapsed');
        mainContent.classList.remove('collapsed');
    }
});

// Enhanced table scroll hints
function initTableScrollHints() {
    const wrappers = document.querySelectorAll('.table-responsive');
    wrappers.forEach(w => {
        if (!w.querySelector('.scroll-hint')) {
            const hint = document.createElement('div');
            hint.className = 'scroll-hint';
            hint.style.cssText = `
                pointer-events: none;
                position: absolute;
                right: 0;
                top: 0;
                bottom: 0;
                width: 30px;
                background: linear-gradient(90deg, rgba(255,255,255,0), rgba(0,0,0,0.1));
                transition: opacity 0.25s ease;
                opacity: 0;
                border-radius: 0 8px 8px 0;
                z-index: 2;
            `;
            w.style.position = 'relative';
            w.appendChild(hint);

            const table = w.querySelector('table');
            function updateHint() {
                if (!table) return;
                const needsScroll = table.scrollWidth > w.clientWidth + 2;
                hint.style.opacity = needsScroll ? '1' : '0';
            }

            updateHint();
            w.addEventListener('scroll', updateHint);
            window.addEventListener('resize', updateHint);
            
            // Initial check after a brief delay to ensure proper rendering
            setTimeout(updateHint, 100);
        }
    });
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    createMobileMenuButton();
    initTableScrollHints();
    
    // Prevent body scroll when sidebar is open on mobile
    const observer = new MutationObserver(() => {
        if (window.innerWidth <= 768) {
            document.body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
        }
    });
    
    if (sidebar) {
        observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    }
});

// Handle escape key to close mobile sidebar
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && window.innerWidth <= 768 && sidebar && sidebar.classList.contains('active')) {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
});