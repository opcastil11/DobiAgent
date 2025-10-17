const AGENT_API = 'http://localhost:3001/api/agent';
const WS_URL = 'ws://localhost:3001';

let ws = null;
let isTyping = false;
let currentView = 'chat';
let currentIssues = [];
let recentDecisions = [];

// Initialize
document.addEventListener('DOMContentLoaded', function() {
  loadAgentStatus();
  connectWebSocket();
  setInterval(loadAgentStatus, 10000);
});

// WebSocket Connection
function connectWebSocket() {
  console.log('[WebSocket] Connecting to agent...');
  
  ws = new WebSocket(WS_URL);

  ws.onopen = function() {
    console.log('[WebSocket] Connected');
    addFeedItem('system', 'WebSocket connected to agent', 'Connection established successfully');
  };

  ws.onmessage = function(event) {
    try {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
    } catch (error) {
      console.error('[WebSocket] Error parsing message:', error);
    }
  };

  ws.onerror = function(error) {
    console.error('[WebSocket] Error:', error);
    addFeedItem('error', 'WebSocket error', 'Connection error occurred');
  };

  ws.onclose = function() {
    console.log('[WebSocket] Disconnected');
    addFeedItem('system', 'WebSocket disconnected', 'Attempting to reconnect in 5 seconds...');
    setTimeout(connectWebSocket, 5000);
  };
}

function handleWebSocketMessage(data) {
  const { type, data: payload, timestamp } = data;

  switch (type) {
    case 'initial_state':
      console.log('[WebSocket] Received initial state');
      if (payload.recentDecisions) {
        recentDecisions = payload.recentDecisions;
        updateDecisionsList();
      }
      break;

    case 'monitoring_start':
      addFeedItem('monitoring', 'Monitoring cycle started', payload.message);
      break;

    case 'monitoring_data':
      const issuesText = payload.issues.length > 0 
        ? payload.issues.length + ' issue(s) detected'
        : 'All systems normal';
      addFeedItem('monitoring', 'Monitoring data received', 
        'Scanned ' + payload.totalChargers + ' chargers. ' + issuesText);
      
      currentIssues = payload.issues;
      updateIssuesList();
      
      document.getElementById('stat-issues').textContent = payload.issues.length;
      break;

    case 'analyzing':
      addFeedItem('analyzing', 'AI analyzing issues', 
        'Analyzing ' + payload.issueCount + ' issue(s) to determine actions...');
      break;

    case 'decision':
      const decisionText = payload.decisions.length > 0
        ? payload.decisions.length + ' action(s) to execute'
        : 'No action needed';
      addFeedItem('decision', 'AI Decision: ' + payload.summary, decisionText);
      
      if (payload.decisions.length > 0) {
        recentDecisions.unshift({
          timestamp: timestamp,
          summary: payload.summary,
          decisions: payload.decisions,
          tokensUsed: payload.tokensUsed
        });
        if (recentDecisions.length > 10) {
          recentDecisions = recentDecisions.slice(0, 10);
        }
        updateDecisionsList();
      }
      break;

    case 'action_start':
      addFeedItem('action', 'Executing: ' + payload.action, 
        'Charger: ' + payload.charger_id + ' - ' + payload.reasoning);
      break;

    case 'action_complete':
      addFeedItem('action', 'Action completed: ' + payload.action,
        'Charger: ' + payload.charger_id + ' - ' + payload.result);
      break;

    case 'action_error':
      addFeedItem('error', 'Action failed: ' + payload.action,
        'Charger: ' + payload.charger_id + ' - ' + payload.result);
      break;

    case 'monitoring_complete':
      addFeedItem('monitoring', 'Monitoring cycle completed', 
        'Next check at ' + new Date(payload.nextCheck).toLocaleTimeString());
      break;

    case 'error':
      addFeedItem('error', 'Error: ' + payload.message, payload.error || '');
      break;
  }
}

function addFeedItem(type, title, message) {
  const feed = document.getElementById('feed-content');
  
  const item = document.createElement('div');
  item.className = 'feed-item ' + type;
  
  const time = new Date().toLocaleTimeString();
  
  item.innerHTML = 
    '<div class="feed-time">' + time + '</div>' +
    '<div class="feed-message">' +
    '<strong>' + title + '</strong>' +
    (message ? '<p>' + message + '</p>' : '') +
    '</div>';
  
  feed.insertBefore(item, feed.firstChild);
  
  while (feed.children.length > 100) {
    feed.removeChild(feed.lastChild);
  }
}

function updateIssuesList() {
  const list = document.getElementById('issues-list');
  
  if (currentIssues.length === 0) {
    list.innerHTML = '<p class="no-issues">No issues detected</p>';
    return;
  }

  list.innerHTML = currentIssues.map(function(issue) {
    return '<div class="issue-item ' + issue.severity + '">' +
      '<strong>' + issue.charger_id + '</strong>' +
      '<p>' + issue.details + '</p>' +
      '<p style="font-size: 0.75rem; color: #9ca3af; margin-top: 0.25rem;">Severity: ' + 
      issue.severity.toUpperCase() + '</p>' +
      '</div>';
  }).join('');
}

function updateDecisionsList() {
  const list = document.getElementById('decisions-list');
  
  if (recentDecisions.length === 0) {
    list.innerHTML = '<p class="no-decisions">No decisions made yet</p>';
    return;
  }

  list.innerHTML = recentDecisions.map(function(decision) {
    const time = new Date(decision.timestamp).toLocaleTimeString();
    return '<div class="decision-item">' +
      '<strong>' + decision.summary + '</strong>' +
      '<p>Time: ' + time + '</p>' +
      (decision.tokensUsed ? '<p>Tokens used: ' + decision.tokensUsed + '</p>' : '') +
      '<div class="decision-actions">' +
      decision.decisions.map(function(d) {
        return '<span class="action-badge">' + d.action + ' → ' + d.charger_id + '</span>';
      }).join('') +
      '</div>' +
      '</div>';
  }).join('');
}

function clearActivityFeed() {
  const feed = document.getElementById('feed-content');
  feed.innerHTML = '<div class="feed-item system">' +
    '<div class="feed-time">System</div>' +
    '<div class="feed-message">' +
    '<strong>Feed cleared</strong>' +
    '<p>Waiting for new events...</p>' +
    '</div>' +
    '</div>';
}

// Load Agent Status
async function loadAgentStatus() {
  try {
    const response = await fetch(AGENT_API + '/status');
    const data = await response.json();

    document.getElementById('stat-chargers').textContent = 
      data.latestMonitoring ? data.latestMonitoring.chargers.length : '-';
    document.getElementById('stat-actions').textContent = data.totalActionsExecuted;
    document.getElementById('stat-issues').textContent = 
      data.latestMonitoring ? data.latestMonitoring.issues_detected.length : '0';
    
    if (data.lastCheck) {
      const lastCheck = new Date(data.lastCheck);
      const now = new Date();
      const diff = Math.floor((now - lastCheck) / 1000);
      document.getElementById('stat-lastcheck').textContent = diff + 's ago';
    }

    const statusBadge = document.getElementById('status-badge');
    if (data.running) {
      statusBadge.className = 'status-badge active';
      statusBadge.innerHTML = '<div class="status-indicator"></div><span>Active</span>';
    } else {
      statusBadge.className = 'status-badge inactive';
      statusBadge.innerHTML = '<div class="status-indicator"></div><span>Inactive</span>';
    }

  } catch (error) {
    console.error('Error loading agent status:', error);
  }
}

// Chat Functions
async function sendMessage() {
  const input = document.getElementById('message-input');
  const message = input.value.trim();
  
  if (!message || isTyping) return;
  
  addMessage('user', message);
  input.value = '';
  
  showTypingIndicator();
  
  try {
    const response = await fetch(AGENT_API + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message })
    });
    
    const data = await response.json();
    
    hideTypingIndicator();
    addMessage('assistant', data.response);
    
  } catch (error) {
    hideTypingIndicator();
    addMessage('assistant', 'Sorry, I encountered an error. Please make sure the agent server is running.');
    console.error('Error sending message:', error);
  }
}

function sendQuickMessage(message) {
  document.getElementById('message-input').value = message;
  sendMessage();
}

function addMessage(role, content) {
  const messagesContainer = document.getElementById('messages');
  
  const welcomeMessage = messagesContainer.querySelector('.welcome-message');
  if (welcomeMessage) {
    welcomeMessage.remove();
  }
  
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message ' + role;
  
  const avatar = role === 'user' ? '👤' : '🤖';
  const time = new Date().toLocaleTimeString();
  
  messageDiv.innerHTML = 
    '<div class="message-avatar">' + avatar + '</div>' +
    '<div>' +
    '<div class="message-content">' + content + '</div>' +
    '<div class="message-time">' + time + '</div>' +
    '</div>';
  
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function showTypingIndicator() {
  isTyping = true;
  const messagesContainer = document.getElementById('messages');
  
  const typingDiv = document.createElement('div');
  typingDiv.className = 'message assistant';
  typingDiv.id = 'typing-indicator';
  typingDiv.innerHTML = 
    '<div class="message-avatar">🤖</div>' +
    '<div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1rem; background: #f3f4f6; border-radius: 1rem;">' +
    '<div style="width: 8px; height: 8px; border-radius: 50%; background: #9ca3af; animation: typing 1.4s infinite;"></div>' +
    '<div style="width: 8px; height: 8px; border-radius: 50%; background: #9ca3af; animation: typing 1.4s infinite 0.2s;"></div>' +
    '<div style="width: 8px; height: 8px; border-radius: 50%; background: #9ca3af; animation: typing 1.4s infinite 0.4s;"></div>' +
    '</div>';
  
  messagesContainer.appendChild(typingDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function hideTypingIndicator() {
  isTyping = false;
  const indicator = document.getElementById('typing-indicator');
  if (indicator) {
    indicator.remove();
  }
}

function handleKeyPress(event) {
  if (event.key === 'Enter') {
    sendMessage();
  }
}

// View Switching
function switchView(view) {
  currentView = view;
  
  document.querySelectorAll('.nav-tab').forEach(function(tab) {
    tab.classList.remove('active');
  });
  document.getElementById('tab-' + view).classList.add('active');
  
  document.querySelectorAll('.view-container').forEach(function(container) {
    container.style.display = 'none';
  });
  document.getElementById('view-' + view).style.display = 'flex';
}