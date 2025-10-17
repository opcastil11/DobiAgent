// agent.js - AI Agent for Charger Management
require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const axios = require('axios');
const OpenAI = require('openai');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());

// Configuration
const AGENT_PORT = process.env.AGENT_PORT || 3001;
const BACKEND_API = process.env.BACKEND_API || 'http://localhost:6140/api';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MONITORING_INTERVAL = 15000; // 15 seconds

// Fix for Node.js < 18: Add fetch polyfill
if (!globalThis.fetch) {
  globalThis.fetch = require('node-fetch');
}

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Agent State
let agentState = {
  running: true,
  lastCheck: null,
  actionsExecuted: [],
  monitoringHistory: [],
  conversationHistory: [],
  decisionLog: []
};

// WebSocket clients
let wsClients = new Set();

// Broadcast to all connected clients
function broadcastToClients(type, data) {
  const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('[WebSocket] New client connected');
  wsClients.add(ws);

  // Send current state to new client
  ws.send(JSON.stringify({
    type: 'initial_state',
    data: {
      running: agentState.running,
      lastCheck: agentState.lastCheck,
      recentActions: agentState.actionsExecuted.slice(-5),
      recentDecisions: agentState.decisionLog.slice(-3)
    },
    timestamp: new Date().toISOString()
  }));

  ws.on('close', () => {
    console.log('[WebSocket] Client disconnected');
    wsClients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('[WebSocket] Error:', error.message);
    wsClients.delete(ws);
  });
});

// =================== MONITORING & AI DECISION MAKING ===================

async function getMonitoringData() {
  try {
    const response = await axios.get(`${BACKEND_API}/chargers/detailed`);
    const data = response.data;
    
    const monitoringReport = {
      timestamp: new Date().toISOString(),
      summary: data.summary,
      chargers: data.chargers.map(c => ({
        id: c.id_charger,
        status: c.status,
        battery: c.battery,
        location: c.location,
        transactions: c.transactions,
        income: c.income_generated,
        balance: c.balance_total,
        schedule_info: c.schedule_info
      })),
      issues_detected: []
    };

    // Detect issues
    data.chargers.forEach(charger => {
      if (charger.status === 'inactive') {
        monitoringReport.issues_detected.push({
          charger_id: charger.id_charger,
          issue: 'charger_inactive',
          severity: 'high',
          details: `Charger at ${charger.location} is inactive`
        });
      }
      
      if (charger.battery < 20) {
        monitoringReport.issues_detected.push({
          charger_id: charger.id_charger,
          issue: 'low_battery',
          severity: charger.battery < 10 ? 'critical' : 'medium',
          details: `Battery at ${charger.battery.toFixed(1)}%`
        });
      }

      if (charger.status === 'active' && charger.schedule_info && 
          charger.schedule_info.charges_today === 0) {
        monitoringReport.issues_detected.push({
          charger_id: charger.id_charger,
          issue: 'no_transactions_today',
          severity: 'low',
          details: `No transactions recorded today despite being active`
        });
      }
    });

    return monitoringReport;
    
  } catch (error) {
    console.error('[Monitoring] Error fetching data:', error.message);
    return null;
  }
}

async function agentDecisionMaking(monitoringReport) {
  if (!monitoringReport || monitoringReport.issues_detected.length === 0) {
    console.log('[Agent] ✅ All systems normal. No action needed.');
    broadcastToClients('decision', {
      issues: 0,
      decisions: [],
      summary: 'All systems normal. No action needed.'
    });
    return;
  }

  console.log(`[Agent] 🤔 Analyzing ${monitoringReport.issues_detected.length} issues...`);
  broadcastToClients('analyzing', {
    issueCount: monitoringReport.issues_detected.length,
    issues: monitoringReport.issues_detected
  });

  // Build context for AI
  const systemPrompt = `You are an autonomous AI agent managing the Aleph Dobi electric charger network. 

Your role is to monitor chargers and decide what actions to take based on the monitoring data.

Available actions you can execute:
1. "create_ticket" - Create a support ticket for maintenance
2. "restart" - Restart a charger (turns off for 3 seconds, then back on)
3. "turn_on" - Turn on an inactive charger
4. "recharge_battery" - Recharge a charger's battery to 100%
5. "no_action" - Take no action (just monitor)

Decision Guidelines:
- If a charger is INACTIVE: Consider creating a support ticket OR trying to turn it on (use your judgment)
- If battery is CRITICAL (<10%): Recharge immediately if charger is important
- If battery is LOW (10-20%): Create a ticket for scheduled maintenance
- If charger has no transactions but is active: Consider restarting it
- IMPORTANT: Don't take the same action twice within 1 hour for the same charger
- Be conservative - only take action when truly necessary

Response Format (JSON only):
{
  "decisions": [
    {
      "charger_id": "CHARGER_001",
      "action": "create_ticket",
      "reasoning": "Charger has been inactive for monitoring cycle, creating ticket for investigation"
    }
  ],
  "summary": "Brief summary of decisions made"
}

If no action is needed, return:
{
  "decisions": [],
  "summary": "All systems operating normally"
}`;

  const userPrompt = `Current Monitoring Report:

Timestamp: ${monitoringReport.timestamp}

System Summary:
- Total Chargers: ${monitoringReport.summary.total_chargers}
- Active: ${monitoringReport.summary.active_chargers}
- Inactive: ${monitoringReport.summary.inactive_chargers}
- Low Battery: ${monitoringReport.summary.low_battery_chargers}

Issues Detected:
${monitoringReport.issues_detected.map(issue => 
  `- [${issue.severity.toUpperCase()}] ${issue.charger_id}: ${issue.issue} - ${issue.details}`
).join('\n')}

Recent Actions (last hour):
${agentState.actionsExecuted
  .filter(a => (new Date() - new Date(a.timestamp)) < 3600000)
  .map(a => `- ${a.charger_id}: ${a.action} (${new Date(a.timestamp).toLocaleTimeString()})`)
  .join('\n') || 'No recent actions'}

What actions should be taken? Respond ONLY with valid JSON.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const response = JSON.parse(completion.choices[0].message.content);
    
    console.log('[Agent] 🧠 AI Decision:', response.summary);

    // Broadcast AI decision
    broadcastToClients('decision', {
      decisions: response.decisions,
      summary: response.summary,
      tokensUsed: completion.usage.total_tokens
    });

    // Log the decision
    agentState.decisionLog.push({
      timestamp: new Date().toISOString(),
      monitoringReport: monitoringReport,
      aiDecision: response,
      tokensUsed: completion.usage.total_tokens
    });

    // Keep only last 50 decisions
    if (agentState.decisionLog.length > 50) {
      agentState.decisionLog = agentState.decisionLog.slice(-50);
    }

    // Execute decisions
    if (response.decisions && response.decisions.length > 0) {
      for (const decision of response.decisions) {
        await executeAction(decision);
      }
    }

  } catch (error) {
    console.error('[Agent] Error in decision making:', error.message);
    broadcastToClients('error', {
      message: 'Error in AI decision making',
      error: error.message
    });
    if (error.response) {
      console.error('OpenAI Error:', error.response.data);
    }
  }
}

async function executeAction(decision) {
  const { charger_id, action, reasoning } = decision;

  try {
    console.log(`[Agent] ⚡ Executing: ${action} on ${charger_id}`);
    console.log(`[Agent] 💭 Reasoning: ${reasoning}`);

    // Broadcast action start
    broadcastToClients('action_start', {
      charger_id,
      action,
      reasoning
    });

    const response = await axios.post(
      `${BACKEND_API}/chargers/${charger_id}/action`,
      { action: action }
    );

    const actionRecord = {
      charger_id: charger_id,
      action: action,
      reasoning: reasoning,
      timestamp: new Date().toISOString(),
      result: response.data.message || 'Success'
    };

    agentState.actionsExecuted.push(actionRecord);

    // Keep only last 100 actions
    if (agentState.actionsExecuted.length > 100) {
      agentState.actionsExecuted = agentState.actionsExecuted.slice(-100);
    }

    console.log(`[Agent] ✅ Action completed: ${response.data.message}`);

    // Broadcast action success
    broadcastToClients('action_complete', {
      ...actionRecord,
      success: true
    });

  } catch (error) {
    console.error(`[Agent] ❌ Error executing ${action} on ${charger_id}:`, error.message);
    
    const actionRecord = {
      charger_id: charger_id,
      action: action,
      reasoning: reasoning,
      timestamp: new Date().toISOString(),
      result: 'Failed: ' + error.message
    };

    agentState.actionsExecuted.push(actionRecord);

    // Broadcast action failure
    broadcastToClients('action_error', {
      ...actionRecord,
      success: false
    });
  }
}

async function monitoringLoop() {
  if (!agentState.running) return;

  broadcastToClients('monitoring_start', { message: 'Starting monitoring cycle...' });

  const monitoringReport = await getMonitoringData();
  
  if (monitoringReport) {
    agentState.lastCheck = monitoringReport.timestamp;
    
    // Broadcast monitoring data
    broadcastToClients('monitoring_data', {
      summary: monitoringReport.summary,
      issues: monitoringReport.issues_detected,
      totalChargers: monitoringReport.chargers.length
    });

    // Store in history (keep last 100)
    agentState.monitoringHistory.push(monitoringReport);
    if (agentState.monitoringHistory.length > 100) {
      agentState.monitoringHistory = agentState.monitoringHistory.slice(-100);
    }

    // Let AI decide what to do
    await agentDecisionMaking(monitoringReport);
  }

  broadcastToClients('monitoring_complete', { 
    message: 'Monitoring cycle completed',
    nextCheck: new Date(Date.now() + MONITORING_INTERVAL).toISOString()
  });
}

// Start monitoring loop
setInterval(monitoringLoop, MONITORING_INTERVAL);
monitoringLoop(); // Run immediately on startup

// =================== AGENT ENDPOINTS ===================

app.get('/api/agent/status', (req, res) => {
  const recentActions = agentState.actionsExecuted.slice(-10);
  const recentDecisions = agentState.decisionLog.slice(-5);
  const latestMonitoring = agentState.monitoringHistory[agentState.monitoringHistory.length - 1];

  res.json({
    running: agentState.running,
    lastCheck: agentState.lastCheck,
    totalActionsExecuted: agentState.actionsExecuted.length,
    totalDecisions: agentState.decisionLog.length,
    uptime: process.uptime(),
    latestMonitoring: latestMonitoring,
    recentActions: recentActions,
    recentDecisions: recentDecisions.map(d => ({
      timestamp: d.timestamp,
      issues: d.monitoringReport.issues_detected.length,
      decisions: d.aiDecision.decisions.length,
      summary: d.aiDecision.summary,
      tokensUsed: d.tokensUsed
    }))
  });
});

app.post('/api/agent/toggle', (req, res) => {
  agentState.running = !agentState.running;
  console.log(`[Agent] Monitoring ${agentState.running ? 'enabled' : 'disabled'}`);
  res.json({
    message: agentState.running ? 'Agent monitoring enabled' : 'Agent monitoring disabled',
    running: agentState.running
  });
});

app.get('/api/agent/monitoring-history', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json({
    history: agentState.monitoringHistory.slice(-limit),
    total: agentState.monitoringHistory.length
  });
});

app.get('/api/agent/decision-log', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json({
    decisions: agentState.decisionLog.slice(-limit),
    total: agentState.decisionLog.length
  });
});

app.get('/api/agent/actions', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json({
    actions: agentState.actionsExecuted.slice(-limit),
    total: agentState.actionsExecuted.length,
    byCharger: groupActionsByCharger(),
    byAction: groupActionsByType()
  });
});

function groupActionsByCharger() {
  const grouped = {};
  agentState.actionsExecuted.forEach(action => {
    if (!grouped[action.charger_id]) {
      grouped[action.charger_id] = [];
    }
    grouped[action.charger_id].push(action);
  });
  return grouped;
}

function groupActionsByType() {
  const grouped = {};
  agentState.actionsExecuted.forEach(action => {
    if (!grouped[action.action]) {
      grouped[action.action] = 0;
    }
    grouped[action.action]++;
  });
  return grouped;
}

// Chat endpoint - now includes monitoring context
app.post('/api/agent/chat', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const latestMonitoring = agentState.monitoringHistory[agentState.monitoringHistory.length - 1];
    const recentDecisions = agentState.decisionLog.slice(-5);
    const recentActions = agentState.actionsExecuted.slice(-10);

    const systemContext = `You are an AI assistant for the Aleph Dobi charger management system. You have access to real-time monitoring data and can explain the autonomous agent's decisions.

Latest Monitoring Report (${latestMonitoring ? latestMonitoring.timestamp : 'N/A'}):
${latestMonitoring ? JSON.stringify(latestMonitoring, null, 2) : 'No data yet'}

Recent AI Decisions:
${recentDecisions.map(d => 
  `- ${d.timestamp}: ${d.aiDecision.summary} (${d.aiDecision.decisions.length} actions)`
).join('\n')}

Recent Actions Executed:
${recentActions.map(a => 
  `- ${a.charger_id}: ${a.action} - ${a.reasoning} (${a.result})`
).join('\n')}

You can:
1. Explain current system status
2. Analyze the agent's decisions
3. Provide insights on charger performance
4. Recommend optimizations
5. Answer questions about specific chargers

Be helpful, clear, and data-driven in your responses.`;

    const messages = [
      { role: 'system', content: systemContext },
      ...agentState.conversationHistory.slice(-10),
      { role: 'user', content: message }
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.7,
      max_tokens: 500
    });

    const assistantMessage = completion.choices[0].message.content;

    agentState.conversationHistory.push(
      { role: 'user', content: message },
      { role: 'assistant', content: assistantMessage }
    );

    if (agentState.conversationHistory.length > 20) {
      agentState.conversationHistory = agentState.conversationHistory.slice(-20);
    }

    res.json({
      response: assistantMessage,
      timestamp: new Date().toISOString(),
      context: {
        latestIssues: latestMonitoring ? latestMonitoring.issues_detected.length : 0,
        recentActions: recentActions.length,
        tokensUsed: completion.usage.total_tokens
      }
    });

  } catch (error) {
    console.error('[Agent] Error in chat:', error.message);
    res.status(500).json({ 
      error: 'Error processing message', 
      details: error.message 
    });
  }
});

app.post('/api/agent/clear-history', (req, res) => {
  agentState.conversationHistory = [];
  res.json({ message: 'Conversation history cleared' });
});

app.get('/', (req, res) => {
  res.json({
    message: 'Aleph Dobi AI Agent is running',
    status: agentState.running ? 'active' : 'inactive',
    version: '2.0 - Autonomous Decision Making',
    endpoints: {
      status: 'GET /api/agent/status',
      toggle: 'POST /api/agent/toggle',
      chat: 'POST /api/agent/chat',
      monitoringHistory: 'GET /api/agent/monitoring-history',
      decisionLog: 'GET /api/agent/decision-log',
      actions: 'GET /api/agent/actions'
    }
  });
});

// =================== START SERVER ===================
server.listen(AGENT_PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║   🤖 Aleph Dobi AI Agent v2.0 Started                 ║
║   Autonomous Decision Making Enabled                   ║
║   Port: ${AGENT_PORT}                                       ║
║   WebSocket: ws://localhost:${AGENT_PORT}                   ║
║   Monitoring: Every ${MONITORING_INTERVAL/1000} seconds                        ║
║   Backend API: ${BACKEND_API}                    ║
║   OpenAI: ${OPENAI_API_KEY ? '✅ Configured' : '❌ Missing API Key'}                    ║
╚════════════════════════════════════════════════════════╝

[Agent] 🚀 Starting autonomous monitoring...
[WebSocket] Server ready for connections
  `);
});