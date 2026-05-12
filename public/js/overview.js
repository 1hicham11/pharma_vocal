(() => {
  // Do nothing if page already has an overviewTab (admin) or a custom overview (dashboard)
  if (document.getElementById('overviewTab') || document.querySelector('[data-i18n="overviewTitle"]')) return;

  function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('token');
    const headers = { ...(options.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    return fetch(url, { ...options, headers }).then(res => {
      if (res.status === 401 || res.status === 403) {
        window.location.href = 'login.html';
        throw new Error('Session expirée');
      }
      return res;
    });
  }

  function insertOverview() {
    const main = document.querySelector('main') || document.body;
    const container = document.createElement('div');
    container.id = 'overviewTab';
    container.className = 'fade-in space-y-6';
    container.innerHTML = `
      <section class="dashboard-card relative overflow-hidden px-6 py-8 bg-white border border-slate-100 rounded-2xl shadow-sm mb-6">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p class="text-xs uppercase tracking-[0.4em] text-slate-400">Administration</p>
            <h1 class="text-2xl font-bold text-slate-900">Tableau de bord</h1>
            <p class="text-sm text-slate-500">Principaux KPIs et activités.</p>
          </div>
          <div class="flex items-center gap-3">
            <div class="rounded-2xl bg-slate-100 px-4 py-2 text-right text-sm text-slate-500">
              <p class="text-[10px] uppercase tracking-[0.3em]">Mise à jour</p>
              <p id="dashboardUpdated" class="font-semibold text-slate-900">--</p>
            </div>
          </div>
        </div>
        <div class="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <div class="stat-card">
            <div class="flex items-center justify-between">
              <span class="text-emerald-600 text-xl">📊</span>
              <small class="text-slate-400">Sessions</small>
            </div>
            <p id="kpiTotalSessions" class="text-3xl font-extrabold text-emerald-950">—</p>
          </div>
          <div class="stat-card">
            <div class="flex items-center justify-between">
              <span class="text-emerald-600 text-xl">✔️</span>
              <small class="text-slate-400">Réussite</small>
            </div>
            <p id="kpiSuccessRate" class="text-3xl font-extrabold text-emerald-950">—</p>
          </div>
          <div class="stat-card">
            <div class="flex items-center justify-between">
              <span class="text-emerald-600 text-xl">👥</span>
              <small class="text-slate-400">Utilisateurs</small>
            </div>
            <p id="kpiActiveUsers" class="text-3xl font-extrabold text-emerald-950">—</p>
          </div>
          <div class="stat-card">
            <div class="flex items-center justify-between">
              <span class="text-emerald-600 text-xl">📁</span>
              <small class="text-slate-400">Documents</small>
            </div>
            <p id="kpiRagDocs" class="text-3xl font-extrabold text-emerald-950">—</p>
          </div>
        </div>
      </section>

      <section class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="bg-white border border-slate-100 rounded-2xl p-6">
          <h3 class="font-bold mb-3">Activité récente</h3>
          <div id="recentActivityList" class="space-y-2 text-sm text-slate-600">Chargement…</div>
        </div>
        <div class="bg-white border border-slate-100 rounded-2xl p-6">
          <h3 class="font-bold mb-3">Performance des experts</h3>
          <div id="expertPerformanceList" class="space-y-2 text-sm text-slate-600">Chargement…</div>
        </div>
      </section>

      <section class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="bg-white border border-slate-100 rounded-2xl p-6">
          <h3 class="font-bold mb-3">Sessions (7 derniers jours)</h3>
          <div style="height:200px"><canvas id="sessionsChart"></canvas></div>
          <div id="sessionsChartEmpty" class="text-sm text-slate-400 text-center py-8 hidden">Aucune activité</div>
        </div>
        <div class="bg-white border border-slate-100 rounded-2xl p-6">
          <h3 class="font-bold mb-3">Top Discussions</h3>
          <div style="height:200px"><canvas id="avatarsChart"></canvas></div>
          <div id="avatarsChartEmpty" class="text-sm text-slate-400 text-center py-8 hidden">Aucune donnée</div>
        </div>
      </section>
    `;

    if (main.firstChild) main.insertBefore(container, main.firstChild);
    else main.appendChild(container);
  }

  function loadOverview() {
    fetchWithAuth('/api/admin/stats').then(res => res.json()).then(data => {
      document.getElementById('kpiTotalSessions').textContent = data.totalSessions || 0;
      const rawSuccess = data.averageScore;
      const successDisplay = typeof rawSuccess === 'number' ? `${rawSuccess}%` : rawSuccess || '0%';
      document.getElementById('kpiSuccessRate').textContent = successDisplay;
      document.getElementById('kpiActiveUsers').textContent = data.activeDeleguates || 0;
      document.getElementById('kpiRagDocs').textContent = data.ragStats?.totalDocuments || 0;

      const recent = Array.isArray(data.recentSessions) ? data.recentSessions : [];
      document.getElementById('recentActivityList').innerHTML = recent.length ? recent.map(s => `<div class="flex items-center gap-3"><div class="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold">${(s.delegue_prenom||' ')[0]||'?'}</div><div class="flex-1"><div class="font-medium">${s.delegue_prenom||''} ${s.delegue_nom||''}</div><div class="text-xs text-slate-400">${s.medicament_nom||'Visite libre'}</div></div><div class="font-bold text-sm ${s.score_global>=70?'text-emerald-600':'text-orange-500'}">${s.score_global||'—'}/100</div></div>`).join('') : '<p class="text-slate-400 text-sm text-center py-4">Aucune session récente</p>';

      const experts = Array.isArray(data.avatarSuccessRate) ? data.avatarSuccessRate : [];
      document.getElementById('expertPerformanceList').innerHTML = experts.length ? experts.map(a => `<div class="flex items-center justify-between"><div><div class="font-medium">${a.name}</div><div class="text-xs text-slate-400">${a.total} sessions</div></div><div class="text-sm ${a.successRate>=70?'text-emerald-600':'text-orange-500'}">${a.successRate}%</div></div>`).join('') : '<p class="text-slate-400 text-sm text-center py-4">Aucune donnée</p>';

      const updated = document.getElementById('dashboardUpdated');
      if (updated) updated.textContent = new Date().toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

      function ensureChart(cb) {
        if (window.Chart) return cb();
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/chart.js';
        s.onload = cb; document.head.appendChild(s);
      }

      ensureChart(() => {
        try { renderCharts(data); } catch (e) { console.error(e); }
      });
    }).catch(err => console.error(err));
  }

  let sessionsChart = null;
  let avatarsChart = null;
  function renderCharts(data) {
    const sessionSeries = Array.isArray(data.sessionsByDay) && data.sessionsByDay.length ? data.sessionsByDay : [];
    const hasSessionActivity = sessionSeries.some(d => d.count > 0);
    const sessionsEl = document.getElementById('sessionsChart');
    const sessionsEmpty = document.getElementById('sessionsChartEmpty');
    if (sessionsEmpty) sessionsEmpty.classList.toggle('hidden', hasSessionActivity);

    if (sessionsChart) sessionsChart.destroy();
    if (sessionsEl && sessionSeries.length) {
      sessionsChart = new Chart(sessionsEl, { type: 'line', data: { labels: sessionSeries.map(d=>d.date), datasets:[{ label:'Sessions', data: sessionSeries.map(d=>d.count), borderColor:'#10b981', backgroundColor:'rgba(16,185,129,0.08)', fill:true, tension:0.4 }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true, grid:{ display:false } }, x:{ grid:{ display:false } } } } });
    }

    const avatarData = Array.isArray(data.topMedications) && data.topMedications.length ? data.topMedications : [];
    const avatarsEl = document.getElementById('avatarsChart');
    const avatarsEmpty = document.getElementById('avatarsChartEmpty');
    const hasAv = avatarData.some(a=>a.discussion_count>0);
    if (avatarsEmpty) avatarsEmpty.classList.toggle('hidden', hasAv);
    if (avatarsChart) avatarsChart.destroy();
    if (avatarsEl && avatarData.length) {
      avatarsChart = new Chart(avatarsEl, { type:'doughnut', data:{ labels: avatarData.map(a=>a.nom_commercial||a.name||'—'), datasets:[{ data: avatarData.map(a=>a.discussion_count||a.discussionCount||1), backgroundColor:['#064e3b','#059669','#10b981','#6ee7b7','#f1f5f9'], borderWidth:0 }] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ usePointStyle:true, boxWidth:6, font:{ size:10 } } } }, cutout:'75%' } });
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    insertOverview();
    loadOverview();
  });

})();
