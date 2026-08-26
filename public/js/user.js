const sidebar = document.querySelector('.sidebar');
const mainContent = document.querySelector('.main-content');
const toggleBtn = document.querySelector('.toggle-btn');
let overlay = document.querySelector('.overlay');

// create overlay if not present (safety)
if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'overlay';
    document.body.appendChild(overlay);
}

// Submenu toggles (if any)
const submenuToggles = document.querySelectorAll('.sidebar-menu > li > a');

// Load saved sidebar state
const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
if (isCollapsed) {
    sidebar.classList.add('collapsed');
    if (mainContent) mainContent.classList.add('collapsed');
}

// Toggle sidebar
if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        if (mainContent) mainContent.classList.toggle('collapsed');
        localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
        if (window.innerWidth <= 768) {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
        }
    });
}

// Mobile overlay click
if (overlay) {
    overlay.addEventListener('click', () => {
        if (sidebar) sidebar.classList.remove('active');
        overlay.classList.remove('active');
    });
}

// Submenu toggle (for future nested menus)
submenuToggles.forEach(toggle => {
    if (toggle.nextElementSibling && toggle.nextElementSibling.classList.contains('submenu')) {
        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            const submenu = toggle.nextElementSibling;
            submenu.classList.toggle('active');
        });
    }
});

// Close sidebar on mobile when clicking outside
document.addEventListener('click', (e) => {
    if (window.innerWidth <= 768 && sidebar && !sidebar.contains(e.target) && toggleBtn && !toggleBtn.contains(e.target)) {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    }
});

// Table scroll hint helper (same behaviour as admin)
function initTableScrollHints() {
    const wrappers = document.querySelectorAll('.table-responsive');
    wrappers.forEach(w => {
        if (!w.querySelector('.scroll-hint')) {
            const hint = document.createElement('div');
            hint.className = 'scroll-hint';
            hint.style.pointerEvents = 'none';
            hint.style.position = 'absolute';
            hint.style.right = '0';
            hint.style.top = '0';
            hint.style.bottom = '0';
            hint.style.width = '48px';
            hint.style.background = 'linear-gradient(90deg, rgba(255,255,255,0), rgba(0,0,0,0.06))';
            hint.style.transition = 'opacity 0.25s ease';
            hint.style.opacity = '0';
            w.style.position = 'relative';
            w.appendChild(hint);

            const table = w.querySelector('table');
            function update() {
                if (!table) return;
                const need = table.scrollWidth > w.clientWidth + 2;
                hint.style.opacity = need ? '1' : '0';
            }
            update();
            w.addEventListener('scroll', update);
            window.addEventListener('resize', update);
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initTableScrollHints();
    tryInitNotificationsUI();
});

// ---------------- Notifications UI logic ----------------
function tryInitNotificationsUI() {
    const btn = document.getElementById('notif-btn');
    const badge = document.getElementById('notif-badge');
    const dropdown = document.getElementById('notif-dropdown');
    if (!btn || !badge || !dropdown) return;

    async function refreshCount() {
        try {
            const res = await fetch('/users/api/notifications/count', { credentials: 'same-origin' });
            if (!res.ok) throw new Error('count');
            const data = await res.json();
            const n = (data && data.count) ? Number(data.count) : 0;
            if (n > 0) {
                badge.style.display = 'inline-flex';
                badge.textContent = n > 99 ? '99+' : String(n);
            } else {
                badge.style.display = 'none';
            }
        } catch (e) {
            // ignore errors
        }
    }

    async function fetchList() {
        try {
            const res = await fetch('/users/api/notifications?unread=1', { credentials: 'same-origin' });
            if (!res.ok) throw new Error('list');
            const data = await res.json();
            const list = Array.isArray(data.notifications) ? data.notifications : [];
            renderDropdown(list);
        } catch (e) {
            renderDropdown([]);
        }
    }

    function timeAgo(iso) {
        try {
            const d = new Date(iso);
            const diff = (Date.now() - d.getTime()) / 1000;
            if (diff < 60) return 'just now';
            const m = Math.floor(diff/60); if (m < 60) return `${m}m ago`;
            const h = Math.floor(m/60); if (h < 24) return `${h}h ago`;
            const days = Math.floor(h/24); return `${days}d ago`;
        } catch { return ''; }
    }

    function safeText(s) { return (s || '').toString(); }

    function renderDropdown(items) {
        dropdown.innerHTML = '';
        const head = document.createElement('div');
        head.className = 'notif-head';
        head.innerHTML = `<span>Notifications</span>`;
        dropdown.appendChild(head);
        if (!items.length) {
            const empty = document.createElement('div');
            empty.className = 'notif-empty';
            empty.textContent = 'No new notifications';
            dropdown.appendChild(empty);
            return;
        }
        const listEl = document.createElement('div');
        listEl.className = 'notif-list';
        items.forEach(n => {
            const el = document.createElement('div');
            el.className = 'notif-item';
            const icon = '<div class="icon"><i class="fas fa-bell"></i></div>';
            const t = safeText(n.title);
            const msg = safeText(n.message);
            const ago = timeAgo(n.createdAt);
            el.innerHTML = `${icon}<div class="body"><div class="title" title="${t}">${t}</div><div class="msg" title="${msg}">${msg}</div><div class="time">${ago}</div></div>`;
            el.addEventListener('click', async () => {
                try {
                    await fetch(`/users/api/notifications/${n._id}/read`, { method: 'POST', credentials: 'same-origin' });
                } catch {}
                dropdown.classList.remove('open');
                refreshCount();
                if (n.actionUrl) {
                    window.location.href = n.actionUrl;
                }
            });
            listEl.appendChild(el);
        });
        dropdown.appendChild(listEl);
    }

    btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const isOpen = dropdown.classList.contains('open');
        document.querySelectorAll('.notif-dropdown.open').forEach(d => d.classList.remove('open'));
        if (!isOpen) {
            await fetchList();
            dropdown.classList.add('open');
        }
    });
    document.addEventListener('click', () => dropdown.classList.remove('open'));

    // initial and polling
    refreshCount();
    setInterval(refreshCount, 30000);
}
