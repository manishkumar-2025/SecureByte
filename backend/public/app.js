/**
 * SecureByte — Web Command Center & Safety Portal Logic
 * Real-time API integration, Web Audio Siren, Safety Escort, Live Dispatch,
 * Student Tracking, Helplines Directory, Emergency SOPs, and Administrative Roster.
 */

// ── State ──
let state = {
  user: null,
  accessToken: null,
  refreshToken: null,
  incidents: [],
  myIncidents: [],
  safetyPoints: [],
  contacts: [],
  users: [],
  activeIncident: null,
  activeViewMode: 'cards', // 'cards' | 'table'
  sirenActive: false,
  escortTimer: null,
  escortSecondsLeft: 0,
  sosCountdownTimer: null,
};

// ── Audio Context for Siren ──
let audioCtx = null;
let sirenOsc = null;
let sirenGain = null;

// ── Built-in Standard Operating Procedures (SOPs) ──
const PROTOCOLS = [
  {
    id: 'sop-fire',
    title: 'Fire Emergency & Evacuation',
    icon: '🔥',
    category: 'FIRE_HAZARD',
    badge: 'CRITICAL',
    desc: 'Standard procedure for smoke detection, active fire alarm, and building clearance across all campus blocks.',
    steps: [
      'Activate nearest wall break-glass alarm & trigger CampusShield SOS.',
      'Evacuate immediately via marked fire stairwells. DO NOT USE ELEVATORS.',
      'Report to designated assembly point: Deshpande Grounds or Sports Oval.',
      'Floor marshals verify headcounts and report unaccounted persons to Command.',
      'CO₂ and dry powder extinguishers deployed by trained staff only.'
    ]
  },
  {
    id: 'sop-medical',
    title: 'Medical Emergency & First Aid',
    icon: '🚑',
    category: 'MEDICAL_EMERGENCY',
    badge: 'HIGH',
    desc: 'Rapid medical response for acute injury, trauma, unconsciousness, or cardiac distress.',
    steps: [
      'Call BIT Dispensary emergency ambulance (+91 94311 23456) or trigger Medical SOS.',
      'Assess airway, breathing, circulation. Do not move spine trauma suspects.',
      'If unconscious and non-responsive: Deploy nearest AED from Sports Pavilion or Admin Block.',
      'Place breathing, unconscious patients into recovery position.',
      'Keep crowd back and guide ambulance to the nearest vehicle access ramp.'
    ]
  },
  {
    id: 'sop-active-threat',
    title: 'Active Security Threat / Intruder',
    icon: '🛡️',
    category: 'SECURITY_THREAT',
    badge: 'CRITICAL',
    desc: 'Lockdown and containment procedures during hostile intruder or violence incidents.',
    steps: [
      'RUN: Evacuate immediately if an accessible, safe exit route exists.',
      'HIDE: If escape is impossible, lock and barricade classroom/dorm doors.',
      'Silence all mobile devices, mute ringers, turn off lights, and stay low.',
      'FIGHT: As an absolute last resort, act aggressively to disrupt the threat.',
      'Campus Quick Action Patrol and Local Police (112) automatically coordinate.'
    ]
  },
  {
    id: 'sop-ragging',
    title: 'Anti-Ragging & Harassment Protocol',
    icon: '🤝',
    category: 'HARASSMENT',
    badge: 'CONFIDENTIAL',
    desc: 'Zero-tolerance student protection, confidential reporting, and immediate intervention.',
    steps: [
      'CampusShield provides encrypted, anonymous report logging.',
      'Immediate contact: National Toll-Free Helpline (1800-180-5522).',
      'The Anti-Ragging Flying Squad conducts unannounced hostel inspections.',
      'Strict confidentiality: Complainant identities are legally protected.',
      'Confidential counseling and legal redressal facilitated at Welfare Office.'
    ]
  },
  {
    id: 'sop-weather',
    title: 'Severe Storm & Flash Flood Safety',
    icon: '⛈️',
    category: 'NATURAL_HAZARD',
    badge: 'WARNING',
    desc: 'Safety guidelines during heavy monsoon rainfall, flooding, and lightning storms.',
    steps: [
      'Avoid low-lying underpasses and library basement passages during rain.',
      'Use high-ground elevated walkways connecting Admin Block and Academic Wings.',
      'Unplug sensitive electronic lab equipment during active lightning surges.',
      'Stay indoors; do not take shelter under solitary trees on sports grounds.'
    ]
  },
  {
    id: 'sop-hazmat',
    title: 'Chemical & Laboratory Hazmat Spill',
    icon: '🧪',
    category: 'FACILITY_CONCERN',
    badge: 'HIGH',
    desc: 'Containment guidelines for chemistry, metallurgy, and chemical engineering laboratories.',
    steps: [
      'Alert lab instructor and evacuate the laboratory room immediately.',
      'Shut off local fume hood and main gas supply valve outside the laboratory.',
      'Do not attempt cleanup without appropriate chemical-resistant PPE.',
      'Safety desk dispatches emergency ventilation crew and neutralization team.'
    ]
  }
];

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
  showToast('Signed out of safety console', 'info');
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

    // Fill settings tab
    const sName = document.getElementById('settingsUserName');
    const sEmail = document.getElementById('settingsUserEmail');
    const sRole = document.getElementById('settingsUserRole');
    if (sName) sName.textContent = state.user.name;
    if (sEmail) sEmail.textContent = state.user.email;
    if (sRole) sRole.textContent = state.user.role;
  } else {
    profileChip.classList.add('hidden');
  }
}

// ── Toasts ──
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

window.copyText = function(text, successMsg = 'Copied to clipboard') {
  navigator.clipboard.writeText(text).then(() => {
    showToast(successMsg, 'success');
  }).catch(() => {
    showToast(`Phone: ${text}`, 'info');
  });
};

// ── Audio Siren Synthesizer ──
function toggleSiren() {
  const btn = document.getElementById('sirenBtn');
  const btnText = document.getElementById('sirenBtnText');
  const strobe = document.getElementById('strobeOverlay');

  if (state.sirenActive) {
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
      console.warn('Web Audio gesture required:', e);
    }

    showToast('🚨 DISTRESS SIREN ACTIVATED — DRAWING CAMPUS ATTENTION', 'error');
  }
}

// ── Virtual Safety Escort Walk ──
window.setEscortRoute = function(origin, dest) {
  document.getElementById('escortOrigin').value = origin;
  document.getElementById('escortDestination').value = dest;
  showToast(`Route preset selected: ${origin} → ${dest}`, 'info');
};

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
      autoDispatchEscortAlert(origin, dest);
    }
  }, 1000);

  showToast(`Safety Escort activated for ${minutes} mins. Campus security monitoring started.`, 'success');
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
  const tableBody = document.getElementById('incidentTableBody');
  const statusFilter = document.getElementById('statusFilterSelect')?.value || '';
  const priorityFilter = document.getElementById('priorityFilterSelect')?.value || '';
  const categoryFilter = document.getElementById('categoryFilterSelect')?.value || '';
  const search = document.getElementById('incidentSearchInput')?.value.trim() || '';

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
      data = await api('/api/incidents/my?limit=50');
    }

    state.incidents = data.items || [];
    renderIncidentsCards(state.incidents);
    renderIncidentsTable(state.incidents);

    // Update Metrics
    const total = state.incidents.length;
    const newCount = state.incidents.filter(i => i.status === 'NEW').length;
    const sosCount = state.incidents.filter(i => i.isSos && i.status !== 'RESOLVED').length;
    const resCount = state.incidents.filter(i => i.status === 'RESOLVED').length;

    const elTotal = document.getElementById('queueTotalVal');
    const elNew = document.getElementById('queueNewVal');
    const elSos = document.getElementById('queueSosVal');
    const elRes = document.getElementById('queueResolvedVal');
    if (elTotal) elTotal.textContent = total;
    if (elNew) elNew.textContent = newCount;
    if (elSos) elSos.textContent = sosCount;
    if (elRes) elRes.textContent = resCount;

    // Ticker updates
    const tSos = document.getElementById('tickerSosCount');
    const tOpen = document.getElementById('tickerOpenCount');
    if (tSos) tSos.textContent = sosCount;
    if (tOpen) tOpen.textContent = newCount;

    const badge = document.getElementById('sosBadgeCount');
    if (badge) {
      if (sosCount > 0) {
        badge.textContent = sosCount;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  } catch (err) {
    if (container) container.innerHTML = `<div class="empty-state-card">⚠️ Could not load incidents: ${err.message}. Sign in as Responder or Student.</div>`;
  }
}

function renderIncidentsCards(items) {
  const container = document.getElementById('incidentListContainer');
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = '<div class="empty-state-card" style="grid-column: 1/-1;">No incidents match the active filters. All campus sectors clear!</div>';
    return;
  }

  container.innerHTML = items.map(inc => {
    const isSos = inc.isSos;
    const landmark = inc.location?.campusLandmark || (inc.location?.latitude ? `${inc.location.latitude.toFixed(4)}, ${inc.location.longitude.toFixed(4)}` : 'Campus Quad');
    const dateStr = new Date(inc.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let escalationBadge = '';
    if (isSos && inc.status === 'NEW') {
      const elapsedSec = Math.floor((Date.now() - new Date(inc.createdAt).getTime()) / 1000);
      if (elapsedSec >= 60) {
        escalationBadge = `<span class="badge" style="background: #ef4444; color: #fff; animation: pulseDot 1.5s infinite;">🚨 ESCALATED (60s+)</span>`;
      } else {
        escalationBadge = `<span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #f59e0b;">⏱️ Escalates in ${60 - elapsedSec}s</span>`;
      }
    }

    return `
      <div class="incident-card ${isSos ? 'sos-highlight' : ''}" onclick="openIncidentModal('${inc.id}')">
        <div class="incident-header-row">
          <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
            <span class="badge badge-${inc.priority.toLowerCase()}">${inc.priority}</span>
            ${escalationBadge}
          </div>
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

function renderIncidentsTable(items) {
  const tbody = document.getElementById('incidentTableBody');
  if (!tbody) return;

  if (!items || items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 24px;">No incidents match the active criteria.</td></tr>';
    return;
  }

  tbody.innerHTML = items.map(inc => {
    const landmark = inc.location?.campusLandmark || (inc.location?.buildingOrRoom ? inc.location.buildingOrRoom : 'Campus Quad');
    const timeStr = new Date(inc.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return `
      <tr onclick="openIncidentModal('${inc.id}')" style="cursor: pointer;">
        <td><span class="table-id">#${inc.id.slice(0, 8).toUpperCase()}</span></td>
        <td><strong>${inc.isSos ? '🆘 ' : ''}${escapeHtml(inc.title)}</strong></td>
        <td><span style="font-size: 12px; color: var(--text-muted);">${inc.category.replace('_', ' ')}</span></td>
        <td><span class="badge badge-${inc.priority.toLowerCase()}">${inc.priority}</span></td>
        <td><span class="badge badge-status-${inc.status.toLowerCase()}">${inc.status.replace('_', ' ')}</span></td>
        <td>📍 ${escapeHtml(landmark)}</td>
        <td>${escapeHtml(inc.reporter?.name || 'Student')}</td>
        <td>${timeStr}</td>
        <td><button class="btn-ghost-sm" onclick="event.stopPropagation(); openIncidentModal('${inc.id}')">View Details →</button></td>
      </tr>
    `;
  }).join('');
}

// ── Export Queue as CSV ──
function exportQueueAsCsv() {
  if (!state.incidents || state.incidents.length === 0) {
    showToast('No incidents to export.', 'info');
    return;
  }

  const headers = ['Incident ID', 'Title', 'Category', 'Priority', 'Status', 'Is SOS', 'Landmark', 'Reporter', 'Created At'];
  const rows = state.incidents.map(i => [
    i.id,
    `"${(i.title || '').replace(/"/g, '""')}"`,
    i.category,
    i.priority,
    i.status,
    i.isSos ? 'YES' : 'NO',
    `"${(i.location?.campusLandmark || '').replace(/"/g, '""')}"`,
    `"${(i.reporter?.name || '').replace(/"/g, '""')}"`,
    i.createdAt,
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `campusshield_incidents_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  showToast('Incident queue exported as CSV ✅', 'success');
}

// ── Student's My Reports View ──
async function loadMyReports() {
  const container = document.getElementById('myReportsContainer');
  const activeStatusChip = document.querySelector('#myReportsFilterChips .chip.active');
  const statusFilter = activeStatusChip?.dataset.status || '';

  try {
    let url = '/api/incidents/my?limit=50';
    if (statusFilter) url += `&status=${statusFilter}`;
    const data = await api(url);
    state.myIncidents = data.items || [];

    const badge = document.getElementById('myReportsBadge');
    if (badge) {
      if (state.myIncidents.length > 0) {
        badge.textContent = state.myIncidents.length;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    if (state.myIncidents.length === 0) {
      container.innerHTML = `
        <div class="empty-state-card" style="grid-column: 1/-1;">
          <h3>No reports found</h3>
          <p>You haven't filed any reports matching this filter. Reports and SOS alerts filed under your account appear here.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = state.myIncidents.map(inc => {
      const landmark = inc.location?.campusLandmark || 'Campus Quad';
      const timeStr = new Date(inc.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
      return `
        <div class="incident-card ${inc.isSos ? 'sos-highlight' : ''}" onclick="openIncidentModal('${inc.id}')">
          <div class="incident-header-row">
            <span class="badge badge-${inc.priority.toLowerCase()}">${inc.priority}</span>
            <span class="badge badge-status-${inc.status.toLowerCase()}">${inc.status.replace('_', ' ')}</span>
          </div>
          <div class="incident-title">${escapeHtml(inc.title)}</div>
          <div class="incident-desc">${escapeHtml(inc.description)}</div>
          <div class="incident-meta-row">
            <span>📍 ${escapeHtml(landmark)}</span>
            <span>🕒 ${timeStr}</span>
          </div>
          <div style="margin-top: 10px; font-size: 12px; font-weight: 700; color: var(--primary);">
            Track Resolution History →
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    if (container) container.innerHTML = `<div class="empty-state-card">Could not load reports: ${err.message}. Sign in to view your reports.</div>`;
  }
}

// ── Incident Modal & Lifecycle Stepper ──
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

    // Stepper updates
    const steps = ['NEW', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED'];
    const currentIdx = steps.indexOf(inc.status);
    const nodes = [document.getElementById('stepNew'), document.getElementById('stepAck'), document.getElementById('stepProg'), document.getElementById('stepRes')];
    const bars = [document.getElementById('bar1'), document.getElementById('bar2'), document.getElementById('bar3')];

    nodes.forEach((n, idx) => {
      n.className = 'step-node';
      if (idx < currentIdx) n.classList.add('done');
      else if (idx === currentIdx) n.classList.add('active');
    });

    bars.forEach((b, idx) => {
      b.className = 'step-bar';
      if (idx < currentIdx) b.classList.add('done');
    });

    // Guidance directive text
    const matchedProtocol = PROTOCOLS.find(p => p.category === inc.category);
    const guidanceEl = document.getElementById('modalGuidanceText');
    if (guidanceEl) {
      guidanceEl.textContent = matchedProtocol
        ? `${matchedProtocol.title}: ${matchedProtocol.steps[0]}`
        : 'Authorized campus responders are tracking this incident. Comply with instructions on site.';
    }

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
      const tokenQuery = state.accessToken ? `?token=${encodeURIComponent(state.accessToken)}` : '';
      photoImg.src = `/api/incidents/${inc.id}/photo${tokenQuery}`;
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
    timeline.innerHTML = history.map(h => {
      const isAutoEscalated = h.responderNotes && h.responderNotes.includes('AUTO-ESCALATION');
      return `
        <div class="timeline-item" style="${isAutoEscalated ? 'border-left: 2px solid #ef4444; padding-left: 8px;' : ''}">
          <div class="timeline-dot" style="${isAutoEscalated ? 'background: #ef4444;' : ''}"></div>
          <div>
            <div><strong>${isAutoEscalated ? '🚨 AUTO-ESCALATED' : h.newStatus}</strong> &bull; <small>${new Date(h.createdAt).toLocaleTimeString()}</small> by ${h.updater?.name || 'Staff'}</div>
            ${h.responderNotes ? `<div style="color: ${isAutoEscalated ? '#ef4444' : 'var(--text-muted)'}; font-size: 12px; margin-top: 2px; font-weight: ${isAutoEscalated ? '600' : 'normal'};">${escapeHtml(h.responderNotes)}</div>` : ''}
          </div>
        </div>
      `;
    }).join('') || '<div style="font-size: 12.5px; color: var(--text-muted);">Awaiting responder action.</div>';

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
    loadMyReports();
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
    loadMyReports();
  } catch (err) {
    showToast(`SOS submission error: ${err.message}`, 'error');
  }
}

// ── Safety Check-In ──
async function submitCheckin(status) {
  try {
    await api('/api/checkins', {
      method: 'POST',
      body: {
        status,
        note: status === 'SAFE' ? 'Checked in safe from Web Portal' : 'Requested urgent assistance via Web Portal'
      }
    });
    const pill = document.getElementById('myRecentCheckin');
    if (pill) {
      pill.textContent = `Last check-in: ${status} (${new Date().toLocaleTimeString()})`;
    }
    showToast(status === 'SAFE' ? 'Check-in recorded: SAFE' : '🆘 Security alerted that you need help!', status === 'SAFE' ? 'success' : 'error');
  } catch (err) {
    showToast(`Check-in failed: ${err.message}`, 'error');
  }
}

// ── Safety Map ──
async function loadSafetyMap() {
  const container = document.getElementById('safetyPointsList');
  const markersLayer = document.getElementById('mapMarkersLayer');
  const filter = document.querySelector('#mapCategoryChips .chip.active')?.dataset.category || '';
  const search = document.getElementById('mapSearchInput')?.value.trim().toLowerCase() || '';

  try {
    const data = await api(`/api/safety-points${filter ? `?category=${filter}` : ''}`);
    state.safetyPoints = data.items || [];

    const filtered = search
      ? state.safetyPoints.filter(p => p.name.toLowerCase().includes(search) || (p.locationDescription || '').toLowerCase().includes(search))
      : state.safetyPoints;

    container.innerHTML = filtered.map(p => `
      <div class="point-card" onclick="highlightMapPin('${p.id}')">
        <div class="point-name">${escapeHtml(p.name)}</div>
        <div class="point-meta">${p.category.replace('_', ' ')} &bull; ${escapeHtml(p.locationDescription || '')}</div>
      </div>
    `).join('') || '<div class="empty-state-card">No points in this category.</div>';

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
    if (container) container.innerHTML = `<div class="empty-state-card">⚠️ Could not load map points: ${e.message}</div>`;
  }
}

function highlightMapPin(id) {
  const p = state.safetyPoints.find(x => x.id === id);
  if (p) showToast(`📍 ${p.name}: ${p.locationDescription || p.category}`, 'info');
}

// ── Helplines & Personal Contacts ──
async function loadContacts() {
  const container = document.getElementById('personalContactsList');
  if (!container) return;

  try {
    const data = await api('/api/contacts');
    state.contacts = data.items || [];

    if (state.contacts.length === 0) {
      container.innerHTML = '<div class="empty-state-card">No personal emergency contacts added yet. Click "+ Add Personal Contact" above.</div>';
      return;
    }

    container.innerHTML = state.contacts.map(c => `
      <div class="personal-contact-item">
        <div>
          <strong style="font-size: 14px; color: var(--text-main);">${escapeHtml(c.name)}</strong>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
            ${c.phone} ${c.relation ? `&bull; ${escapeHtml(c.relation)}` : ''}
          </div>
        </div>
        <div style="display: flex; gap: 6px;">
          <a href="tel:${c.phone}" class="btn-call" style="padding: 4px 8px;">📞 Call</a>
          <button class="btn-ghost-sm" onclick="deleteContact('${c.id}')" style="color: var(--danger);">🗑️</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    container.innerHTML = `<div class="empty-state-card">Sign in to view and manage personal contacts.</div>`;
  }
}

async function deleteContact(id) {
  try {
    await api(`/api/contacts/${id}`, { method: 'DELETE' });
    showToast('Contact removed', 'info');
    loadContacts();
  } catch (e) {
    showToast(`Could not delete contact: ${e.message}`, 'error');
  }
}

// ── Safety Protocols & SOPs ──
function renderProtocols() {
  const grid = document.getElementById('protocolsGrid');
  if (!grid) return;

  grid.innerHTML = PROTOCOLS.map(p => `
    <div class="protocol-card">
      <div class="protocol-top">
        <div class="protocol-icon-title">
          <span class="protocol-icon">${p.icon}</span>
          <span class="protocol-title">${escapeHtml(p.title)}</span>
        </div>
        <span class="badge ${p.badge === 'CRITICAL' ? 'badge-critical' : p.badge === 'HIGH' ? 'badge-high' : 'badge-low'}">${p.badge}</span>
      </div>
      <p class="protocol-desc">${escapeHtml(p.desc)}</p>
      <div class="protocol-checklist">
        ${p.steps.map((st, i) => `
          <div class="checklist-step">
            <span class="step-num">${i + 1}</span>
            <span>${escapeHtml(st)}</span>
          </div>
        `).join('')}
      </div>
      <button class="btn-secondary" style="margin-top: auto; font-size: 12.5px;" onclick="showToast('Protocol active: ${escapeHtml(p.title)}', 'info')">
        ✓ Verify Campus Unit Readiness
      </button>
    </div>
  `).join('');
}

// ── Campus User Directory (Admin) ──
async function loadUsers() {
  const tbody = document.getElementById('userTableBody');
  if (!tbody) return;

  const role = document.getElementById('userRoleFilter')?.value || '';
  const search = document.getElementById('userSearchInput')?.value.trim() || '';

  try {
    let url = '/api/admin/users?limit=50';
    if (role) url += `&role=${role}`;
    if (search) url += `&q=${encodeURIComponent(search)}`;

    const data = await api(url);
    state.users = data.items || [];

    tbody.innerHTML = state.users.map(u => `
      <tr>
        <td><strong>${escapeHtml(u.name)}</strong></td>
        <td>${escapeHtml(u.email)}</td>
        <td><span class="badge ${u.role === 'ADMIN' ? 'badge-high' : u.role === 'RESPONDER' ? 'badge-critical' : 'badge-low'}">${u.role}</span></td>
        <td><span style="color: var(--success); font-weight: 600;">● Active Credential</span></td>
        <td>${new Date(u.createdAt).toLocaleDateString()}</td>
      </tr>
    `).join('') || '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">No users match criteria.</td></tr>';
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">🔒 Admin access required to view campus user roster. Sign in as Admin.</td></tr>`;
  }
}

// ── Analytics ──
async function loadAnalytics() {
  try {
    const data = await api('/api/responder/analytics');
    const elTot = document.getElementById('metricTotalIncidents');
    const elSos = document.getElementById('metricSos24h');
    const elOpen = document.getElementById('metricOpenNow');
    const elAvg = document.getElementById('metricAvgResTime');

    if (elTot) elTot.textContent = data.totals?.incidents || 0;
    if (elSos) elSos.textContent = data.totals?.sosLast24h || 0;
    if (elOpen) elOpen.textContent = data.totals?.openNow || 0;
    if (elAvg) elAvg.textContent = data.avgResolutionMinutes != null ? `${data.avgResolutionMinutes}m` : 'N/A';

    const chart = document.getElementById('trendChartContainer');
    const series = data.series7d || [];
    const maxVal = Math.max(...series.map(s => s.total), 1);

    if (chart) {
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
    }

    const breakdown = document.getElementById('categoryBreakdownContainer');
    if (breakdown) {
      breakdown.innerHTML = Object.entries(data.byCategory || {}).map(([cat, count]) => `
        <div class="breakdown-row">
          <span>${cat.replace('_', ' ')}</span>
          <strong>${count}</strong>
        </div>
      `).join('') || '<div class="empty-state-card">No incidents recorded yet.</div>';
    }
  } catch (e) {
    console.warn('Analytics unavailable for current role:', e);
  }
}

// ── Announcements ──
async function loadAnnouncements() {
  const container = document.getElementById('announcementsList');
  const activeChip = document.querySelector('#annFilterChips .chip.active');
  const sevFilter = activeChip?.dataset.sev || '';

  try {
    const data = await api('/api/announcements');
    let items = data.items || [];
    if (sevFilter) items = items.filter(a => a.severity === sevFilter);

    if (!container) return;
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
    if (container) container.innerHTML = `<div class="empty-state-card">Could not load broadcasts.</div>`;
  }
}

// ── Quick Login Function ──
window.quickLogin = async function(email, password) {
  try {
    const data = await api('/api/auth/login', { method: 'POST', body: { email, password } });
    setSession(data.user, data.accessToken, data.refreshToken);
    showToast(`Signed in as ${data.user.name} (${data.user.role})`, 'success');
    loadIncidents();
    loadMyReports();
    loadContacts();
    loadAnalytics();
    if (data.user.role === 'ADMIN') loadUsers();
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
    // Default to responder demo for instant active console
    quickLogin('responder@securebyte.dev', 'Responder@123');
  }

  // Health check
  try {
    const health = await fetch('/api/health').then(r => r.json());
    if (health?.data?.database === 'connected') {
      document.getElementById('systemStatusText').textContent = 'Live • Database Online • BIT Sindri Active';
      document.querySelector('.status-dot').classList.add('online');
    }
  } catch (e) {
    document.getElementById('systemStatusText').textContent = 'API Offline';
  }

  // Navigation tab switching
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const pane = document.getElementById(btn.dataset.tab);
      if (pane) pane.classList.add('active');

      // Close mobile menu drawer on selection
      document.getElementById('appSidebar')?.classList.remove('mobile-open');

      if (btn.dataset.tab === 'mapTab') loadSafetyMap();
      if (btn.dataset.tab === 'myReportsTab') loadMyReports();
      if (btn.dataset.tab === 'contactsTab') loadContacts();
      if (btn.dataset.tab === 'analyticsTab') loadAnalytics();
      if (btn.dataset.tab === 'announcementsTab') loadAnnouncements();
      if (btn.dataset.tab === 'protocolsTab') renderProtocols();
      if (btn.dataset.tab === 'usersTab') loadUsers();
    });
  });

  // Mobile menu drawer button
  document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
    document.getElementById('appSidebar')?.classList.toggle('mobile-open');
  });

  // View toggle: Cards vs Table
  document.getElementById('viewCardsBtn')?.addEventListener('click', () => {
    state.activeViewMode = 'cards';
    document.getElementById('viewCardsBtn').classList.add('active');
    document.getElementById('viewTableBtn').classList.remove('active');
    document.getElementById('incidentListContainer').classList.remove('hidden');
    document.getElementById('incidentTableContainer').classList.add('hidden');
  });

  document.getElementById('viewTableBtn')?.addEventListener('click', () => {
    state.activeViewMode = 'table';
    document.getElementById('viewTableBtn').classList.add('active');
    document.getElementById('viewCardsBtn').classList.remove('active');
    document.getElementById('incidentTableContainer').classList.remove('hidden');
    document.getElementById('incidentListContainer').classList.add('hidden');
  });

  // Export CSV button
  document.getElementById('exportCsvBtn')?.addEventListener('click', exportQueueAsCsv);

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
      loadMyReports();
    } catch (err) {
      showToast(`Submission failed: ${err.message}`, 'error');
    }
  });

  // My Reports tab actions
  document.getElementById('myReportsNewBtn')?.addEventListener('click', () => {
    document.querySelector('[data-tab="studentTab"]').click();
  });
  document.getElementById('myReportsRefreshBtn')?.addEventListener('click', loadMyReports);
  document.querySelectorAll('#myReportsFilterChips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#myReportsFilterChips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      loadMyReports();
    });
  });

  // Map Category Chips & Search
  document.querySelectorAll('#mapCategoryChips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#mapCategoryChips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      loadSafetyMap();
    });
  });
  document.getElementById('mapSearchInput')?.addEventListener('input', () => {
    loadSafetyMap();
  });

  // Announcement Filters
  document.querySelectorAll('#annFilterChips .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#annFilterChips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      loadAnnouncements();
    });
  });

  // Announcement Modal
  document.getElementById('openAnnouncementModalBtn')?.addEventListener('click', () => {
    document.getElementById('announcementModal').classList.remove('hidden');
  });
  document.getElementById('closeAnnouncementModalBtn')?.addEventListener('click', () => {
    document.getElementById('announcementModal').classList.add('hidden');
  });
  document.getElementById('newAnnouncementForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('annTitle').value.trim();
    const severity = document.getElementById('annSeverity').value;
    const message = document.getElementById('annMessage').value.trim();

    try {
      await api('/api/responder/announcements', {
        method: 'POST',
        body: { title, severity, message }
      });
      showToast('Announcement broadcasted to campus!', 'success');
      e.target.reset();
      document.getElementById('announcementModal').classList.add('hidden');
      loadAnnouncements();
    } catch (err) {
      showToast(`Failed to publish: ${err.message}`, 'error');
    }
  });

  // Personal Contact Modal
  document.getElementById('openAddContactBtn')?.addEventListener('click', () => {
    document.getElementById('addContactModal').classList.remove('hidden');
  });
  document.getElementById('closeAddContactModalBtn')?.addEventListener('click', () => {
    document.getElementById('addContactModal').classList.add('hidden');
  });
  document.getElementById('newContactForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('contactNameInput').value.trim();
    const phone = document.getElementById('contactPhoneInput').value.trim();
    const relation = document.getElementById('contactRelationInput').value.trim();

    try {
      await api('/api/contacts', {
        method: 'POST',
        body: { name, phone, relation: relation || undefined }
      });
      showToast('Emergency contact saved', 'success');
      e.target.reset();
      document.getElementById('addContactModal').classList.add('hidden');
      loadContacts();
    } catch (err) {
      showToast(`Could not save contact: ${err.message}`, 'error');
    }
  });

  // Change Password Form
  document.getElementById('changePasswordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = document.getElementById('currentPasswordInput').value;
    const newPassword = document.getElementById('newPasswordInput').value;
    const confirmPassword = document.getElementById('confirmPasswordInput').value;

    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match', 'error');
      return;
    }

    try {
      await api('/api/auth/password', {
        method: 'PATCH',
        body: { currentPassword, newPassword }
      });
      showToast('Password updated successfully! Re-signing in…', 'success');
      e.target.reset();
      clearSession();
      quickLogin(state.user?.email || 'student@securebyte.dev', newPassword);
    } catch (err) {
      showToast(`Password update failed: ${err.message}`, 'error');
    }
  });

  // Filters & Search
  document.getElementById('statusFilterSelect')?.addEventListener('change', loadIncidents);
  document.getElementById('priorityFilterSelect')?.addEventListener('change', loadIncidents);
  document.getElementById('categoryFilterSelect')?.addEventListener('change', loadIncidents);
  document.getElementById('incidentSearchInput')?.addEventListener('input', () => {
    clearTimeout(window._searchDebounce);
    window._searchDebounce = setTimeout(loadIncidents, 250);
  });
  document.getElementById('refreshQueueBtn')?.addEventListener('click', loadIncidents);
  document.getElementById('refreshAnalyticsBtn')?.addEventListener('click', loadAnalytics);
  document.getElementById('refreshUsersBtn')?.addEventListener('click', loadUsers);
  document.getElementById('userRoleFilter')?.addEventListener('change', loadUsers);
  document.getElementById('userSearchInput')?.addEventListener('input', () => {
    clearTimeout(window._userDebounce);
    window._userDebounce = setTimeout(loadUsers, 250);
  });

  // Incident Modal
  document.getElementById('closeModalBtn')?.addEventListener('click', () => {
    document.getElementById('incidentModal').classList.add('hidden');
  });
  document.getElementById('btnAcknowledge')?.addEventListener('click', () => updateIncidentStatus('ACKNOWLEDGED'));
  document.getElementById('btnInProgress')?.addEventListener('click', () => updateIncidentStatus('IN_PROGRESS'));
  document.getElementById('btnResolve')?.addEventListener('click', () => updateIncidentStatus('RESOLVED'));

  document.getElementById('logoutBtn')?.addEventListener('click', clearSession);

  // Initial load & Polling
  loadIncidents();
  renderProtocols();
  setInterval(loadIncidents, 5000);
});
