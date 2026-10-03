document.addEventListener('DOMContentLoaded', function () {
    'use strict';

    let allowRegistration = true;
    let isAuthenticated = false;
    let dashboardUrl = '/users/dashboard';
    try {
        const configElement = document.getElementById('home-config');
        const config = configElement ? JSON.parse(configElement.textContent || '{}') : {};
        allowRegistration = config.allowUserRegistration !== false;
        isAuthenticated = config.isAuthenticated === true;
        if (config.dashboardUrl === '/users/dashboard' || config.dashboardUrl === '/admin/dashboard') dashboardUrl = config.dashboardUrl;
    } catch (_) {
        // Keep the default when configuration cannot be read.
    }
    window.ALLOW_USER_REGISTRATION = allowRegistration;

    const menuToggle = document.getElementById('menu-toggle');
    const navigation = document.getElementById('primary-navigation');
    function closeMenu() {
        if (!menuToggle || !navigation) return;
        menuToggle.setAttribute('aria-expanded', 'false');
        menuToggle.setAttribute('aria-label', 'Open navigation menu');
        navigation.classList.remove('active');
    }
    if (menuToggle && navigation) {
        menuToggle.addEventListener('click', function () {
            const expanded = menuToggle.getAttribute('aria-expanded') !== 'true';
            menuToggle.setAttribute('aria-expanded', String(expanded));
            menuToggle.setAttribute('aria-label', expanded ? 'Close navigation menu' : 'Open navigation menu');
            navigation.classList.toggle('active', expanded);
        });
        navigation.addEventListener('click', function (event) {
            if (event.target.closest('a')) closeMenu();
        });
        document.addEventListener('click', function (event) {
            if (!navigation.contains(event.target) && !menuToggle.contains(event.target)) closeMenu();
        });
        window.addEventListener('resize', function () {
            if (window.innerWidth > 960) closeMenu();
        });
    }

    const loginModal = document.getElementById('resident-modal');
    const registerModal = document.getElementById('register-modal');
    const backgroundElements = Array.from(document.querySelectorAll('body > header, body > main, body > footer, body > .utility-bar, body > .skip-link'));
    const inertStates = new Map();
    let activeModal = null;
    let restoreFocus = null;
    let bodyOverflow = '';

    function focusableElements(modal) {
        return Array.from(modal.querySelectorAll('a[href], button, input, select, textarea, iframe, [tabindex]'))
            .filter(function (element) {
                return !element.disabled && element.tabIndex >= 0 && element.getClientRects().length > 0;
            });
    }

    // Google renders its challenge outside the dialog. Let its own focus handling
    // take over while the challenge is visible so verification remains usable.
    function captchaChallengeIsVisible() {
        return Array.from(document.querySelectorAll('iframe')).some(function (frame) {
            try {
                const url = new URL(frame.src);
                const bounds = frame.getBoundingClientRect();
                return /(^|\.)google\.com$|(^|\.)recaptcha\.net$/.test(url.hostname)
                    && url.pathname.includes('/recaptcha/') && url.pathname.includes('bframe')
                    && bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0 && bounds.right > 0
                    && bounds.top < window.innerHeight && bounds.left < window.innerWidth
                    && getComputedStyle(frame).visibility !== 'hidden';
            } catch (_) {
                return false;
            }
        });
    }

    function focusModal(modal) {
        const focusable = focusableElements(modal);
        const firstInput = focusable.find(function (element) {
            return (element.tagName === 'INPUT' || element.tagName === 'SELECT') && element.type !== 'checkbox';
        });
        const firstFocusable = firstInput || focusable[0];
        if (firstFocusable) firstFocusable.focus({ preventScroll: true });
    }

    function openModal(modal) {
        if (!modal) return;
        if (modal === registerModal && !allowRegistration) {
            alert('The system is under maintenance. Registration is currently disabled.');
            return;
        }
        const triggeringElement = document.activeElement;
        const returnToMenu = navigation && navigation.contains(triggeringElement)
            && menuToggle && menuToggle.getClientRects().length > 0;
        closeMenu();
        if (!activeModal) {
            restoreFocus = returnToMenu ? menuToggle : triggeringElement;
            bodyOverflow = document.body.style.overflow;
            backgroundElements.forEach(function (element) {
                inertStates.set(element, element.inert);
                element.inert = true;
            });
        } else if (activeModal !== modal) {
            activeModal.classList.remove('active');
            activeModal.style.display = 'none';
            activeModal.setAttribute('aria-hidden', 'true');
        }
        activeModal = modal;
        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(function () {
            if (activeModal === modal) focusModal(modal);
        });
    }

    function closeModal() {
        if (!activeModal) return;
        activeModal.classList.remove('active');
        activeModal.style.display = 'none';
        activeModal.setAttribute('aria-hidden', 'true');
        activeModal = null;
        document.body.style.overflow = bodyOverflow;
        backgroundElements.forEach(function (element) {
            element.inert = inertStates.get(element) || false;
        });
        inertStates.clear();
        const focusTarget = restoreFocus && restoreFocus.isConnected && restoreFocus.getClientRects().length > 0
            && !restoreFocus.closest('.modal') ? restoreFocus
            : menuToggle && menuToggle.getClientRects().length > 0 ? menuToggle : null;
        if (focusTarget) focusTarget.focus({ preventScroll: true });
    }

    document.querySelectorAll('[data-open-login], #resident-login-btn, .resident-login-btn, #login-link').forEach(function (trigger) {
        trigger.addEventListener('click', function (event) {
            if (isAuthenticated && trigger.hasAttribute('data-open-login') && trigger.id !== 'login-link') return;
            event.preventDefault();
            openModal(loginModal);
        });
    });
    document.querySelectorAll('[data-open-register], #register-link').forEach(function (trigger) {
        trigger.addEventListener('click', function (event) {
            event.preventDefault();
            openModal(registerModal);
        });
    });
    document.querySelectorAll('.close-modal').forEach(function (button) {
        button.addEventListener('click', closeModal);
    });
    [loginModal, registerModal].forEach(function (modal) {
        if (!modal) return;
        modal.setAttribute('aria-hidden', 'true');
        modal.addEventListener('click', function (event) {
            if (event.target === modal) closeModal();
        });
    });
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            if (captchaChallengeIsVisible()) return;
            if (activeModal) closeModal();
            else if (menuToggle && menuToggle.getAttribute('aria-expanded') === 'true') {
                closeMenu();
                menuToggle.focus();
            }
        }
        if (event.key !== 'Tab' || !activeModal || captchaChallengeIsVisible()) return;
        const focusable = focusableElements(activeModal);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first) {
            event.preventDefault();
            return;
        }
        if (event.shiftKey && (document.activeElement === first || !activeModal.contains(document.activeElement))) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !activeModal.contains(document.activeElement))) {
            event.preventDefault();
            first.focus();
        }
    });
    document.addEventListener('focusin', function (event) {
        if (activeModal && !activeModal.contains(event.target) && !captchaChallengeIsVisible()) focusModal(activeModal);
    });

    function handleAuthHash() {
        if (isAuthenticated && (window.location.hash === '#login' || window.location.hash === '#register')) {
            window.location.href = dashboardUrl;
            return;
        }
        if (window.location.hash === '#login') openModal(loginModal);
        if (window.location.hash === '#register') openModal(registerModal);
    }
    window.addEventListener('hashchange', handleAuthHash);

    function captchaResponse(widgetIndex) {
        try {
            if (!window.grecaptcha || typeof window.grecaptcha.getResponse !== 'function') {
                alert('Verification is still loading. Please try again in a moment.');
                return '';
            }
            const token = window.grecaptcha.getResponse(widgetIndex);
            if (!token) alert('Please complete the reCAPTCHA verification');
            return token;
        } catch (_) {
            alert('Verification is still loading. Please try again in a moment.');
            return '';
        }
    }
    function resetCaptcha(widgetIndex) {
        try {
            if (window.grecaptcha && typeof window.grecaptcha.reset === 'function') window.grecaptcha.reset(widgetIndex);
        } catch (_) {
            // An unavailable widget must not interrupt form recovery.
        }
    }
    function setLoading(button, loading) {
        button.classList.toggle('loading', loading);
        button.disabled = loading;
        button.setAttribute('aria-busy', String(loading));
    }

    const loginForm = document.getElementById('resident-form');
    if (loginForm) loginForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        const submitButton = loginForm.querySelector('button[type="submit"]');
        const identifier = document.getElementById('login-identifier').value.trim();
        const password = document.getElementById('login-password').value;
        const token = captchaResponse(0);
        if (!token) return;
        setLoading(submitButton, true);
        try {
            let response;
            if (identifier.includes('@')) {
                response = await fetch('/users/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: identifier, password: password, recaptchaToken: token })
                });
            } else {
                const parameters = new URLSearchParams({ username: identifier, password: password, recaptchaToken: token });
                response = await fetch('/admin/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: parameters
                });
            }
            const data = await response.json();
            if (data.success) {
                closeModal();
                if (!identifier.includes('@')) window.location.href = '/admin/dashboard';
                else if (data.redirectUrl) window.location.href = data.redirectUrl;
                else window.location.reload();
            } else {
                alert(data.message || 'Login failed');
                resetCaptcha(0);
            }
        } catch (error) {
            console.error('Login error:', error);
            alert('Server error during login. Please try again.');
            resetCaptcha(0);
        } finally {
            setLoading(submitButton, false);
        }
    });

    const registerForm = document.getElementById('register-form');
    const steps = [1, 2, 3].map(function (number) { return document.getElementById('register-step-' + number); });
    function showStep(number, focus) {
        steps.forEach(function (step, index) {
            if (!step) return;
            step.hidden = index !== number - 1;
            step.style.display = index === number - 1 ? '' : 'none';
            const indicator = document.getElementById('step-indicator-' + (index + 1));
            if (indicator) {
                indicator.classList.toggle('active', index === number - 1);
                if (index === number - 1) indicator.setAttribute('aria-current', 'step');
                else indicator.removeAttribute('aria-current');
            }
        });
        if (focus && steps[number - 1]) {
            const first = steps[number - 1].querySelector('input, select');
            if (first) first.focus();
        }
    }
    function invalidField(id, message) {
        alert(message);
        document.getElementById(id).focus();
        return false;
    }
    function validateStep1() {
        const name = document.getElementById('register-name').value.trim();
        const phone = document.getElementById('register-phone').value.trim();
        const unit = document.getElementById('register-unit').value.trim();
        if (!name) return invalidField('register-name', 'Full Name is required');
        if (!/^\+\d{1,3}\d{7,12}$/.test(phone)) return invalidField('register-phone', 'Phone number must be in the format +<countrycode><number>');
        if (phone.length < 11 || phone.length > 15) return invalidField('register-phone', 'Phone number must be between 11 and 15 characters');
        if (!unit) return invalidField('register-unit', 'Purok is required');
        return true;
    }
    function validateStep2() {
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value;
        const confirmation = document.getElementById('register-confirm-password').value;
        if (!/^([a-zA-Z0-9_.+-]+)@gmail\.com$/.test(email)) return invalidField('register-email', 'Email must be a valid Gmail address');
        if (password.length < 8) return invalidField('register-password', 'Password must be at least 8 characters');
        if (!confirmation || password !== confirmation) return invalidField('register-confirm-password', 'Passwords do not match');
        return true;
    }
    function validateStep3() {
        if (!document.getElementById('terms-agreement').checked) return invalidField('terms-agreement', 'You must agree to the Terms of Service and Privacy Policy');
        return true;
    }
    if (registerForm) {
        // Validate each step explicitly; native validation cannot focus required
        // fields in the other, hidden steps when the final form is submitted.
        registerForm.noValidate = true;
        showStep(1, false);
        document.getElementById('next-step-1').addEventListener('click', function () {
            if (validateStep1()) showStep(2, true);
        });
        document.getElementById('next-step-2').addEventListener('click', function () {
            if (validateStep2()) showStep(3, true);
        });
        document.getElementById('prev-step-2').addEventListener('click', function () { showStep(1, true); });
        document.getElementById('prev-step-3').addEventListener('click', function () { showStep(2, true); });
        registerForm.addEventListener('submit', async function (event) {
            event.preventDefault();
            if (!allowRegistration) {
                alert('The system is under maintenance. Registration is currently disabled.');
                return;
            }
            const submitButton = registerForm.querySelector('button[type="submit"]');
            if (submitButton.disabled) return;
            // Recheck earlier steps in case browser autofill changed their values.
            showStep(1, false);
            if (!validateStep1()) return;
            showStep(2, false);
            if (!validateStep2()) return;
            showStep(3, false);
            if (!validateStep3()) return;
            const token = captchaResponse(1);
            if (!token) return;
            const names = document.getElementById('register-name').value.trim().split(' ').filter(Boolean);
            const firstName = names.shift() || '';
            const lastName = names.join(' ') || '';
            const payload = {
                firstName: firstName, lastName: lastName,
                email: document.getElementById('register-email').value.trim(),
                phone: document.getElementById('register-phone').value.trim(),
                unitNumber: document.getElementById('register-unit').value.trim(),
                password: document.getElementById('register-password').value,
                confirmPassword: document.getElementById('register-confirm-password').value,
                recaptchaToken: token
            };
            setLoading(submitButton, true);
            try {
                const response = await fetch('/users/register', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                });
                const data = await response.json();
                if (data.success) {
                    alert(data.message || 'Registration submitted. Please wait for the approval of the admin.');
                    openModal(loginModal);
                    resetCaptcha(1);
                } else {
                    alert(data.message || 'Registration failed');
                    resetCaptcha(1);
                }
            } catch (error) {
                console.error('Registration error:', error);
                alert('Server error during registration. Please try again.');
                resetCaptcha(1);
            } finally {
                setLoading(submitButton, false);
            }
        });
    }

    const passwordInput = document.getElementById('register-password');
    const confirmationInput = document.getElementById('register-confirm-password');
    const strengthBar = document.getElementById('password-strength-bar');
    function updateConfirmation() {
        if (!confirmationInput || !passwordInput) return;
        confirmationInput.setAttribute('aria-invalid', String(confirmationInput.value.length > 0 && confirmationInput.value !== passwordInput.value));
    }
    if (passwordInput && strengthBar) passwordInput.addEventListener('input', function () {
        const password = passwordInput.value;
        const strength = [password.length >= 8, /[a-z]/.test(password), /[A-Z]/.test(password), /[0-9]/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length;
        strengthBar.className = 'password-strength-bar';
        if (password) strengthBar.classList.add(strength <= 2 ? 'strength-weak' : strength <= 4 ? 'strength-medium' : 'strength-strong');
        updateConfirmation();
    });
    if (confirmationInput) confirmationInput.addEventListener('input', updateConfirmation);

    const phoneInput = document.getElementById('register-phone');
    if (phoneInput) {
        const prefix = '+63';
        if (!phoneInput.value) phoneInput.value = prefix;
        phoneInput.addEventListener('keydown', function (event) {
            const start = phoneInput.selectionStart || 0;
            if ((event.key === 'Backspace' && start <= prefix.length) || (event.key === 'Delete' && start < prefix.length)) event.preventDefault();
        });
        phoneInput.addEventListener('focus', function () {
            requestAnimationFrame(function () { phoneInput.setSelectionRange(phoneInput.value.length, phoneInput.value.length); });
        });
        phoneInput.addEventListener('input', function () {
            let value = phoneInput.value.replace(/[^\d+]/g, '');
            if (!value.startsWith(prefix)) value = prefix + value.replace(/^\++/, '').replace(/^63/, '');
            phoneInput.value = value.slice(0, 15);
        });
    }

    const dateFormatter = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
    function createElement(tag, className, content) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (content !== undefined) element.textContent = content;
        if (tag === 'i') {
            const glyph = String(className || '').split(/\s+/).find(function (token) {
                return token.startsWith('fa-') && token !== 'fa-solid' && token !== 'fa-regular';
            });
            if (glyph) {
                const namespace = 'http://www.w3.org/2000/svg';
                const svg = document.createElementNS(namespace, 'svg');
                svg.setAttribute('viewBox', '0 0 24 24');
                svg.setAttribute('fill', 'none');
                svg.setAttribute('stroke', 'currentColor');
                svg.setAttribute('stroke-width', '1.7');
                svg.setAttribute('stroke-linecap', 'round');
                svg.setAttribute('stroke-linejoin', 'round');
                svg.setAttribute('aria-hidden', 'true');
                svg.setAttribute('focusable', 'false');
                const use = document.createElementNS(namespace, 'use');
                use.setAttribute('href', '#icon-' + glyph.slice(3));
                svg.appendChild(use);
                element.appendChild(svg);
            }
        }
        return element;
    }
    function createEmptyState() {
        const empty = createElement('div', 'announcements-empty');
        const iconContainer = createElement('span', 'empty-icon');
        const icon = createElement('i', 'fas fa-bullhorn');
        icon.setAttribute('aria-hidden', 'true');
        iconContainer.appendChild(icon);
        const signIn = createElement('a', 'text-link', 'Sign in for your personal updates ');
        signIn.href = '/users/login';
        signIn.setAttribute('data-open-login', '');
        signIn.addEventListener('click', function (event) {
            if (isAuthenticated) return;
            event.preventDefault();
            openModal(loginModal);
        });
        const arrow = createElement('i', 'fas fa-arrow-right');
        arrow.setAttribute('aria-hidden', 'true');
        signIn.appendChild(arrow);
        empty.append(iconContainer, createElement('h3', '', 'You’re all caught up'), createElement('p', '', 'New barangay announcements and advisories will appear here.'), signIn);
        return empty;
    }
    function createAnnouncement(announcement) {
        const item = createElement('a', 'announce-item');
        item.href = '/users/announcements';
        item.setAttribute('data-open-login', '');
        item.addEventListener('click', function (event) {
            if (isAuthenticated) return;
            event.preventDefault();
            openModal(loginModal);
        });
        const type = String(announcement.type || 'general');
        item.dataset.type = type;
        const badgeType = ['urgent', 'emergency', 'maintenance', 'event'].includes(type) ? type : 'general';
        const thumbnail = createElement('div', 'thumb');
        let imageUrl = null;
        try {
            const url = new URL(announcement.imageUrl, window.location.origin);
            if (announcement.imageUrl && ['http:', 'https:'].includes(url.protocol)) imageUrl = url.href;
        } catch (_) { /* Use the placeholder when the image URL is invalid. */ }
        if (imageUrl) {
            const image = createElement('img');
            image.src = imageUrl;
            image.alt = announcement.title ? String(announcement.title) : 'Announcement image';
            image.loading = 'lazy';
            thumbnail.appendChild(image);
        } else {
            const icon = createElement('i', 'fas fa-bullhorn');
            icon.setAttribute('aria-hidden', 'true');
            thumbnail.appendChild(icon);
        }
        const content = createElement('div', 'content');
        const meta = createElement('div', 'meta');
        meta.appendChild(createElement('span', 'badge badge-' + badgeType, type.toUpperCase()));
        const date = new Date(announcement.createdAt);
        if (announcement.createdAt && !Number.isNaN(date.getTime())) {
            const time = createElement('time', 'announcement-date', dateFormatter.format(date));
            time.dateTime = date.toISOString();
            meta.appendChild(time);
        }
        const text = String(announcement.content || '').replace(/<[^>]*>/g, '');
        const snippet = text.length > 140 ? text.slice(0, 140) + '…' : text;
        const readMore = createElement('span', 'announcement-link', 'Read announcement ');
        const arrow = createElement('i', 'fas fa-arrow-right');
        arrow.setAttribute('aria-hidden', 'true');
        readMore.appendChild(arrow);
        content.append(meta, createElement('h3', 'title', announcement.title || 'Community announcement'), createElement('p', 'excerpt', snippet), readMore);
        item.append(thumbnail, content);
        return item;
    }
    async function fetchAnnouncements() {
        try {
            let response = await fetch('/admin/api/announcements/active');
            if (!response.ok) response = await fetch('/api/announcements/active');
            if (!response.ok) return null;
            const announcements = await response.json();
            return Array.isArray(announcements)
                ? announcements.filter(function (item) { return item && typeof item === 'object'; })
                : null;
        } catch (_) {
            return null;
        }
    }
    const announcementList = document.getElementById('announcements-list');
    if (announcementList) fetchAnnouncements().then(function (announcements) {
        if (announcements === null) return; // Preserve the server-rendered preview on failure.
        const fragment = document.createDocumentFragment();
        announcements.slice(0, 3).forEach(function (announcement) { fragment.appendChild(createAnnouncement(announcement)); });
        if (!announcements.length) fragment.appendChild(createEmptyState());
        announcementList.replaceChildren(fragment);
        announcementList.dataset.ssr = announcements.length ? '1' : '0';
    });

    handleAuthHash();
});
