(function () {
    const THEME_KEY = 'site_theme';
    const STYLE_ID = 'global-theme-toggle-styles';
    const GLOBAL_BTN_ID = 'globalThemeToggle';
    const ENABLE_FALLBACK_FLOATING_BUTTON = false;

    let currentTheme = 'dark';
    let buttonRef = null;
    let iconRef = null;

    function getStoredTheme() {
        try {
            const value = localStorage.getItem(THEME_KEY);
            return value === 'light' || value === 'dark' ? value : 'dark';
        } catch (_) {
            return 'dark';
        }
    }

    function setStoredTheme(theme) {
        try {
            localStorage.setItem(THEME_KEY, theme);
        } catch (_) {
            // ignore storage errors
        }
    }

    function applyThemeClassEarly(theme) {
        const resolvedTheme = theme === 'dark' ? 'dark' : 'light';
        currentTheme = resolvedTheme;
        document.documentElement.classList.toggle('dark-theme', resolvedTheme === 'dark');
        if (document.body) {
            document.body.classList.toggle('dark-theme', resolvedTheme === 'dark');
        }
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            /* Global theme toggle button (fallback if not in header) */
            #${GLOBAL_BTN_ID} {
                position: fixed;
                right: 16px;
                bottom: 16px;
                z-index: 9999;
                width: 40px;
                height: 40px;
                border-radius: 9999px;
                border: 1px solid var(--border);
                background: var(--bg-secondary);
                color: var(--text-secondary);
                box-shadow: var(--shadow-lg);
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            #${GLOBAL_BTN_ID}:hover {
                border-color: var(--accent-light);
                color: var(--accent);
                transform: translateY(-1px);
            }
        `;

        document.head.appendChild(style);
    }

    function getButtonLabel(theme) {
        return theme === 'dark' ? 'Activer le mode clair' : 'Activer le mode sombre';
    }

    function syncButtonUI() {
        if (!iconRef || !buttonRef) return;
        // Use SVG icons
        const sunIcon = `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="M4.93 4.93l1.41 1.41"/><path d="M17.66 17.66l1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="M6.34 17.66l-1.41 1.41"/><path d="M19.07 4.93l-1.41 1.41"/></svg>`;
        const moonIcon = `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
        const nextIcon = currentTheme === 'dark' ? sunIcon : moonIcon;
        if (iconRef.innerHTML !== nextIcon) {
            iconRef.innerHTML = nextIcon;
        }
        const label = getButtonLabel(currentTheme);
        buttonRef.setAttribute('aria-label', label);
        buttonRef.setAttribute('title', label);
    }

    function applyTheme(theme) {
        currentTheme = theme === 'dark' ? 'dark' : 'light';

        if (document.body) {
            document.body.classList.toggle('dark-theme', currentTheme === 'dark');
        }
        document.documentElement.classList.toggle('dark-theme', currentTheme === 'dark');

        setStoredTheme(currentTheme);
        syncButtonUI();
    }

    function attachToggleHandler(button) {
        if (!button || button.dataset.themeBound === '1') return;

        button.addEventListener('click', function () {
            applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
        });

        button.dataset.themeBound = '1';
    }

    function ensureToggleButton() {
        const existingButton = document.getElementById('themeToggleBtn');
        const existingIcon = document.getElementById('themeToggleIcon');
        const fallbackButton = document.getElementById(GLOBAL_BTN_ID);

        if (existingButton && existingIcon) {
            if (fallbackButton && fallbackButton !== existingButton) {
                fallbackButton.remove();
            }
            buttonRef = existingButton;
            iconRef = existingIcon;
            // Normalize legacy inline handlers to avoid divergent theme logic
            // (some pages define toggleTheme() locally and do not sync html/body consistently).
            if (existingButton.getAttribute('onclick')) {
                existingButton.removeAttribute('onclick');
            }
            attachToggleHandler(existingButton);
            syncButtonUI();
            return;
        }

        // Do not inject floating fallback button unless explicitly enabled.
        if (!ENABLE_FALLBACK_FLOATING_BUTTON) {
            if (fallbackButton) fallbackButton.remove();
            buttonRef = null;
            iconRef = null;
            return;
        }

        let btn = fallbackButton;
        if (!btn) {
            btn = document.createElement('button');
            btn.id = GLOBAL_BTN_ID;
            btn.type = 'button';
            btn.innerHTML = '<span id="globalThemeToggleIcon"><svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></span>';
            document.body.appendChild(btn);
        }

        buttonRef = btn;
        iconRef = btn.querySelector('#globalThemeToggleIcon');
        attachToggleHandler(btn);
    }

    function retryThemeButtonMount() {
        window.setTimeout(function () {
            ensureToggleButton();
            syncButtonUI();
        }, 0);

        window.setTimeout(function () {
            ensureToggleButton();
            syncButtonUI();
        }, 150);
    }

    function init() {
        injectStyles();
        ensureToggleButton();
        applyTheme(getStoredTheme());
        retryThemeButtonMount();
    }

    // Apply theme as soon as script runs to avoid light flash during navigation.
    applyThemeClassEarly(getStoredTheme());

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
