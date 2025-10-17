// =================== CONFIGURATION ===================
// Change this to your backend API URL
const API_BASE_URL = 'http://localhost:6140/api';

// =================== STATE ===================
let chargers = [];
let summary = null;
let selectedCharger = null;
let logs = [];
let updateInterval = null;
let apiEndpoints = [];
let openEndpoints = {};

// =================== INITIALIZATION ===================
document.addEventListener('DOMContentLoaded', function() {
  showLoading(true);
  fetchChargers();
  fetchLogs();
  initializeAPIExplorer();
  
  updateInterval = setInterval(function() {
    fetchChargers();
    if (selectedCharger) {
      fetchChargerDetails(selectedCharger.charger.id_charger);
    }
  }, 10000);
});

// =================== API CALLS ===================
async function fetchChargers() {
  try {
    const response = await fetch(API_BASE_URL + '/chargers/detailed');
    const data = await response.json();
    chargers = data.chargers || [];
    summary = data.summary || {};
    renderDashboard();
    showLoading(false);
  } catch (error) {
    console.error('Error fetching chargers:', error);
    showLoading(false);
    alert('Error loading chargers. Check console for details.');
  }
}

async function fetchChargerDetails(id) {
  try {
    const response = await fetch(API_BASE_URL + '/chargers/' + id);
    const data = await response.json();
    selectedCharger = data;
    renderChargerDetails();
  } catch (error) {
    console.error('Error fetching charger details:', error);
    alert('Error loading charger details');
  }
}

async function fetchLogs() {
  try {
    const response = await fetch(API_BASE_URL + '/logs?include_blockchain=true');
    const data = await response.json();
    logs = data.database_logs || [];
  } catch (error) {
    console.error('Error fetching logs:', error);
  }
}

async function executeAction(chargerId, action) {
  try {
    const response = await fetch(API_BASE_URL + '/chargers/' + chargerId + '/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: action })
    });
    const data = await response.json();
    alert(data.message || 'Action completed');
    await fetchChargers();
    if (selectedCharger && selectedCharger.charger && selectedCharger.charger.id_charger === chargerId) {
      await fetchChargerDetails(chargerId);
    }
  } catch (error) {
    console.error('Error executing action:', error);
    alert('Error executing action');
  }
}

async function createCharger(event) {
  event.preventDefault();
  
  const chargerData = {
    id_charger: document.getElementById('input-id').value,
    owner_address: document.getElementById('input-owner').value,
    location: document.getElementById('input-location').value || 'Not specified',
    description: document.getElementById('input-description').value || 'Standard charger',
    battery: parseFloat(document.getElementById('input-battery').value),
    power: parseFloat(document.getElementById('input-power').value),
    status: document.getElementById('input-status').value
  };

  try {
    const response = await fetch(API_BASE_URL + '/chargers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chargerData)
    });
    const data = await response.json();
    alert('Charger created successfully!');
    closeCreateModal();
    await fetchChargers();
  } catch (error) {
    console.error('Error creating charger:', error);
    alert('Error creating charger');
  }
}

async function simulateTransaction(chargerId, amount) {
  try {
    const response = await fetch(API_BASE_URL + '/chargers/' + chargerId + '/simulate_transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount_eth: amount })
    });
    const data = await response.json();
    alert(data.message || 'Transaction simulated');
    await fetchChargers();
  } catch (error) {
    console.error('Error simulating transaction:', error);
    alert('Error simulating transaction');
  }
}

// =================== RENDER FUNCTIONS ===================
function renderDashboard() {
  renderStats();
  renderChargers();
  renderActivity();
}

function renderStats() {
  const container = document.getElementById('stats-container');
  
  const stats = [
    {
      icon: 'zap',
      title: 'Total Chargers',
      value: summary ? summary.total_chargers || 0 : 0,
      subtitle: (summary ? summary.active_chargers || 0 : 0) + ' active',
      color: 'blue'
    },
    {
      icon: 'trending',
      title: 'Total Transactions',
      value: summary ? summary.total_transactions || 0 : 0,
      subtitle: 'All time',
      color: 'green'
    },
    {
      icon: 'dollar',
      title: 'Total Income',
      value: (summary ? summary.total_income || 0 : 0).toFixed(4) + ' ETH',
      subtitle: 'Balance: ' + (summary ? summary.total_balance || 0 : 0).toFixed(4) + ' ETH',
      color: 'purple'
    },
    {
      icon: 'battery',
      title: 'Avg Battery',
      value: (summary ? summary.average_battery_level || 0 : 0).toFixed(1) + '%',
      subtitle: (summary ? summary.low_battery_chargers || 0 : 0) + ' low battery',
      color: 'orange'
    }
  ];

  container.innerHTML = stats.map(function(stat) {
    return '<div class="stat-card">' +
      '<div class="stat-icon ' + stat.color + '">' +
      getIcon(stat.icon) +
      '</div>' +
      '<p class="stat-title">' + stat.title + '</p>' +
      '<p class="stat-value">' + stat.value + '</p>' +
      '<p class="stat-subtitle">' + stat.subtitle + '</p>' +
      '</div>';
  }).join('');
}

function renderChargers() {
  const container = document.getElementById('chargers-container');
  
  if (chargers.length === 0) {
    container.innerHTML = '<p class="empty-state">No chargers available</p>';
    return;
  }

  container.innerHTML = chargers.map(function(charger) {
    return '<div class="charger-card" onclick="selectCharger(\'' + charger.id_charger + '\')">' +
      '<div class="charger-header">' +
      '<h3 class="charger-title">' + charger.id_charger + '</h3>' +
      '<span class="charger-status ' + charger.status + '">' +
      charger.status.toUpperCase() +
      '</span>' +
      '</div>' +
      '<div class="charger-info">' +
      '<div class="info-row">' +
      getIcon('map-pin') +
      '<span>' + charger.location + '</span>' +
      '</div>' +
      '<div class="info-row battery-indicator">' +
      '<span class="' + getBatteryClass(charger.battery) + '">' +
      getIcon('battery') +
      '</span>' +
      '<span>' + (charger.battery ? charger.battery.toFixed(1) : '0') + '%</span>' +
      (charger.battery_alert ? getIcon('alert') : '') +
      '</div>' +
      '<div class="charger-metrics">' +
      '<p>Transactions: ' + charger.transactions + '</p>' +
      '<p>Balance: ' + (charger.balance_total ? charger.balance_total.toFixed(6) : '0') + ' ETH</p>' +
      '</div>' +
      '</div>' +
      '</div>';
  }).join('');
}

function renderActivity() {
  const container = document.getElementById('activity-container');
  
  if (logs.length === 0) {
    container.innerHTML = '<p class="empty-state">No activity yet</p>';
    return;
  }

  container.innerHTML = logs.slice(0, 20).map(function(log) {
    return '<div class="activity-item">' +
      '<div class="activity-content">' +
      '<div class="activity-icon">' +
      getIcon('activity') +
      '</div>' +
      '<div class="activity-info">' +
      '<p>' + log.charger_id + '</p>' +
      '<p>' + log.message + '</p>' +
      '</div>' +
      '</div>' +
      '<span class="activity-time">' +
      formatDate(log.timestamp) +
      '</span>' +
      '</div>';
  }).join('');
}

function renderChargerDetails() {
  if (!selectedCharger) {
    document.getElementById('charger-details-container').innerHTML = 
      '<div class="empty-state"><p>Select a charger to view details</p></div>';
    return;
  }

  const charger = selectedCharger.charger;
  const financial = selectedCharger.financial;
  const blockchain = selectedCharger.blockchain;
  const schedule = selectedCharger.schedule;
  const recent_activity = selectedCharger.recent_activity;

  const html = '<div class="detail-header">' +
    '<div class="detail-header-top">' +
    '<div class="detail-header-info">' +
    '<h2>' + charger.id_charger + '</h2>' +
    '<div class="detail-location">' +
    getIcon('map-pin') +
    '<span>' + charger.location + '</span>' +
    '</div>' +
    '<p class="detail-description">' + charger.description + '</p>' +
    '</div>' +
    '<span class="charger-status ' + charger.status + '">' +
    charger.status.toUpperCase() +
    '</span>' +
    '</div>' +
    '<div class="metrics-grid">' +
    '<div class="metric-box">' +
    '<span class="' + getBatteryClass(charger.battery.level) + ' metric-icon">' +
    getIcon('battery') +
    '</span>' +
    '<div class="metric-info">' +
    '<p>Battery</p>' +
    '<p>' + charger.battery.level.toFixed(1) + '%</p>' +
    '<p>' + charger.battery.status + '</p>' +
    '</div>' +
    '</div>' +
    '<div class="metric-box">' +
    '<span class="metric-icon" style="color: #2563eb;">' +
    getIcon('zap') +
    '</span>' +
    '<div class="metric-info">' +
    '<p>Power</p>' +
    '<p>' + charger.power + ' kW</p>' +
    '<p>Charging capacity</p>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '<div class="metric-cards">' +
    '<div class="metric-card">' +
    '<div class="metric-card-header">' +
    '<span class="metric-card-title">Transactions</span>' +
    '<span class="metric-card-icon">' + getIcon('activity') + '</span>' +
    '</div>' +
    '<p class="metric-card-value">' + financial.transactions + '</p>' +
    '</div>' +
    '<div class="metric-card">' +
    '<div class="metric-card-header">' +
    '<span class="metric-card-title">Income</span>' +
    '<span class="metric-card-icon">' + getIcon('trending') + '</span>' +
    '</div>' +
    '<p class="metric-card-value">' + financial.income_generated.toFixed(6) + ' ETH</p>' +
    '</div>' +
    '<div class="metric-card">' +
    '<div class="metric-card-header">' +
    '<span class="metric-card-title">Costs</span>' +
    '<span class="metric-card-icon">' + getIcon('dollar') + '</span>' +
    '</div>' +
    '<p class="metric-card-value">' + financial.cost_generated.toFixed(6) + ' ETH</p>' +
    '</div>' +
    '<div class="metric-card">' +
    '<div class="metric-card-header">' +
    '<span class="metric-card-title">Balance</span>' +
    '<span class="metric-card-icon">' + getIcon('dollar') + '</span>' +
    '</div>' +
    '<p class="metric-card-value">' + financial.balance_total.toFixed(6) + ' ETH</p>' +
    '</div>' +
    '</div>' +
    '<div class="card">' +
    '<h3 class="card-title">Quick Actions</h3>' +
    '<div class="actions-grid">' +
    '<button class="action-btn" onclick="executeAction(\'' + charger.id_charger + '\', \'turn_on\')" ' +
    (charger.status === 'active' ? 'disabled' : '') + '>' +
    getIcon('power') +
    '<span>Turn On</span>' +
    '</button>' +
    '<button class="action-btn" onclick="executeAction(\'' + charger.id_charger + '\', \'turn_off\')" ' +
    (charger.status === 'inactive' ? 'disabled' : '') + '>' +
    getIcon('power') +
    '<span>Turn Off</span>' +
    '</button>' +
    '<button class="action-btn" onclick="executeAction(\'' + charger.id_charger + '\', \'restart\')">' +
    getIcon('refresh') +
    '<span>Restart</span>' +
    '</button>' +
    '<button class="action-btn" onclick="executeAction(\'' + charger.id_charger + '\', \'recharge_battery\')" ' +
    (charger.battery.level >= 100 ? 'disabled' : '') + '>' +
    getIcon('battery') +
    '<span>Recharge</span>' +
    '</button>' +
    '<button class="action-btn" onclick="executeAction(\'' + charger.id_charger + '\', \'pay_costs\')">' +
    getIcon('dollar') +
    '<span>Pay Costs</span>' +
    '</button>' +
    '<button class="action-btn" onclick="executeAction(\'' + charger.id_charger + '\', \'send_to_owner\')">' +
    getIcon('download') +
    '<span>Send to Owner</span>' +
    '</button>' +
    '<button class="action-btn" onclick="handleSimulateTransaction(\'' + charger.id_charger + '\')">' +
    getIcon('zap') +
    '<span>Simulate TX</span>' +
    '</button>' +
    '<button class="action-btn" onclick="executeAction(\'' + charger.id_charger + '\', \'create_ticket\')">' +
    getIcon('settings') +
    '<span>Support</span>' +
    '</button>' +
    '</div>' +
    '</div>';

  document.getElementById('charger-details-container').innerHTML = html;
}

// =================== UI FUNCTIONS ===================
function switchTab(tab) {
  document.querySelectorAll('.nav-btn').forEach(function(btn) {
    btn.classList.remove('active');
  });
  document.getElementById('nav-' + tab).classList.add('active');

  document.querySelectorAll('.tab-content').forEach(function(content) {
    content.classList.remove('active');
  });
  document.getElementById(tab + '-tab').classList.add('active');
}

function selectCharger(id) {
  fetchChargerDetails(id);
  switchTab('details');
}

function openCreateModal() {
  document.getElementById('create-modal').classList.add('active');
}

function closeCreateModal() {
  document.getElementById('create-modal').classList.remove('active');
  document.getElementById('create-charger-form').reset();
}

function showLoading(show) {
  const loading = document.getElementById('loading');
  if (show) {
    loading.classList.add('active');
  } else {
    loading.classList.remove('active');
  }
}

function handleSimulateTransaction(chargerId) {
  const amount = prompt('Enter ETH amount:');
  if (amount && !isNaN(amount)) {
    simulateTransaction(chargerId, parseFloat(amount));
  }
}

// =================== UTILITY FUNCTIONS ===================
function getBatteryClass(level) {
  if (level >= 80) return 'battery-good';
  if (level >= 50) return 'battery-medium';
  if (level >= 20) return 'battery-low';
  return 'battery-critical';
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString();
}

function getIcon(name) {
  const icons = {
    'zap': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>',
    'trending': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>',
    'dollar': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>',
    'battery': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="6" width="18" height="12" rx="2" ry="2"></rect><line x1="23" y1="13" x2="23" y2="11"></line></svg>',
    'map-pin': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>',
    'alert': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    'activity': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>',
    'power': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>',
    'refresh': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>',
    'download': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
    'settings': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M12 1v6m0 6v6m5.66-17L16 5.66M7.34 18.34L6 19.66M23 12h-6M7 12H1m16.66 5.66L19.66 19M4.34 4.34L5.66 5.66"></path></svg>',
    'code': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>',
    'copy': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
    'chevron-down': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>'
  };
  return icons[name] || '';
}

// =================== API EXPLORER ===================
function initializeAPIExplorer() {
  apiEndpoints = [
    {
      id: 'get-chargers-detailed',
      method: 'GET',
      path: '/api/chargers/detailed',
      description: 'Get detailed information about all chargers',
      params: []
    },
    {
      id: 'get-charger',
      method: 'GET',
      path: '/api/chargers/:id',
      description: 'Get detailed information about a specific charger',
      params: [
        { name: 'id', type: 'path', label: 'Charger ID', placeholder: 'e.g., charger_001', required: true }
      ]
    }
  ];

  renderAPIExplorer();
}

function renderAPIExplorer() {
  const container = document.getElementById('api-endpoints-container');
  container.innerHTML = '<p style="padding: 2rem; text-align: center; color: #6b7280;">API Explorer feature coming soon...</p>';
}

// =================== API CALLS ===================
async function fetchChargers() {
  try {
    const response = await fetch(`${API_BASE_URL}/chargers/detailed`);
    const data = await response.json();
    chargers = data.chargers || [];
    summary = data.summary || {};
    renderDashboard();
    showLoading(false);
  } catch (error) {
    console.error('Error fetching chargers:', error);
    showLoading(false);
    alert('Error loading chargers. Check console for details.');
  }
}

async function fetchChargerDetails(id) {
  try {
    const response = await fetch(`${API_BASE_URL}/chargers/${id}`);
    const data = await response.json();
    selectedCharger = data;
    renderChargerDetails();
  } catch (error) {
    console.error('Error fetching charger details:', error);
    alert('Error loading charger details');
  }
}

async function fetchLogs() {
  try {
    const response = await fetch(`${API_BASE_URL}/logs?include_blockchain=true`);
    const data = await response.json();
    logs = data.database_logs || [];
  } catch (error) {
    console.error('Error fetching logs:', error);
  }
}

async function executeAction(chargerId, action) {
  try {
    const response = await fetch(`${API_BASE_URL}/chargers/${chargerId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    const data = await response.json();
    alert(data.message || 'Action completed');
    await fetchChargers();
    if (selectedCharger?.charger?.id_charger === chargerId) {
      await fetchChargerDetails(chargerId);
    }
  } catch (error) {
    console.error('Error executing action:', error);
    alert('Error executing action');
  }
}

async function createCharger(event) {
  event.preventDefault();
  
  const chargerData = {
    id_charger: document.getElementById('input-id').value,
    owner_address: document.getElementById('input-owner').value,
    location: document.getElementById('input-location').value || 'Not specified',
    description: document.getElementById('input-description').value || 'Standard charger',
    battery: parseFloat(document.getElementById('input-battery').value),
    power: parseFloat(document.getElementById('input-power').value),
    status: document.getElementById('input-status').value
  };

  try {
    const response = await fetch(`${API_BASE_URL}/chargers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chargerData)
    });
    const data = await response.json();
    alert('Charger created successfully!');
    closeCreateModal();
    await fetchChargers();
  } catch (error) {
    console.error('Error creating charger:', error);
    alert('Error creating charger');
  }
}

async function simulateTransaction(chargerId, amount) {
  try {
    const response = await fetch(`${API_BASE_URL}/chargers/${chargerId}/simulate_transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount_eth: amount })
    });
    const data = await response.json();
    alert(data.message || 'Transaction simulated');
    await fetchChargers();
  } catch (error) {
    console.error('Error simulating transaction:', error);
    alert('Error simulating transaction');
  }
}

// =================== RENDER FUNCTIONS ===================
function renderDashboard() {
  renderStats();
  renderChargers();
  renderActivity();
}

function renderStats() {
  const container = document.getElementById('stats-container');
  
  const stats = [
    {
      icon: 'zap',
      title: 'Total Chargers',
      value: summary?.total_chargers || 0,
      subtitle: `${summary?.active_chargers || 0} active`,
      color: 'blue'
    },
    {
      icon: 'trending',
      title: 'Total Transactions',
      value: summary?.total_transactions || 0,
      subtitle: 'All time',
      color: 'green'
    },
    {
      icon: 'dollar',
      title: 'Total Income',
      value: `${(summary?.total_income || 0).toFixed(4)} ETH`,
      subtitle: `Balance: ${(summary?.total_balance || 0).toFixed(4)} ETH`,
      color: 'purple'
    },
    {
      icon: 'battery',
      title: 'Avg Battery',
      value: `${(summary?.average_battery_level || 0).toFixed(1)}%`,
      subtitle: `${summary?.low_battery_chargers || 0} low battery`,
      color: 'orange'
    }
  ];

  container.innerHTML = stats.map(stat => `
    <div class="stat-card">
      <div class="stat-icon ${stat.color}">
        ${getIcon(stat.icon)}
      </div>
      <p class="stat-title">${stat.title}</p>
      <p class="stat-value">${stat.value}</p>
      <p class="stat-subtitle">${stat.subtitle}</p>
    </div>
  `).join('');
}

function renderChargers() {
  const container = document.getElementById('chargers-container');
  
  if (chargers.length === 0) {
    container.innerHTML = '<p class="empty-state">No chargers available</p>';
    return;
  }

  container.innerHTML = chargers.map(charger => `
    <div class="charger-card" onclick="selectCharger('${charger.id_charger}')">
      <div class="charger-header">
        <h3 class="charger-title">${charger.id_charger}</h3>
        <span class="charger-status ${charger.status}">
          ${charger.status.toUpperCase()}
        </span>
      </div>
      <div class="charger-info">
        <div class="info-row">
          ${getIcon('map-pin')}
          <span>${charger.location}</span>
        </div>
        <div class="info-row battery-indicator">
          <span class="${getBatteryClass(charger.battery)}">
            ${getIcon('battery')}
          </span>
          <span>${charger.battery?.toFixed(1)}%</span>
          ${charger.battery_alert ? getIcon('alert') : ''}
        </div>
        <div class="charger-metrics">
          <p>Transactions: ${charger.transactions}</p>
          <p>Balance: ${charger.balance_total?.toFixed(6)} ETH</p>
        </div>
      </div>
    </div>
  `).join('');
}

function renderActivity() {
  const container = document.getElementById('activity-container');
  
  if (logs.length === 0) {
    container.innerHTML = '<p class="empty-state">No activity yet</p>';
    return;
  }

  container.innerHTML = logs.slice(0, 20).map(log => `
    <div class="activity-item">
      <div class="activity-content">
        <div class="activity-icon">
          ${getIcon('activity')}
        </div>
        <div class="activity-info">
          <p>${log.charger_id}</p>
          <p>${log.message}</p>
        </div>
      </div>
      <span class="activity-time">
        ${formatDate(log.timestamp)}
      </span>
    </div>
  `).join('');
}

function renderChargerDetails() {
  if (!selectedCharger) {
    document.getElementById('charger-details-container').innerHTML = `
      <div class="empty-state">
        <p>Select a charger to view details</p>
      </div>
    `;
    return;
  }

  const { charger, financial, blockchain, schedule, recent_activity } = selectedCharger;

  const html = `
    <!-- Header -->
    <div class="detail-header">
      <div class="detail-header-top">
        <div class="detail-header-info">
          <h2>${charger.id_charger}</h2>
          <div class="detail-location">
            ${getIcon('map-pin')}
            <span>${charger.location}</span>
          </div>
          <p class="detail-description">${charger.description}</p>
        </div>
        <span class="charger-status ${charger.status}">
          ${charger.status.toUpperCase()}
        </span>
      </div>
      
      <div class="metrics-grid">
        <div class="metric-box">
          <span class="${getBatteryClass(charger.battery.level)} metric-icon">
            ${getIcon('battery')}
          </span>
          <div class="metric-info">
            <p>Battery</p>
            <p>${charger.battery.level.toFixed(1)}%</p>
            <p>${charger.battery.status}</p>
          </div>
        </div>
        <div class="metric-box">
          <span class="metric-icon" style="color: #2563eb;">
            ${getIcon('zap')}
          </span>
          <div class="metric-info">
            <p>Power</p>
            <p>${charger.power} kW</p>
            <p>Charging capacity</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Financial Stats -->
    <div class="metric-cards">
      <div class="metric-card">
        <div class="metric-card-header">
          <span class="metric-card-title">Transactions</span>
          <span class="metric-card-icon">${getIcon('activity')}</span>
        </div>
        <p class="metric-card-value">${financial.transactions}</p>
      </div>
      <div class="metric-card">
        <div class="metric-card-header">
          <span class="metric-card-title">Income</span>
          <span class="metric-card-icon">${getIcon('trending')}</span>
        </div>
        <p class="metric-card-value">${financial.income_generated.toFixed(6)} ETH</p>
      </div>
      <div class="metric-card">
        <div class="metric-card-header">
          <span class="metric-card-title">Costs</span>
          <span class="metric-card-icon">${getIcon('dollar')}</span>
        </div>
        <p class="metric-card-value">${financial.cost_generated.toFixed(6)} ETH</p>
      </div>
      <div class="metric-card">
        <div class="metric-card-header">
          <span class="metric-card-title">Balance</span>
          <span class="metric-card-icon">${getIcon('dollar')}</span>
        </div>
        <p class="metric-card-value">${financial.balance_total.toFixed(6)} ETH</p>
      </div>
    </div>

    <!-- Actions -->
    <div class="card">
      <h3 class="card-title">Quick Actions</h3>
      <div class="actions-grid">
        <button class="action-btn" onclick="executeAction('${charger.id_charger}', 'turn_on')" 
                ${charger.status === 'active' ? 'disabled' : ''}>
          ${getIcon('power')}
          <span>Turn On</span>
        </button>
        <button class="action-btn" onclick="executeAction('${charger.id_charger}', 'turn_off')" 
                ${charger.status === 'inactive' ? 'disabled' : ''}>
          ${getIcon('power')}
          <span>Turn Off</span>
        </button>
        <button class="action-btn" onclick="executeAction('${charger.id_charger}', 'restart')">
          ${getIcon('refresh')}
          <span>Restart</span>
        </button>
        <button class="action-btn" onclick="executeAction('${charger.id_charger}', 'recharge_battery')" 
                ${charger.battery.level >= 100 ? 'disabled' : ''}>
          ${getIcon('battery')}
          <span>Recharge</span>
        </button>
        <button class="action-btn" onclick="executeAction('${charger.id_charger}', 'pay_costs')">
          ${getIcon('dollar')}
          <span>Pay Costs</span>
        </button>
        <button class="action-btn" onclick="executeAction('${charger.id_charger}', 'send_to_owner')">
          ${getIcon('download')}
          <span>Send to Owner</span>
        </button>
        <button class="action-btn" onclick="handleSimulateTransaction('${charger.id_charger}')">
          ${getIcon('zap')}
          <span>Simulate TX</span>
        </button>
        <button class="action-btn" onclick="executeAction('${charger.id_charger}', 'create_ticket')">
          ${getIcon('settings')}
          <span>Support</span>
        </button>
      </div>
    </div>

    <!-- Schedule Info -->
    <div class="card">
      <h3 class="card-title">Schedule Information</h3>
      <div class="schedule-grid">
        <div class="schedule-item">
          <p>Charges Today</p>
          <p>${schedule.charges_today}</p>
        </div>
        <div class="schedule-item">
          <p>Remaining</p>
          <p>${schedule.remaining_charges_today}</p>
        </div>
        <div class="schedule-item">
          <p>Max Daily</p>
          <p>${schedule.max_daily_charges}</p>
        </div>
        <div class="schedule-item small">
          <p>Next Transaction</p>
          <p>${schedule.next_scheduled_transaction ? new Date(schedule.next_scheduled_transaction).toLocaleTimeString() : 'N/A'}</p>
        </div>
      </div>
    </div>

    <!-- Recent Activity -->
    <div class="card">
      <h3 class="card-title">Recent Activity</h3>
      <div class="activity-list" style="max-height: 16rem;">
        ${recent_activity.map(activity => `
          <div class="activity-item">
            <div>
              <p style="font-size: 0.875rem; font-weight: 500;">${activity.message}</p>
              <div style="display: flex; justify-content: space-between; margin-top: 0.25rem;">
                <span style="font-size: 0.75rem; color: #6b7280;">
                  Battery: ${activity.battery_at_time?.toFixed(1)}%
                </span>
                <span style="font-size: 0.75rem; color: #9ca3af;">
                  ${formatDate(activity.timestamp)}
                </span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Blockchain Info -->
    <div class="card">
      <h3 class="card-title">Blockchain Information</h3>
      <div class="info-rows">
        <div class="info-row-detail">
          <span>Wallet Address</span>
          <span>${charger.wallet_address}</span>
        </div>
        <div class="info-row-detail">
          <span>Owner Address</span>
          <span>${charger.owner_address}</span>
        </div>
        <div class="info-row-detail">
          <span>Wallet Balance</span>
          <span>${blockchain.wallet_balance_eth} ETH</span>
        </div>
        <div class="info-row-detail">
          <span>Network</span>
          <span>${blockchain.network}</span>
        </div>
        <div class="info-row-detail">
          <span>Mode</span>
          <span>${blockchain.onchain_mode ? 'REAL TRANSACTIONS' : 'SIMULATION'}</span>
        </div>
      </div>
    </div>
  `;

  document.getElementById('charger-details-container').innerHTML = html;
}

// =================== UI FUNCTIONS ===================
function switchTab(tab) {
  // Update navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.getElementById(`nav-${tab}`).classList.add('active');

  // Update content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(`${tab}-tab`).classList.add('active');
}

function selectCharger(id) {
  fetchChargerDetails(id);
  switchTab('details');
}

function openCreateModal() {
  document.getElementById('create-modal').classList.add('active');
}

function closeCreateModal() {
  document.getElementById('create-modal').classList.remove('active');
  document.getElementById('create-charger-form').reset();
}

function showLoading(show) {
  const loading = document.getElementById('loading');
  if (show) {
    loading.classList.add('active');
  } else {
    loading.classList.remove('active');
  }
}

function handleSimulateTransaction(chargerId) {
  const amount = prompt('Enter ETH amount:');
  if (amount && !isNaN(amount)) {
    simulateTransaction(chargerId, parseFloat(amount));
  }
}

// =================== UTILITY FUNCTIONS ===================
function getBatteryClass(level) {
  if (level >= 80) return 'battery-good';
  if (level >= 50) return 'battery-medium';
  if (level >= 20) return 'battery-low';
  return 'battery-critical';
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString();
}

function getIcon(name) {
  const icons = {
    'zap': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>',
    'trending': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>',
    'dollar': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>',
    'battery': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="6" width="18" height="12" rx="2" ry="2"></rect><line x1="23" y1="13" x2="23" y2="11"></line></svg>',
    'map-pin': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>',
    'alert': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
    'activity': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>',
    'power': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>',
    'refresh': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>',
    'download': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
    'settings': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M12 1v6m0 6v6m5.66-17L16 5.66M7.34 18.34L6 19.66M23 12h-6M7 12H1m16.66 5.66L19.66 19M4.34 4.34L5.66 5.66"></path></svg>',
    'code': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>',
    'copy': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
    'chevron-down': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>'
  };
  return icons[name] || '';
}

// =================== API EXPLORER ===================
function initializeAPIExplorer() {
  apiEndpoints = [
    {
      id: 'get-chargers-detailed',
      method: 'GET',
      path: '/chargers/detailed',
      description: 'Get detailed information about all chargers including stats and schedules',
      params: []
    },
    {
      id: 'get-charger',
      method: 'GET',
      path: '/chargers/CHARGER_001',
      description: 'Get detailed information about a specific charger',
      params: [
        { name: 'id', type: 'path', label: 'Charger ID', placeholder: 'e.g., charger_001', required: true }
      ]
    },
    {
      id: 'create-charger',
      method: 'POST',
      path: '/chargers',
      description: 'Create a new charger',
      params: [
        { name: 'id_charger', type: 'body', label: 'Charger ID', placeholder: 'charger_001', required: true },
        { name: 'owner_address', type: 'body', label: 'Owner Address', placeholder: '0x...', required: true },
        { name: 'location', type: 'body', label: 'Location', placeholder: 'Downtown Station' },
        { name: 'description', type: 'body', label: 'Description', placeholder: 'Standard charger' },
        { name: 'battery', type: 'body', label: 'Battery (%)', placeholder: '100', inputType: 'number' },
        { name: 'power', type: 'body', label: 'Power (kW)', placeholder: '7.4', inputType: 'number' },
        { name: 'status', type: 'body', label: 'Status', inputType: 'select', options: ['inactive', 'active'] }
      ]
    },
    {
      id: 'update-charger',
      method: 'PUT',
      path: '/chargers/:id',
      description: 'Update charger details',
      params: [
        { name: 'id', type: 'path', label: 'Charger ID', placeholder: 'charger_001', required: true },
        { name: 'location', type: 'body', label: 'Location', placeholder: 'New Location' },
        { name: 'description', type: 'body', label: 'Description', placeholder: 'Updated description' },
        { name: 'battery', type: 'body', label: 'Battery (%)', placeholder: '100', inputType: 'number' },
        { name: 'power', type: 'body', label: 'Power (kW)', placeholder: '7.4', inputType: 'number' }
      ]
    },
    {
      id: 'charger-action',
      method: 'POST',
      path: '/chargers/:id/action',
      description: 'Execute an action on a charger',
      params: [
        { name: 'id', type: 'path', label: 'Charger ID', placeholder: 'charger_001', required: true },
        { 
          name: 'action', 
          type: 'body', 
          label: 'Action', 
          inputType: 'select', 
          required: true,
          options: ['turn_on', 'turn_off', 'restart', 'recharge_battery', 'create_ticket', 'pay_costs', 'send_to_owner']
        }
      ]
    },
    {
      id: 'get-actions',
      method: 'GET',
      path: '/chargers/CHARGER_001/action',
      description: 'Get available actions for a charger',
      params: [
        { name: 'id', type: 'path', label: 'Charger ID', placeholder: 'charger_001', required: true }
      ]
    },
    {
      id: 'simulate-transaction',
      method: 'POST',
      path: '/chargers/:id/simulate_transaction',
      description: 'Manually trigger a simulated transaction',
      params: [
        { name: 'id', type: 'path', label: 'Charger ID', placeholder: 'charger_001', required: true },
        { name: 'amount_eth', type: 'body', label: 'Amount (ETH)', placeholder: '0.001', inputType: 'number' }
      ]
    },
    {
      id: 'get-logs',
      method: 'GET',
      path: '/logs',
      description: 'Get logs with optional blockchain transactions',
      params: [
        { name: 'include_blockchain', type: 'query', label: 'Include Blockchain', inputType: 'select', options: ['false', 'true'] },
        { name: 'charger_id', type: 'query', label: 'Charger ID (optional)', placeholder: 'charger_001' }
      ]
    }
  ];

  renderAPIExplorer();
}

function renderAPIExplorer() {
  const container = document.getElementById('api-endpoints-container');
  
  container.innerHTML = apiEndpoints.map(endpoint => `
    <div class="api-endpoint" id="endpoint-${endpoint.id}">
      <div class="api-endpoint-header" onclick="toggleEndpoint('${endpoint.id}', ${endpoint.method === 'GET'})">
        <div class="api-endpoint-left">
          <span class="api-method ${endpoint.method.toLowerCase()}">${endpoint.method}</span>
          <div>
            <div class="api-path">${endpoint.path}</div>
            <div class="api-endpoint-description">${endpoint.description}</div>
          </div>
        </div>
        <div class="api-endpoint-actions" onclick="event.stopPropagation()">
          ${endpoint.method !== 'GET' ? `
            <button class="api-btn api-btn-test" onclick="testEndpoint('${endpoint.id}')">
              ${getIcon('zap')}
              Test
            </button>
          ` : ''}
          <button class="api-btn api-btn-toggle">
            ${getIcon('chevron-down')}
          </button>
        </div>
      </div>
      <div class="api-endpoint-body" id="body-${endpoint.id}">
        ${endpoint.method !== 'GET' ? `
          <div class="api-tabs">
            <button class="api-tab-btn active" onclick="switchAPITab('${endpoint.id}', 'params')">
              Parameters
            </button>
            <button class="api-tab-btn" onclick="switchAPITab('${endpoint.id}', 'response')">
              Response
            </button>
          </div>
          <div class="api-tab-content active" id="tab-params-${endpoint.id}">
            ${renderParameters(endpoint)}
          </div>
          <div class="api-tab-content" id="tab-response-${endpoint.id}">
            <div class="api-loading">Click "Test" to see the response</div>
          </div>
        ` : `
          ${endpoint.params.length > 0 ? `
            <div style="padding: 1rem; border-bottom: 1px solid #e5e7eb;">
              ${renderParameters(endpoint)}
            </div>
          ` : ''}
          <div id="tab-response-${endpoint.id}" style="padding: 1rem;">
            <div class="api-loading">Loading response...</div>
          </div>
        `}
      </div>
    </div>
  `).join('');
}

function renderParameters(endpoint) {
  if (endpoint.params.length === 0) {
    return '<div class="api-loading">No parameters required</div>';
  }

  const pathParams = endpoint.params.filter(p => p.type === 'path');
  const queryParams = endpoint.params.filter(p => p.type === 'query');
  const bodyParams = endpoint.params.filter(p => p.type === 'body');

  let html = '<div class="api-params">';

  if (pathParams.length > 0) {
    html += '<h4 style="margin: 1rem 0 0.5rem 0; font-size: 0.875rem; color: #374151;">Path Parameters</h4>';
    html += pathParams.map(param => renderParamInput(endpoint.id, param)).join('');
  }

  if (queryParams.length > 0) {
    html += '<h4 style="margin: 1rem 0 0.5rem 0; font-size: 0.875rem; color: #374151;">Query Parameters</h4>';
    html += queryParams.map(param => renderParamInput(endpoint.id, param)).join('');
  }

  if (bodyParams.length > 0) {
    html += '<h4 style="margin: 1rem 0 0.5rem 0; font-size: 0.875rem; color: #374151;">Body Parameters</h4>';
    html += bodyParams.map(param => renderParamInput(endpoint.id, param)).join('');
  }

  html += '</div>';
  return html;
}

function renderParamInput(endpointId, param) {
  const id = `param-${endpointId}-${param.name}`;
  
  if (param.inputType === 'select') {
    return `
      <div class="api-param">
        <label for="${id}">
          ${param.label} ${param.required ? '*' : ''}
        </label>
        <select id="${id}" ${param.required ? 'required' : ''}>
          <option value="">-- Select --</option>
          ${param.options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
        </select>
      </div>
    `;
  }

  return `
    <div class="api-param">
      <label for="${id}">
        ${param.label} ${param.required ? '*' : ''}
      </label>
      <input 
        type="${param.inputType || 'text'}" 
        id="${id}"
        placeholder="${param.placeholder || ''}"
        ${param.required ? 'required' : ''}
        step="${param.inputType === 'number' ? '0.0001' : ''}"
      />
      ${param.hint ? `<span class="api-param-hint">${param.hint}</span>` : ''}
    </div>
  `;
}

function toggleEndpoint(endpointId, autoLoad = false) {
  const body = document.getElementById(`body-${endpointId}`);
  const wasActive = body.classList.contains('active');
  
  body.classList.toggle('active');
  openEndpoints[endpointId] = body.classList.contains('active');
  
  // Auto-load GET endpoints when opened
  if (autoLoad && !wasActive && body.classList.contains('active')) {
    loadGetEndpoint(endpointId);
  }
}

function switchAPITab(endpointId, tab) {
  // Update tab buttons
  const endpoint = document.getElementById(`endpoint-${endpointId}`);
  endpoint.querySelectorAll('.api-tab-btn').forEach(btn => btn.classList.remove('active'));
  endpoint.querySelector(`[onclick*="'${tab}'"]`).classList.add('active');

  // Update tab content
  endpoint.querySelectorAll('.api-tab-content').forEach(content => content.classList.remove('active'));
  document.getElementById(`tab-${tab}-${endpointId}`).classList.add('active');
}

async function testEndpoint(endpointId) {
  const endpoint = apiEndpoints.find(e => e.id === endpointId);
  if (!endpoint) return;

  // Collect parameters
  let url = API_BASE_URL + endpoint.path;
  const queryParams = [];
  const bodyParams = {};
  let hasErrors = false;

  endpoint.params.forEach(param => {
    const input = document.getElementById(`param-${endpointId}-${param.name}`);
    const value = input?.value;

    if (param.required && !value) {
      alert(`${param.label} is required`);
      hasErrors = true;
      return;
    }

    if (value) {
      if (param.type === 'path') {
        url = url.replace(`:${param.name}`, value);
      } else if (param.type === 'query') {
        queryParams.push(`${param.name}=${encodeURIComponent(value)}`);
      } else if (param.type === 'body') {
        bodyParams[param.name] = param.inputType === 'number' ? parseFloat(value) : value;
      }
    }
  });

  if (hasErrors) return;

  // Add query parameters
  if (queryParams.length > 0) {
    url += '?' + queryParams.join('&');
  }

  // Show loading
  const responseTab = document.getElementById(`tab-response-${endpointId}`);
  responseTab.innerHTML = '<div class="api-loading">Loading...</div>';
  switchAPITab(endpointId, 'response');

  try {
    const options = {
      method: endpoint.method,
      headers: { 'Content-Type': 'application/json' }
    };

    if (endpoint.method !== 'GET' && Object.keys(bodyParams).length > 0) {
      options.body = JSON.stringify(bodyParams);
    }

    const response = await fetch(url, options);
    let data;
    const contentType = response.headers.get('content-type');
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = { raw_response: text, note: 'Response was not JSON' };
    }

    // Display response with syntax highlighting
    responseTab.innerHTML = `
      <div class="api-response-wrapper">
        <button class="copy-btn" onclick="copyToClipboard('response-${endpointId}')" title="Copy to clipboard">
          ${getIcon('copy')}
        </button>
        <div class="api-response" id="response-${endpointId}">
          <pre>${syntaxHighlight(data)}</pre>
        </div>
      </div>
      <div style="margin-top: 1rem; padding: 0.75rem; background: ${response.ok ? '#dcfce7' : '#fee2e2'}; border-radius: 0.375rem; font-size: 0.875rem; color: ${response.ok ? '#166534' : '#991b1b'};">
        <strong>Status:</strong> ${response.status} ${response.statusText}<br>
        <strong>Method:</strong> ${endpoint.method}<br>
        <strong>URL:</strong> ${url}
        ${Object.keys(bodyParams).length > 0 ? `<br><strong>Body:</strong> ${JSON.stringify(bodyParams)}` : ''}
      </div>
    `;
  } catch (error) {
    responseTab.innerHTML = `
      <div class="api-error">
        <strong>Error:</strong> ${error.message}
      </div>
      <p style="margin-top: 1rem; padding: 1rem; background: #f9fafb; border-radius: 0.375rem; font-size: 0.875rem;">
        <strong>Attempted URL:</strong> ${url}<br>
        <strong>Method:</strong> ${endpoint.method}<br>
        ${Object.keys(bodyParams).length > 0 ? `<strong>Body:</strong> ${JSON.stringify(bodyParams, null, 2)}<br>` : ''}
        <br>
        <strong>Possible causes:</strong><br>
        • Backend server is not running on port 6140<br>
        • CORS is not properly configured<br>
        • Network connectivity issues<br>
        • Invalid parameters or endpoint path
      </p>
    `;
  }
}

function copyToClipboard(elementId) {
  const element = document.getElementById(elementId);
  const text = element.textContent;
  
  navigator.clipboard.writeText(text).then(() => {
    alert('Copied to clipboard!');
  }).catch(err => {
    console.error('Failed to copy:', err);
  });
}

async function loadGetEndpoint(endpointId) {
  const endpoint = apiEndpoints.find(e => e.id === endpointId);
  if (!endpoint || endpoint.method !== 'GET') return;

  const responseTab = document.getElementById(`tab-response-${endpointId}`);
  responseTab.innerHTML = '<div class="api-loading">Loading response...</div>';

  // Build URL with parameters
  let url = API_BASE_URL + endpoint.path;
  const queryParams = [];

  endpoint.params.forEach(param => {
    const input = document.getElementById(`param-${endpointId}-${param.name}`);
    const value = input?.value;

    if (value) {
      if (param.type === 'path') {
        url = url.replace(`:${param.name}`, value);
      } else if (param.type === 'query') {
        queryParams.push(`${param.name}=${encodeURIComponent(value)}`);
      }
    } else if (param.required) {
      responseTab.innerHTML = `
        <div class="api-error">
          <strong>Missing required parameter:</strong> ${param.label}
        </div>
        <p style="margin-top: 1rem; padding: 1rem; background: #f9fafb; border-radius: 0.375rem; font-size: 0.875rem;">
          Please fill in the required parameters above and click the endpoint header again to reload.
        </p>
      `;
      return;
    }
  });

  // Add query parameters
  if (queryParams.length > 0) {
    url += '?' + queryParams.join('&');
  }

  try {
    const response = await fetch(url);
    let data;
    const contentType = response.headers.get('content-type');
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = { raw_response: text, note: 'Response was not JSON' };
    }

    // Display response with syntax highlighting
    responseTab.innerHTML = `
      <div class="api-response-wrapper">
        <button class="copy-btn" onclick="copyToClipboard('response-${endpointId}')" title="Copy to clipboard">
          ${getIcon('copy')}
        </button>
        <div class="api-response" id="response-${endpointId}">
          <pre>${syntaxHighlight(data)}</pre>
        </div>
      </div>
      <div style="margin-top: 1rem; padding: 0.75rem; background: ${response.ok ? '#dcfce7' : '#fee2e2'}; border-radius: 0.375rem; font-size: 0.875rem; color: ${response.ok ? '#166534' : '#991b1b'};">
        <strong>Status:</strong> ${response.status} ${response.statusText}<br>
        <strong>URL:</strong> ${url}
      </div>
    `;
  } catch (error) {
    responseTab.innerHTML = `
      <div class="api-error">
        <strong>Error:</strong> ${error.message}
      </div>
      <p style="margin-top: 1rem; padding: 1rem; background: #f9fafb; border-radius: 0.375rem; font-size: 0.875rem;">
        <strong>Attempted URL:</strong> ${url}<br><br>
        <strong>Possible causes:</strong><br>
        • Backend server is not running on port 6140<br>
        • CORS is not properly configured<br>
        • Network connectivity issues
      </p>
    `;
  }
}

function syntaxHighlight(json) {
  if (typeof json !== 'string') {
    json = JSON.stringify(json, null, 2);
  }
  
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
    let cls = 'number';
    if (/^"/.test(match)) {
      if (/:$/.test(match)) {
        cls = 'key';
        return '<span style="color: #7dd3fc;">' + match + '</span>';
      } else {
        cls = 'string';
        return '<span style="color: #86efac;">' + match + '</span>';
      }
    } else if (/true|false/.test(match)) {
      cls = 'boolean';
      return '<span style="color: #c4b5fd;">' + match + '</span>';
    } else if (/null/.test(match)) {
      cls = 'null';
      return '<span style="color: #fb923c;">' + match + '</span>';
    }
    return '<span style="color: #fde047;">' + match + '</span>';
  });
}