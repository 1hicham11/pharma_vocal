(() => {
  const path = (window.location.pathname.split("/").pop() || "").toLowerCase();
  const skipSidebar = path === "session.html" || path === "personalize.html";
  if (skipSidebar) {
    return;
  }

  const icons = {
    home: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-10.5Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    history: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 8v4l3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    help: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9.09 9a3 3 0 1 1 5.82 0c0 2-3 2.2-3 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="17.5" r="0.8" fill="currentColor"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M22 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    meeting: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" stroke="currentColor" stroke-width="1.8"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    stack: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 9 4.5-9 4.5L3 7.5 12 3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m3 12.5 9 4.5 9-4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="m3 17 9 4 9-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" stroke-width="1.8"/><path d="m19.4 15 .6 1-2 3-1.1-.3a7.7 7.7 0 0 1-1.7 1l-.2 1.2h-4l-.2-1.2a7.7 7.7 0 0 1-1.7-1L8 19l-2-3 .6-1a8.5 8.5 0 0 1 0-2l-.6-1 2-3 1.1.3a7.7 7.7 0 0 1 1.7-1L11 3h4l.2 1.2a7.7 7.7 0 0 1 1.7 1L18 9l2 3-.6 1a8.5 8.5 0 0 1 0 2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M16 17l5-5-5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 12H9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    collapse: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 4 3 9l5 5M16 20l5-5-5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    addAgent: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 4v16m8-8H4" stroke="currentColor"/></svg>',
  };

  const navItems = [
    { href: "dashboard.html", label: "Home", icon: icons.home },
    { href: "all-sessions.html", label: "History", icon: icons.history },
    { href: "meeting-translate.html", label: "Meeting", icon: icons.meeting },
    { href: "experts.html", label: "Experts", icon: icons.users },
    { href: "rag-base.html", label: "RAG", icon: icons.stack },
  ];

  function normalizeToAppRoute(href) {
    if (!href) return "/";
    const [rawPath, rawQuery = ""] = href.split("?");
    const filePath = (rawPath || "").trim().toLowerCase();
    const mapped = filePath.endsWith(".html")
      ? "/" + filePath.replace(/\.html$/, "")
      : (filePath.startsWith("/") ? filePath : "/" + filePath);
    return rawQuery ? `${mapped}?${rawQuery}` : mapped;
  }

  function navigateApp(href) {
    const targetRoute = normalizeToAppRoute(href);
    try {
      const topWindow = window.top || window;
      topWindow.location.href = targetRoute;
    } catch (_) {
      window.location.href = href;
    }
  }

  // Sidebar DOM creation
  const sidebar = document.createElement("aside");
  sidebar.className = "app-sidebar-shell";
  sidebar.innerHTML = `
    <div class="app-sidebar-brand">
      <button id="appSidebarPrimaryToggle" class="app-sidebar-toggle" type="button">☰</button>
      <img src="assets/branding/voxeleon-logo.png" alt="Voxeleon" class="app-sidebar-title" style="height:40px;width:auto;max-width:160px;object-fit:contain;" />
    </div>
    <div class="app-sidebar-nav" id="appSidebarNav"></div>
    <div class="app-sidebar-bottom">
      <button class="app-sidebar-item" data-href="settings.html">
        <span class="app-sidebar-icon">${icons.settings}</span><span class="app-sidebar-label">Settings</span>
      </button>
      <button class="app-sidebar-item" data-href="dashboard.html" data-logout="1">
        <span class="app-sidebar-icon">${icons.logout}</span><span class="app-sidebar-label">Log out</span>
      </button>
      <button class="app-sidebar-item" data-href="create-agent.html">
        <span class="app-sidebar-icon">${icons.addAgent}</span><span class="app-sidebar-label">Ajouter un agent</span>
      </button>
    </div>
  `;
  document.body.appendChild(sidebar);

  const navContainer = sidebar.querySelector("#appSidebarNav");
  navItems.forEach((item) => {
    const btn = document.createElement("button");
    btn.className = "app-sidebar-item" + (path === item.href ? " active" : "");
    btn.setAttribute("data-href", item.href);
    btn.innerHTML = `<span class="app-sidebar-icon">${item.icon}</span><span class="app-sidebar-label">${item.label}</span>`;
    navContainer.appendChild(btn);
  });

  const rootOffsetTarget = document.querySelector("body > .min-h-screen") || document.querySelector("body > .flex-1");
  if (rootOffsetTarget) {
    rootOffsetTarget.classList.add("app-main-offset");
  }

  function applyCollapsed(collapsed) {
    sidebar.classList.toggle("collapsed", collapsed);
    if (rootOffsetTarget) rootOffsetTarget.classList.toggle("collapsed", collapsed);
    localStorage.setItem("app_sidebar_collapsed", collapsed ? "1" : "0");
  }

  const initialCollapsed = localStorage.getItem("app_sidebar_collapsed") === "1";
  applyCollapsed(initialCollapsed);

  const toggleButtons = [sidebar.querySelector("#appSidebarPrimaryToggle"), sidebar.querySelector("#appSidebarSecondaryToggle")];
  toggleButtons.forEach((btn) => btn && btn.addEventListener("click", () => applyCollapsed(!sidebar.classList.contains("collapsed"))));

  sidebar.addEventListener("click", (event) => {
    const target = event.target.closest("[data-href]");
    if (!target) return;
    if (target.getAttribute("data-logout") === "1") {
      try {
        const isDark = (localStorage.getItem("site_theme") || "dark") !== "light";
        const bg = isDark ? "#08101d" : "#ffffff";
        document.documentElement.style.backgroundColor = bg;
        if (document.body) document.body.style.backgroundColor = bg;
      } catch (_) {}
      const keepTheme = (() => {
        try { return localStorage.getItem("site_theme"); } catch (_) { return null; }
      })();
      const keepLang = (() => {
        try { return localStorage.getItem("site_lang"); } catch (_) { return null; }
      })();
      localStorage.clear();
      try {
        if (keepTheme) localStorage.setItem("site_theme", keepTheme);
        if (keepLang) localStorage.setItem("site_lang", keepLang);
      } catch (_) {}
      navigateApp("/login");
      return;
    }
    const href = target.getAttribute("data-href");
    if (href) navigateApp(href);
  });

})();
