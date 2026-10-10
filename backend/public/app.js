/**
 * SecureByte — Web Command Center & Safety Portal Logic
 * Real-time API integration, Web Audio Siren, Safety Escort, and Live Dispatch.
 */

// ── State ──
let state = {
  user: null,
  accessToken: null,
  refreshToken: null,
  incidents: [],
  safetyPoints: [],
  activeIncident: null,
  sirenActive: false,
  escortTimer: null,
  escortSecondsLeft: 0,
  sosCountdownTimer: null,
};

// ── Audio Context for Siren ──
let audioCtx = null;
let sirenOsc = null;
let sirenGain = null;

// ── API Helper ──
async function api(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.accessToken) {
    headers['Authorization'] = `Bearer ${state.accessToken}`;
  }

  try {
    let res = await fetch(endpoint, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    let json = await res.json().catch(() => null);

    if (res.status === 401 && state.refreshToken && !endpoint.includes('/auth/')) {
      // Silent refresh
      const refreshed = await refreshTokens();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${state.accessToken}`;
        res = await fetch(endpoint, {
          method: options.method || 'GET',
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
        });
        json = await res.json().catch(() => null);
      }
    }

    if (!res.ok) {
      const err = (json && json.error) || { message: `Request failed (${res.status})` };
      throw new Error(err.message || 'API request error');
    }

    return json ? json.data : null;
  } catch (err) {
    throw err;
  }
}

async function refreshTokens() {
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: state.refreshToken }),
    });
    if (!res.ok) return false;
    const json = await res.json();
    if (json?.data?.accessToken) {
      setSession(json.data.user, json.data.accessToken, json.data.refreshToken);
      return true;
    }
  } catch (e) {
    return false;
  }
  return false;
}

function setSession(user, access, refresh) {
  state.user = user;
  state.accessToken = access;
  state.refreshToken = refresh;

  localStorage.setItem('cs_access', access || '');
  localStorage.setItem('cs_refresh', refresh || '');
  if (user) localStorage.setItem('cs_user', JSON.stringify(user));

  renderSession();
}

function clearSession() {
  state.user = null;
  state.accessToken = null;
  state.refreshToken = null;
  localStorage.removeItem('cs_access');
  localStorage.removeItem('cs_refresh');
  localStorage.removeItem('cs_user');
  renderSession();
}

// ── Session Rendering ──
function renderSession() {
  const profileChip = document.getElementById('userProfileChip');
  const roleBadge = document.getElementById('userRoleBadge');
  const nameDisplay = document.getElementById('userNameDisplay');

  if (state.user) {
    profileChip.classList.remove('hidden');
    nameDisplay.textContent = state.user.name;
    roleBadge.textContent = state.user.role;
    roleBadge.className = `badge ${state.user.role === 'ADMIN' ? 'badge-high' : state.user.role === 'RESPONDER' ? 'badge-critical' : 'badge-low'}`;
  } else {
    profileChip.classList.add('hidden');
  }
}

// ── Toasts ──
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ── Audio Siren Synthesizer ──
function toggleSiren() {
  const btn = document.getElementById('sirenBtn');
  const btnText = document.getElementById('sirenBtnText');
  const strobe = document.getElementById('strobeOverlay');

  if (state.sirenActive) {
    // Stop Siren
    state.sirenActive = false;
    btn.classList.remove('active');
    btnText.textContent = 'Siren';
    strobe.classList.remove('active');
    strobe.classList.add('hidden');

    if (sirenOsc) {
      try { sirenOsc.stop(); sirenOsc.disconnect(); } catch (e) {}
      sirenOsc = null;
    }
    showToast('Emergency siren deactivated', 'info');
  } else {
    // Start Siren
    state.sirenActive = true;
    btn.classList.add('active');
    btnText.textContent = 'STOP SIREN';
    strobe.classList.remove('hidden');
    strobe.classList.add('active');

    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      sirenOsc = audioCtx.createOscillator();
      sirenGain = audioCtx.createGain();

      sirenOsc.type = 'sawtooth';
      sirenGain.gain.setValueAtTime(0.18, audioCtx.currentTime);

      // Pitch sweep
      const now = audioCtx.currentTime;
      sirenOsc.frequency.setValueAtTime(650, now);
      for (let i = 0; i < 40; i++) {
        sirenOsc.frequency.exponentialRampToValueAtTime(950, now + (i * 0.8) + 0.4);
        sirenOsc.frequency.exponentialRampToValueAtTime(650, now + (i * 0.8) + 0.8);
      }

      sirenOsc.connect(sirenGain);
      sirenGain.connect(audioCtx.destination);
      sirenOsc.start();
    } catch (e) {
      console.warn('Web Audio not allowed without user gesture:', e);
    }

    showToast('🚨 DISTRESS SIREN ACTIVATED — DRAWING CAMPUS ATTENTION', 'error');
  }
}

// ── Virtual Safety Escort Walk ──
function startEscort() {
  const origin = document.getElementById('escortOrigin').value || 'Current Location';
  const dest = document.getElementById('escortDestination').value || 'Destination';
  const activeDurationBtn = document.querySelector('.duration-btn.active');
  const minutes = parseInt(activeDurationBtn?.dataset.mins || '10', 10);

  state.escortSecondsLeft = minutes * 60;

  document.getElementById('escortSetupView').classList.add('hidden');
  document.getElementById('escortActiveView').classList.remove('hidden');
  document.getElementById('escortRouteText').textContent = `${origin} → ${dest}`;
  document.getElementById('escortActiveDot').classList.remove('hidden');

  updateEscortDisplay();

  clearInterval(state.escortTimer);
  state.escortTimer = setInterval(() => {
    state.escortSecondsLeft--;
    updateEscortDisplay();

    if (state.escortSecondsLeft <= 0) {
      clearInterval(state.escortTimer);
      // Auto-dispatch emergency alert!
      autoDispatchEscortAlert(origin, dest);
    }
  }, 1000);

  showToast(`Safety Escort activated for ${minutes} mins. Security monitoring started.`, 'success');
}

function updateEscortDisplay() {
  const mins = Math.floor(state.escortSecondsLeft / 60);
  const secs = state.escortSecondsLeft % 60;
  document.getElementById('escortTimeDisplay').textContent = 
    `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

async function arriveSafe() {
  clearInterval(state.escortTimer);
  document.getElementById('escortActiveView').classList.add('hidden');
  document.getElementById('escortSetupView').classList.remove('hidden');
  document.getElementById('escortActiveDot').classList.add('hidden');

  // Submit Safe Check-in
  try {
    await api('/api/checkins', {
      method: 'POST',
      body: { status: 'SAFE', note: 'Arrived safely from Night Walk escort session' }
    });
  } catch (e) {}

  showToast('Welcome back! You have marked yourself safely arrived.', 'success');
}

async function autoDispatchEscortAlert(origin, dest) {
  showToast('⏰ ESCORT TIMER EXPIRED! Auto-alerting security team…', 'error');
  toggleSiren();

  try {
    await api('/api/incidents', {
      method: 'POST',
      body: {
        isSos: true,
        title: '🚨 Missed Escort Check-in',
        description: `Student night walk timer expired without safe check-in. Last declared route: ${origin} towards ${dest}.`,
        location: { campusLandmark: `Route: ${origin} to ${dest}` }
      }
    });
    loadIncidents();
  } catch (e) {
    console.error('Failed to auto-dispatch alert:', e);
  }
}

// ── Incident Management ──
async function loadIncidents() {
  const container = document.getElementById('incidentListContainer');
  const statusFilter = document.getElementById('statusFilterSelect').value;
  const priorityFilter = document.getElementById('priorityFilterSelect').value;
  const categoryFilter = document.getElementById('categoryFilterSelect').value;
  const search = document.getElementById('incidentSearchInput').value.trim();

  try {
    let url = '/api/responder/incidents?limit=50';
    if (statusFilter) url += `&status=${statusFilter}`;
    if (priorityFilter) url += `&priority=${priorityFilter}`;
    if (categoryFilter) url += `&category=${categoryFilter}`;
    if (search) url += `&q=${encodeURIComponent(search)}`;

    let data;
    try {
      data = await api(url);
    } catch (e) {
      // Fallback for students viewing my incidents
      data = await api('/api/incidents/my?limit=50');
    }

    state.incidents = data.items || [];
    renderIncidents(state.incidents);

    // Update SOS count badge
    const sosCount = state.incidents.filter(i => i.isSos && i.status !== 'RESOLVED').length;
    const badge = document.getElementById('sosBadgeCount');
    if (sosCount > 0) {
      badge.textContent = sosCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  } catch (err) {
    container.innerHTML = `<div class="empty-state-card">⚠️ Could not load incidents: ${err.message}. Sign in as Responder or Student.</div>`;
  }
}

function renderIncidents(items) {
  const container = document.getElementById('incidentListContainer');
  if (!items || items.length === 0) {
    container.innerHTML = '<div class="empty-state-card" style="grid-column: 1/-1;">No incidents match the active filters. All campus sectors clear!</div>';
    return;
  }

  container.innerHTML = items.map(inc => {
    const isSos = inc.isSos;
    const landmark = inc.location?.campusLandmark || (inc.location?.latitude ? `${inc.location.latitude.toFixed(4)}, ${inc.location.longitude.toFixed(4)}` : 'Campus Quad');
    const dateStr = new Date(inc.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return `
      <div class="incident-card ${isSos ? 'sos-highlight' : ''}" onclick="openIncidentModal('${inc.id}')">
        <div class="incident-header-row">
          <span class="badge badge-${inc.priority.toLowerCase()}">${inc.priority}</span>
          <span class="badge badge-status-${inc.status.toLowerCase()}">${inc.status.replace('_', ' ')}</span>
        </div>
        <div class="incident-title">${escapeHtml(inc.title)}</div>
        <div class="incident-desc">${escapeHtml(inc.description)}</div>
        <div class="incident-meta-row">
          <span>📍 ${escapeHtml(landmark)}</span>
          <span>🕒 ${dateStr}</span>
        </div>
      </div>
    `;
  }).join('');
}

async function openIncidentModal(id) {
  const modal = document.getElementById('incidentModal');
  try {
    const data = await api(`/api/incidents/${id}`);
    const inc = data.incident;
    state.activeIncident = inc;

    document.getElementById('modalIncidentTitle').textContent = inc.title;
    document.getElementById('modalPriorityBadge').textContent = inc.priority;
    document.getElementById('modalPriorityBadge').className = `badge badge-${inc.priority.toLowerCase()}`;
    document.getElementById('modalCategory').textContent = inc.category.replace('_', ' ');
    document.getElementById('modalReporter').textContent = inc.reporter?.name || 'Anonymous Student';
    document.getElementById('modalTime').textContent = new Date(inc.createdAt).toLocaleString();
    document.getElementById('modalDescription').textContent = inc.description;

    const locBox = document.getElementById('modalLocationText');
    const mapsLink = document.getElementById('modalGoogleMapsLink');
    if (inc.location?.latitude && inc.location?.longitude) {
      locBox.textContent = `${inc.location.latitude.toFixed(5)}, ${inc.location.longitude.toFixed(5)} (${inc.location.campusLandmark || 'GPS'})`;
      mapsLink.href = `https://maps.google.com/?q=${inc.location.latitude},${inc.location.longitude}`;
      mapsLink.classList.remove('hidden');
    } else {
      locBox.textContent = inc.location?.campusLandmark || 'No coordinates attached';
      mapsLink.classList.add('hidden');
    }

    // Photo preview
    const photoContainer = document.getElementById('modalPhotoContainer');
    const photoImg = document.getElementById('modalPhotoImage');
    if (inc.photoPath) {
      photoImg.src = inc.photoPath;
      photoContainer.classList.remove('hidden');
    } else {
      photoContainer.classList.add('hidden');
    }

    // Action buttons based on status
    const isStaff = state.user?.role === 'RESPONDER' || state.user?.role === 'ADMIN';
    const actionBlock = document.getElementById('responderActionBlock');
    const btnAck = document.getElementById('btnAcknowledge');
    const btnProg = document.getElementById('btnInProgress');
    const btnRes = document.getElementById('btnResolve');

    btnAck.classList.add('hidden');
    btnProg.classList.add('hidden');
    btnRes.classList.add('hidden');

    if (isStaff) {
      actionBlock.classList.remove('hidden');
      if (inc.status === 'NEW') btnAck.classList.remove('hidden');
      if (inc.status === 'ACKNOWLEDGED') btnProg.classList.remove('hidden');
      if (inc.status === 'IN_PROGRESS') btnRes.classList.remove('hidden');
    } else {
      actionBlock.classList.add('hidden');
    }

    // Timeline
    const timeline = document.getElementById('modalTimeline');
    const history = inc.statusHistory || [];
    timeline.innerHTML = history.map(h => `
      <div class="timeline-item">
        <div class="timeline-dot"></div>
        <div>
          <div><strong>${h.newStatus}</strong> &bull; <small>${new Date(h.createdAt).toLocaleTimeString()}</small> by ${h.updater?.name || 'Staff'}</div>
          ${h.responderNotes ? `<div style="color: var(--text-muted); font-size: 12px; margin-top: 2px;">"${escapeHtml(h.responderNotes)}"</div>` : ''}
        </div>
      </div>
    `).join('') || '<div style="font-size: 12.5px; color: var(--text-muted);">Awaiting responder action.</div>';

    modal.classList.remove('hidden');
  } catch (err) {
    showToast(`Could not open incident: ${err.message}`, 'error');
  }
}

async function updateIncidentStatus(newStatus) {
  if (!state.activeIncident) return;
  const notes = document.getElementById('statusNotesInput').value.trim();

  try {
    await api(`/api/responder/incidents/${state.activeIncident.id}/status`, {
      method: 'PATCH',
      body: { newStatus, responderNotes: notes || undefined }
    });
    showToast(`Status updated to ${newStatus}`, 'success');
    document.getElementById('statusNotesInput').value = '';
    document.getElementById('incidentModal').classList.add('hidden');
    loadIncidents();
  } catch (err) {
    showToast(`Status change failed: ${err.message}`, 'error');
  }
}

// ── SOS Activation (3-second Countdown) ──
function startSosCountdown() {
  const countdownWrap = document.getElementById('sosCountdownArea');
  const countEl = document.getElementById('countdownNumber');
  let seconds = 3;

  countdownWrap.classList.remove('hidden');
  countEl.textContent = seconds;

  clearInterval(state.sosCountdownTimer);
  state.sosCountdownTimer = setInterval(async () => {
    seconds--;
    countEl.textContent = seconds;
    if (seconds <= 0) {
      clearInterval(state.sosCountdownTimer);
      countdownWrap.classList.add('hidden');
      await submitSosAlert();
    }
  }, 1000);
}

function cancelSosCountdown() {
  clearInterval(state.sosCountdownTimer);
  document.getElementById('sosCountdownArea').classList.add('hidden');
  showToast('SOS Aborted — no alarm was dispatched.', 'info');
}

async function submitSosAlert() {
  const landmark = document.getElementById('manualLandmarkInput').value.trim() || 'Main Campus';
  showToast('🚨 Transmitting Emergency SOS…', 'error');

  try {
    // Acquire geolocation if permitted
    let locationData = { campusLandmark: landmark };
    if (navigator.geolocation) {
      try {
        const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000 }));
        locationData = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, campusLandmark: landmark };
      } catch (e) {}
    }

    await api('/api/incidents', {
      method: 'POST',
      body: {
        isSos: true,
        description: 'Emergency SOS activated from Web Safety Portal',
        location: locationData,
      }
    });

    showToast('🚨 SOS DISPATCHED TO CAMPUS SECURITY TEAM!', 'success');
    loadIncidents();
  } catch (err) {
    showToast(`SOS submission error: ${err.message}`, 'error');
  }
}

// ── Safety Check-In ──
async function submitCheckin(status) {
  try {
    const data = await api('/api/checkins', {
      method: 'POST',
      body: {
        status,
        note: status === 'SAFE' ? 'Checked in safe from Web Portal' : 'Requested urgent assistance via Web Portal'
      }
    });
    document.getElementById('myRecentCheckin').textContent = 
      `Last check-in: ${status} (${new Date().toLocaleTimeString()})`;
    showToast(status === 'SAFE' ? 'Check-in recorded: SAFE' : '🆘 Security alerted that you need help!', status === 'SAFE' ? 'success' : 'error');
  } catch (err) {
    showToast(`Check-in failed: ${err.message}`, 'error');
  }
}

// ── Safety Map ──
async function loadSafetyMap() {
  const container = document.getElementById('safetyPointsList');
  const markersLayer = document.getElementById('mapMarkersLayer');
  const filter = document.querySelector('.chip.active')?.dataset.category || '';

  try {
    const data = await api(`/api/safety-points${filter ? `?category=${filter}` : ''}`);
    state.safetyPoints = data.items || [];

    // Render list
    container.innerHTML = state.safetyPoints.map(p => `
      <div class="point-card" onclick="highlightMapPin('${p.id}')">
        <div class="point-name">${escapeHtml(p.name)}</div>
        <div class="point-meta">${p.category.replace('_', ' ')} &bull; ${escapeHtml(p.locationDescription || '')}</div>
      </div>
    `).join('') || '<div class="empty-state-card">No points in this category.</div>';

    // Render markers on schematic layer
    if (state.safetyPoints.length > 0) {
      const lats = state.safetyPoints.map(p => p.latitude);
      const lngs = state.safetyPoints.map(p => p.longitude);
      const minLat = Math.min(...lats), maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
      const dLat = (maxLat - minLat) || 0.001;
      const dLng = (maxLng - minLng) || 0.001;

      markersLayer.innerHTML = state.safetyPoints.map(p => {
        const top = 100 - (((p.latitude - minLat) / dLat) * 80 + 10);
        const left = ((p.longitude - minLng) / dLng) * 80 + 10;
        const icon = p.category.includes('SECURITY') ? '👮' : p.category.includes('AED') ? '❤️' : p.category.includes('FIRE') ? '🧯' : p.category.includes('EXIT') ? '🚪' : '📍';
        return `
          <div class="map-marker" style="top: ${top}%; left: ${left}%;" title="${escapeHtml(p.name)}" onclick="highlightMapPin('${p.id}')">
            ${icon}
          </div>
        `;
      }).join('');
    }
  } catch (e) {
    container.innerHTML = `<div class="empty-state-card">⚠️ Could not load map points: ${e.message}</div>`;
  }
}

function highlightMapPin(id) {
  const p = state.safetyPoints.find(x => x.id === id);
  if (p) showToast(`📍 ${p.name}: ${p.locationDescription || p.category}`, 'info');
}

// ── Analytics ──
async function loadAnalytics() {
  try {
    const data = await api('/api/responder/analytics');
    document.getElementById('metricTotalIncidents').textContent = data.totals?.incidents || 0;
    document.getElementById('metricSos24h').textContent = data.totals?.sosLast24h || 0;
    document.getElementById('metricOpenNow').textContent = data.totals?.openNow || 0;
    document.getElementById('metricAvgResTime').textContent = 
      data.avgResolutionMinutes != null ? `${data.avgResolutionMinutes}m` : 'N/A';

    // Render 7-day trend chart
    const chart = document.getElementById('trendChartContainer');
    const series = data.series7d || [];
    const maxVal = Math.max(...series.map(s => s.total), 1);

    chart.innerHTML = series.map(s => {
      const heightPct = Math.round((s.total / maxVal) * 85) + 5;
      const dayName = new Date(s.date).toLocaleDateString([], { weekday: 'short' });
      return `
        <div class="chart-bar-group" title="${s.date}: ${s.total} incidents (${s.sos} SOS)">
          <div class="chart-bar ${s.sos > 0 ? 'has-sos' : ''}" style="height: ${heightPct}%;"></div>
          <div class="chart-label">${dayName}</div>
        </div>
      `;
    }).join('');

    // Category breakdown
    const breakdown = document.getElementById('categoryBreakdownContainer');
    breakdown.innerHTML = Object.entries(data.byCategory || {}).map(([cat, count]) => `
      <div class="breakdown-row">
        <span>${cat.replace('_', ' ')}</span>
        <strong>${count}</strong>
      </div>
    `).join('') || '<div class="empty-state-card">No incidents recorded yet.</div>';
  } catch (e) {
    console.warn('Analytics unavailable for current role:', e);
  }
}

// ── Announcements ──
async function loadAnnouncements() {
  const container = document.getElementById('announcementsList');
  try {
    const data = await api('/api/announcements');
    const items = data.items || [];
    container.innerHTML = items.map(a => `
      <div class="announcement-card ${a.severity.toLowerCase()}">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span class="badge ${a.severity === 'CRITICAL' ? 'badge-critical' : a.severity === 'WARNING' ? 'badge-high' : 'badge-low'}">${a.severity}</span>
          <small style="color: var(--text-muted);">${new Date(a.createdAt).toLocaleString()}</small>
        </div>
        <h3 style="font-size: 16px; margin-bottom: 4px;">${escapeHtml(a.title)}</h3>
        <p style="font-size: 13.5px; color: var(--text-muted); line-height: 1.45;">${escapeHtml(a.message)}</p>
      </div>
    `).join('') || '<div class="empty-state-card">No active announcements.</div>';
  } catch (e) {
    container.innerHTML = `<div class="empty-state-card">Could not load broadcasts.</div>`;
  }
}

// ── Quick Login Function ──
window.quickLogin = async function(email, password) {
  try {
    const data = await api('/api/auth/login', { method: 'POST', body: { email, password } });
    setSession(data.user, data.accessToken, data.refreshToken);
    showToast(`Signed in as ${data.user.name} (${data.user.role})`, 'success');
    loadIncidents();
    loadAnalytics();
  } catch (err) {
    showToast(`Sign in error: ${err.message}`, 'error');
  }
};

// ── Helpers ──
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Event Listeners ──
document.addEventListener('DOMContentLoaded', async () => {
  // Restore session
  const storedUser = localStorage.getItem('cs_user');
  const storedAccess = localStorage.getItem('cs_access');
  const storedRefresh = localStorage.getItem('cs_refresh');
  if (storedUser && storedAccess) {
    state.user = JSON.parse(storedUser);
    state.accessToken = storedAccess;
    state.refreshToken = storedRefresh;
    renderSession();
  } else {
    // Default to responder demo for instant console view
    quickLogin('responder@securebyte.dev', 'Responder@123');
  }

  // Health check
  try {
    const health = await fetch('/api/health').then(r => r.json());
    if (health?.data?.database === 'connected') {
      document.getElementById('systemStatusText').textContent = 'Live • Database Online';
      document.querySelector('.status-dot').classList.add('online');
    }
  } catch (e) {
    document.getElementById('systemStatusText').textContent = 'API Offline';
  }

  // Tab switching
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const pane = document.getElementById(btn.dataset.tab);
      if (pane) pane.classList.add('active');

      if (btn.dataset.tab === 'mapTab') loadSafetyMap();
      if (btn.dataset.tab === 'analyticsTab') loadAnalytics();
      if (btn.dataset.tab === 'announcementsTab') loadAnnouncements();
    });
  });

  // Theme toggle
  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    const current = document.body.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', next);
    document.querySelector('.theme-icon').textContent = next === 'dark' ? '🌙' : '☀️';
  });

  // Siren & Escort
  document.getElementById('sirenBtn').addEventListener('click', toggleSiren);
  document.getElementById('escortQuickBtn').addEventListener('click', () => {
    document.querySelector('[data-tab="escortTab"]').click();
  });
  document.getElementById('startEscortBtn').addEventListener('click', startEscort);
  document.getElementById('arrivedSafeBtn').addEventListener('click', arriveSafe);
  document.getElementById('escortEmergencyBtn').addEventListener('click', () => {
    toggleSiren();
    autoDispatchEscortAlert('Active Walk', 'Security Emergency');
  });

  // Duration buttons
  document.querySelectorAll('.duration-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // SOS button
  document.getElementById('triggerSosBtn').addEventListener('click', startSosCountdown);
  document.getElementById('cancelSosBtn').addEventListener('click', cancelSosCountdown);

  // Check-ins
  document.getElementById('checkinSafeBtn').addEventListener('click', () => submitCheckin('SAFE'));
  document.getElementById('checkinHelpBtn').addEventListener('click', () => submitCheckin('NEEDS_HELP'));

  // Incident form
  document.getElementById('newIncidentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('incidentTitle').value.trim();
    const category = document.getElementById('incidentCategory').value;
    const priority = document.getElementById('incidentPriority').value;
    const description = document.getElementById('incidentDesc').value.trim();
    const landmark = document.getElementById('incidentLandmark').value.trim();

    try {
      await api('/api/incidents', {
        method: 'POST',
        body: { title, category, priority, description, location: landmark ? { campusLandmark: landmark } : undefined }
      });
      showToast('Incident report filed successfully!', 'success');
      e.target.reset();
      loadIncidents();
    } catch (err) {
      showToast(`Submission failed: ${err.message}`, 'error');
    }
  });

  // Filters & Search
  document.getElementById('statusFilterSelect').addEventListener('change', loadIncidents);
  document.getElementById('priorityFilterSelect').addEventListener('change', loadIncidents);
  document.getElementById('categoryFilterSelect').addEventListener('change', loadIncidents);
  document.getElementById('incidentSearchInput').addEventListener('input', () => {
    clearTimeout(window._searchDebounce);
    window._searchDebounce = setTimeout(loadIncidents, 250);
  });
  document.getElementById('refreshQueueBtn').addEventListener('click', loadIncidents);

  // Modals
  document.getElementById('closeModalBtn').addEventListener('click', () => {
    document.getElementById('incidentModal').classList.add('hidden');
  });
  document.getElementById('btnAcknowledge').addEventListener('click', () => updateIncidentStatus('ACKNOWLEDGED'));
  document.getElementById('btnInProgress').addEventListener('click', () => updateIncidentStatus('IN_PROGRESS'));
  document.getElementById('btnResolve').addEventListener('click', () => updateIncidentStatus('RESOLVED'));

  document.getElementById('logoutBtn').addEventListener('click', clearSession);

  // Initial load & Polling
  loadIncidents();
  setInterval(loadIncidents, 5000);
});
