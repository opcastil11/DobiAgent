// agent.js - AI Agent for Charger Management
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const OpenAI = require('openai');

const app = express();
app.use(express.json());

// Configuration
const AGENT_PORT = process.env.AGENT_PORT || 3001;
const BACKEND_API = process.env.BACKEND_API || 'http://localhost:6140/api';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

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
let agentStatus = {
  running: true,
  lastCheck: null,
  ticketsCreated: 0,
  chargersMonitored: 0,
  alerts: [],
  conversationHistory: []
};

// Monitoring Function
async function monitorChargers() {
  if (!agentStatus.running) return;

  try {
    console.log('[Agent] Checking chargers...');
    
    // Get all chargers
    const response = await axios.get(`${BACKEND_API}/chargers/detailed`);
    const chargers = response.data.chargers || [];
    
    agentStatus.chargersMonitored = chargers.length;
    agentStatus.lastCheck = new Date().toISOString();

    // Check each charger
    for (const charger of chargers) {
      // If charger is inactive, create support ticket
      if (charger.status === 'inactive') {
        // Check if we already created a ticket recently (avoid spam)
        const recentAlert = agentStatus.alerts.find(a => 
          a.charger_id === charger.id_charger && 
          a.action === 'create_ticket' &&
          (new Date() - new Date(a.timestamp)) < 3600000 // Less than 1 hour ago
        );

        if (!recentAlert) {
          console.log(`[Agent] ⚠️  Charger ${charger.id_charger} is inactive. Creating support ticket...`);
          
          try {
            // Create support ticket
            await axios.post(`${BACKEND_API}/chargers/${charger.id_charger}/action`, {
              action: 'create_ticket'
            });

            agentStatus.ticketsCreated++;
            agentStatus.alerts.push({
              charger_id: charger.id_charger,
              action: 'create_ticket',
              reason: 'Charger is inactive',
              timestamp: new Date().toISOString(),
              location: charger.location
            });

            console.log(`[Agent] ✅ Support ticket created for ${charger.id_charger}`);
          } catch (error) {
            console.error(`[Agent] Error creating ticket for ${charger.id_charger}:`, error.message);
          }
        }
      }

      // Check for low battery
      if (charger.battery < 20 && charger.status === 'active') {
        const recentAlert = agentStatus.alerts.find(a => 
          a.charger_id === charger.id_charger && 
          a.action === 'low_battery_alert' &&
          (new Date() - new Date(a.timestamp)) < 3600000
        );

        if (!recentAlert) {
          console.log(`[Agent] ⚠️  Charger ${charger.id_charger} has low battery: ${charger.battery}%`);
          
          agentStatus.alerts.push({
            charger_id: charger.id_charger,
            action: 'low_battery_alert',
            reason: `Battery level at ${charger.battery}%`,
            timestamp: new Date().toISOString(),
            location: charger.location
          });
        }
      }
    }

  } catch (error) {
    console.error('[Agent] Error monitoring chargers:', error.message);
  }
}

// Start monitoring loop
setInterval(monitorChargers, 15000); // Every 15 seconds
monitorChargers(); // Run immediately on startup

// =================== AGENT ENDPOINTS ===================

// Get agent status
app.get('/api/agent/status', (req, res) => {
  res.json({
    ...agentStatus,
    uptime: process.uptime(),
    recentAlerts: agentStatus.alerts.slice(-10)
  });
});

// Toggle agent monitoring
app.post('/api/agent/toggle', (req, res) => {
  agentStatus.running = !agentStatus.running;
  res.json({
    message: agentStatus.running ? 'Agent monitoring enabled' : 'Agent monitoring disabled',
    running: agentStatus.running
  });
});

// Clear alerts
app.post('/api/agent/clear-alerts', (req, res) => {
  agentStatus.alerts = [];
  res.json({ message: 'Alerts cleared' });
});

// Chat with agent (OpenAI)
app.post('/api/agent/chat', async (req, res) => {
  const { message, userId } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    // Get current system context
    const chargersResponse = await axios.get(`${BACKEND_API}/chargers/detailed`);
    const chargers = chargersResponse.data.chargers || [];
    const summary = chargersResponse.data.summary || {};

    // Build system context
    const systemContext = `You are an AI assistant for the Aleph Dobi charger management system.

Current System Status:
- Total Chargers: ${summary.total_chargers || 0}
- Active Chargers: ${summary.active_chargers || 0}
- Inactive Chargers: ${summary.inactive_chargers || 0}
- Total Transactions: ${summary.total_transactions || 0}
- Total Income: ${summary.total_income ? summary.total_income.toFixed(4) : 0} ETH
- Average Battery Level: ${summary.average_battery_level ? summary.average_battery_level.toFixed(1) : 0}%

Chargers Details:
${chargers.map(c => `- ${c.id_charger}: Status=${c.status}, Battery=${c.battery ? c.battery.toFixed(1) : 0}%, Location=${c.location}, Transactions=${c.transactions}`).join('\n')}

Recent Alerts:
${agentStatus.alerts.slice(-5).map(a => `- ${a.charger_id}: ${a.reason} (${new Date(a.timestamp).toLocaleString()})`).join('\n') || 'No recent alerts'}

Agent Status:
- Monitoring: ${agentStatus.running ? 'Active' : 'Inactive'}
- Tickets Created: ${agentStatus.ticketsCreated}
- Last Check: ${agentStatus.lastCheck ? new Date(agentStatus.lastCheck).toLocaleString() : 'Never'}

You can help users with:
1. Information about specific chargers
2. Overall system status and statistics
3. Troubleshooting charger issues
4. Explaining actions that can be taken
5. Analyzing trends and making recommendations

Be helpful, concise, and professional. If asked to perform actions, explain what actions are available through the API.`;

    // Build messages for OpenAI
    const messages = [
      { role: 'system', content: systemContext },
      ...agentStatus.conversationHistory.slice(-10), // Keep last 10 messages for context
      { role: 'user', content: message }
    ];

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.7,
      max_tokens: 500
    });

    const assistantMessage = completion.choices[0].message.content;

    // Update conversation history
    agentStatus.conversationHistory.push(
      { role: 'user', content: message },
      { role: 'assistant', content: assistantMessage }
    );

    // Keep only last 20 messages
    if (agentStatus.conversationHistory.length > 20) {
      agentStatus.conversationHistory = agentStatus.conversationHistory.slice(-20);
    }

    res.json({
      response: assistantMessage,
      timestamp: new Date().toISOString(),
      systemStatus: {
        totalChargers: summary.total_chargers,
        activeChargers: summary.active_chargers,
        recentAlerts: agentStatus.alerts.slice(-3)
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

// Get conversation history
app.get('/api/agent/history', (req, res) => {
  res.json({
    history: agentStatus.conversationHistory,
    totalMessages: agentStatus.conversationHistory.length
  });
});

// Clear conversation history
app.post('/api/agent/clear-history', (req, res) => {
  agentStatus.conversationHistory = [];
  res.json({ message: 'Conversation history cleared' });
});

// =================== ROOT ENDPOINT ===================
app.get('/', (req, res) => {
  res.json({
    message: 'Aleph Dobi AI Agent is running',
    status: agentStatus.running ? 'active' : 'inactive',
    endpoints: {
      status: 'GET /api/agent/status',
      toggle: 'POST /api/agent/toggle',
      chat: 'POST /api/agent/chat',
      history: 'GET /api/agent/history',
      clearHistory: 'POST /api/agent/clear-history',
      clearAlerts: 'POST /api/agent/clear-alerts'
    }
  });
});

// =================== START SERVER ===================
app.listen(AGENT_PORT, '0.0.0.0', () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║   🤖 Aleph Dobi AI Agent Started                      ║
║   Port: ${AGENT_PORT}                                       ║
║   Monitoring: Every 15 seconds                         ║
║   Backend API: ${BACKEND_API}                         ║
║   OpenAI: ${OPENAI_API_KEY ? '✅ Configured' : '❌ Missing API Key'}                    ║
╚════════════════════════════════════════════════════════╝
  `);
});