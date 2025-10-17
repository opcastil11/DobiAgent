// =================== CONFIGURATION ===================
const API_BASE_URL = 'http://localhost:6140/api';

// =================== STATE ===================
let chargers = [];
let summary = null;
let selectedCharger = null;
let logs = [];
let updateInterval = null;

// =================== INITIALIZATION ===================
document.addEventListener('DOMContentLoaded', () => {
  showLoading(true);
  fetchChargers();
  fetchLogs();
  
  // Auto refresh every 10 seconds
  updateInterval = setInterval(() => {
    fetchChargers();
    if (selectedCharger) {
      fetchChargerDetails(selectedCharger.charger.id_charger);
    }
  }, 10000);
});

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
    'settings': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M12 1v6m0 6v6m5.66-17L16 5.66M7.34 18.34L6 19.66M23 12h-6M7 12H1m16.66 5.66L19.66 19M4.34 4.34L5.66 5.66"></path></svg>'
  };
  return icons[name] || '';
}