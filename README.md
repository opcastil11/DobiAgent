# ⚡ Aleph Dobi - Autonomous Electric Charger Management System

![Version](https://img.shields.io/badge/version-2.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

> An intelligent, blockchain-powered platform for managing electric vehicle chargers with autonomous AI decision-making capabilities.
> Link Demo Video: https://youtu.be/eyKiBaV9OVA

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Architecture](#-architecture)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [Project Structure](#-project-structure)
- [API Documentation](#-api-documentation)
- [AI Agent](#-ai-agent)
- [Screenshots](#-screenshots)
- [Demo](#-demo)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [Team](#-team)

---

## 🎯 Overview

**Aleph Dobi** is a comprehensive management system for electric vehicle charging stations that combines blockchain technology, real-time monitoring, and autonomous AI decision-making to optimize charger operations and maintenance.

### The Problem

Electric vehicle charging networks face several challenges:
- ⚠️ Manual monitoring of hundreds of chargers
- 🔋 Battery degradation and downtime
- 💰 Inefficient cost management
- 🚨 Delayed response to system failures
- 📊 Lack of predictive maintenance

### Our Solution

Aleph Dobi provides:
- 🤖 **Autonomous AI Agent** that monitors chargers 24/7 and makes intelligent decisions
- ⚡ **Real-time monitoring** with WebSocket updates
- 🔗 **Blockchain integration** for transparent financial transactions (Base network)
- 📈 **Advanced analytics** dashboard with live statistics
- 🎯 **Predictive maintenance** through AI pattern recognition
- 💬 **Conversational AI** for natural language system queries

---

## ✨ Features

### 🎮 Core Features

#### 1. **Smart Charger Management**
- Real-time status monitoring (active/inactive)
- Battery level tracking with automatic recharge
- Power consumption analytics
- Location-based organization
- Transaction history and financial metrics

#### 2. **Autonomous AI Agent**
- **Monitors every 15 seconds** - Continuous system surveillance
- **Intelligent decision-making** - Uses GPT-4o-mini to analyze issues
- **Automatic ticket creation** - Creates support tickets for inactive chargers
- **Battery management** - Automatically recharges critical batteries
- **Smart restarts** - Decides when chargers need restarting
- **Contextual awareness** - Learns from past actions to avoid spam

#### 3. **Blockchain Integration**
- Base network (Ethereum L2) integration
- Automated transaction simulation
- Wallet management for each charger
- Cost payment automation (40% operational costs)
- Owner fund transfers
- On-chain transaction tracking

#### 4. **Advanced Dashboard**
- Real-time statistics overview
- Interactive charger cards
- Detailed financial metrics
- Battery health indicators
- Action history logs
- API endpoint explorer

#### 5. **AI Chat Interface**
- Natural language queries about system status
- Real-time context from monitoring data
- Explains AI decisions and reasoning
- Quick action buttons for common queries
- Conversation history

#### 6. **Live Activity Monitor**
- WebSocket-powered real-time feed
- Color-coded event types
- AI decision logging
- Issue tracking panel
- Recent actions display

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend Layer                        │
├─────────────────┬────────────────┬──────────────────────────┤
│   Dashboard     │   AI Agent     │   API Explorer           │
│   (Vanilla JS)  │   Interface    │                          │
└────────┬────────┴────────┬───────┴────────┬─────────────────┘
         │                 │                 │
         │ HTTP/REST       │ WebSocket       │ HTTP/REST
         │                 │                 │
┌────────▼─────────────────▼─────────────────▼─────────────────┐
│                     Backend Services                          │
├───────────────────────────┬───────────────────────────────────┤
│   Charger Server          │   AI Agent Server                 │
│   (Express.js)            │   (Express.js + WebSocket)        │
│   Port: 6140              │   Port: 3001                      │
│                           │                                   │
│   - REST API              │   - Autonomous monitoring         │
│   - SQLite Database       │   - OpenAI GPT-4 integration      │
│   - Transaction simulator │   - WebSocket broadcasting        │
│   - Scheduled tasks       │   - Decision logging              │
└───────────┬───────────────┴──────────┬────────────────────────┘
            │                          │
            │                          │
┌───────────▼──────────────────────────▼────────────────────────┐
│                   External Services                           │
├───────────────────┬──────────────────┬────────────────────────┤
│  Base Network     │  OpenAI API      │  SQLite Database       │
│  (Blockchain)     │  (GPT-4o-mini)   │                        │
└───────────────────┴──────────────────┴────────────────────────┘
```

### Data Flow

```
1. Charger Status Changes
   Charger → Server → Database → Dashboard (Real-time update)

2. AI Monitoring Cycle (Every 15 seconds)
   Server → AI Agent → Analysis → Decision → Action → WebSocket → Dashboard

3. User Action
   Dashboard → API Request → Server → Action Execution → Response → UI Update

4. Blockchain Transaction
   Server → Base Network → Transaction → Confirmation → Database Update
```

---

## 🛠️ Tech Stack

### Backend
- **Node.js** (v18+) - Runtime environment
- **Express.js** - Web framework
- **SQLite3** - Database
- **Ethers.js** - Blockchain interaction
- **WebSocket (ws)** - Real-time communication
- **OpenAI SDK** - AI integration
- **Axios** - HTTP client

### Frontend
- **Vanilla JavaScript** - No framework dependencies
- **HTML5/CSS3** - Modern web standards
- **WebSocket API** - Real-time updates
- **Fetch API** - HTTP requests

### Blockchain
- **Base Network** (Ethereum L2)
- **Smart Wallets** - One per charger
- **Ethers.js** - Web3 integration

### AI/ML
- **OpenAI GPT-4o-mini** - Decision making
- **Custom prompting** - Specialized system behavior
- **Context management** - Historical awareness

### DevOps
- **dotenv** - Environment configuration
- **CORS** - Cross-origin resource sharing
- **Enhanced logging** - Colored console output

---

## 🚀 Getting Started

### Prerequisites

```bash
# Node.js 18 or higher
node --version  # Should be >= 18.0.0

# npm or yarn
npm --version
```

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/your-username/aleph-dobi.git
cd aleph-dobi
```

2. **Install dependencies**
```bash
npm install
```

Required packages:
```bash
npm install express sqlite3 ethers cors dotenv axios openai ws node-fetch
```

3. **Configure environment variables**

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=6140

# Blockchain Configuration
BASE_RPC=https://mainnet.base.org
MASTER_PRIVATE_KEY=your_master_wallet_private_key
SEND_ONCHAIN=false

# Transaction Simulation
MIN_TX_ETH=0.0001
MAX_TX_ETH=0.0002

# AI Agent Configuration
AGENT_PORT=3001
BACKEND_API=http://localhost:6140/api
OPENAI_API_KEY=your_openai_api_key_here
```

4. **Create initial chargers** (Optional)

Create a `chargers.json` file:

```json
[
  {
    "id_charger": "charger_001",
    "owner_address": "0xYourOwnerAddress",
    "status": "active",
    "location": "Downtown Station",
    "description": "Fast charger 50kW",
    "battery": 100,
    "power": 50
  }
]
```

5. **Start the servers**

Terminal 1 - Main Server:
```bash
node server.js
```

Terminal 2 - AI Agent:
```bash
node agent.js
```

6. **Open the dashboard**

Using Live Server (VS Code):
- Install "Live Server" extension
- Right-click `index.html` → "Open with Live Server"

Or manually:
- Open `index.html` in your browser
- Open `agent.html` for AI Agent interface

---

## 📁 Project Structure

```
aleph-dobi/
├── 📄 server.js                 # Main backend server
├── 📄 agent.js                  # AI Agent server
├── 📄 .env                      # Environment variables
├── 📄 package.json              # Dependencies
├── 📄 chargers.json            # Initial charger data
├── 📄 chargers.db              # SQLite database (auto-generated)
│
├── 📁 frontend/
│   ├── 📄 index.html           # Main dashboard
│   ├── 📄 styles.css           # Dashboard styles
│   ├── 📄 script.js            # Dashboard logic
│   │
│   ├── 📄 agent.html           # AI Agent interface
│   ├── 📄 agent-styles.css     # Agent interface styles
│   └── 📄 agent-script.js      # Agent interface logic
│
└── 📄 README.md                # This file
```

---

## 📚 API Documentation

### Base URL
```
http://localhost:6140/api
```

### Charger Endpoints

#### Get All Chargers (Detailed)
```http
GET /api/chargers/detailed
```

**Response:**
```json
{
  "summary": {
    "total_chargers": 10,
    "active_chargers": 7,
    "inactive_chargers": 3,
    "low_battery_chargers": 2,
    "total_transactions": 156,
    "total_income": 0.0234,
    "total_balance": 0.0140
  },
  "chargers": [...],
  "system_info": {...}
}
```

#### Get Single Charger
```http
GET /api/chargers/:id
```

**Response:**
```json
{
  "charger": {
    "id_charger": "charger_001",
    "status": "active",
    "battery": {
      "level": 85.5,
      "status": "good",
      "needs_recharge": false
    }
  },
  "financial": {...},
  "blockchain": {...},
  "schedule": {...}
}
```

#### Create Charger
```http
POST /api/chargers
Content-Type: application/json

{
  "id_charger": "charger_new",
  "owner_address": "0x...",
  "location": "New Station",
  "battery": 100,
  "power": 7.4,
  "status": "active"
}
```

#### Execute Action
```http
POST /api/chargers/:id/action
Content-Type: application/json

{
  "action": "restart"
}
```

**Available Actions:**
- `turn_on` - Activate charger
- `turn_off` - Deactivate charger
- `restart` - Restart charger (3s downtime)
- `recharge_battery` - Recharge to 100%
- `create_ticket` - Create support ticket
- `pay_costs` - Pay 40% of balance as costs
- `send_to_owner` - Transfer funds to owner

#### Get Available Actions
```http
GET /api/chargers/:id/action
```

#### Simulate Transaction
```http
POST /api/chargers/:id/simulate_transaction
Content-Type: application/json

{
  "amount_eth": 0.0005
}
```

### AI Agent Endpoints

#### Get Agent Status
```http
GET http://localhost:3001/api/agent/status
```

#### Chat with Agent
```http
POST http://localhost:3001/api/agent/chat
Content-Type: application/json

{
  "message": "What is the status of all chargers?"
}
```

#### Get Decision Log
```http
GET http://localhost:3001/api/agent/decision-log?limit=10
```

#### Get Monitoring History
```http
GET http://localhost:3001/api/agent/monitoring-history?limit=20
```

#### Toggle Agent
```http
POST http://localhost:3001/api/agent/toggle
```

---

## 🤖 AI Agent

### How It Works

The AI Agent is the brain of Aleph Dobi, operating autonomously to maintain optimal charger performance.

#### Monitoring Cycle (Every 15 seconds)

```
1. Data Collection
   ├─ Fetch all charger statuses
   ├─ Check battery levels
   ├─ Verify transaction counts
   └─ Detect anomalies

2. Issue Detection
   ├─ Inactive chargers
   ├─ Low battery (< 20%)
   ├─ Critical battery (< 10%)
   └─ No transactions despite being active

3. AI Analysis (GPT-4o-mini)
   ├─ Evaluate severity of issues
   ├─ Check recent action history
   ├─ Consider cooldown periods
   └─ Generate decision plan

4. Action Execution
   ├─ Create support tickets
   ├─ Recharge batteries
   ├─ Restart chargers
   └─ Turn on/off chargers

5. Broadcasting
   └─ Send updates via WebSocket to dashboard
```

#### Decision-Making Logic

The AI uses this prompt structure:

```
SYSTEM ROLE: Autonomous charger network manager
AVAILABLE ACTIONS: [create_ticket, restart, turn_on, recharge_battery, etc.]
GUIDELINES:
- Conservative approach (only act when necessary)
- 1-hour cooldown between same actions
- Priority: Critical > High > Medium > Low
- Learn from history to avoid repeated mistakes

INPUT: Current monitoring report + Recent action history
OUTPUT: JSON with decisions and reasoning
```

#### Example AI Decision

```json
{
  "decisions": [
    {
      "charger_id": "charger_001",
      "action": "create_ticket",
      "reasoning": "Charger has been inactive for 2 monitoring cycles, creating ticket for investigation"
    },
    {
      "charger_id": "charger_005",
      "action": "recharge_battery",
      "reasoning": "Battery at critical level (8%), recharging immediately to prevent service interruption"
    }
  ],
  "summary": "Created 1 support ticket and recharged 1 critical battery"
}
```

### AI Chat Interface

Ask the agent anything:

- "What is the status of all chargers?"
- "Which chargers need attention?"
- "Show me chargers with low battery"
- "What decisions did you make in the last hour?"
- "Explain why you restarted charger_003"

The agent responds with context-aware answers based on real-time data.

---

## 📸 Screenshots

### Dashboard
![Dashboard Overview](https://via.placeholder.com/800x450/667eea/ffffff?text=Dashboard+Overview)
*Main dashboard showing real-time charger statistics*

### Charger Details
![Charger Details](https://via.placeholder.com/800x450/764ba2/ffffff?text=Charger+Details)
*Detailed view with actions, metrics, and blockchain info*

### AI Agent Interface
![AI Agent](https://via.placeholder.com/800x450/667eea/ffffff?text=AI+Agent+Interface)
*Chat interface and live monitoring feed*

### Live Activity Monitor
![Live Monitor](https://via.placeholder.com/800x450/764ba2/ffffff?text=Live+Activity+Monitor)
*Real-time WebSocket updates of AI decisions*

---

## 🎬 Demo

### Video Demo
[Watch the full demo on YouTube](#) *(Coming soon)*

### Live Demo
[Try it live](#) *(Coming soon)*

### Test Credentials
```
Main Dashboard: http://localhost:8080
AI Agent: http://localhost:8080/agent.html
```

---

## 🗺️ Roadmap

### Phase 1: Core Features ✅
- [x] Charger CRUD operations
- [x] Transaction simulation
- [x] Battery management
- [x] Basic dashboard

### Phase 2: AI Integration ✅
- [x] Autonomous monitoring
- [x] GPT-4 decision making
- [x] Support ticket automation
- [x] Chat interface

### Phase 3: Real-time Features ✅
- [x] WebSocket implementation
- [x] Live activity feed
- [x] Real-time statistics
- [x] Enhanced logging

### Phase 4: Blockchain (Current) 🚧
- [x] Base network integration
- [x] Wallet management
- [ ] Smart contract deployment
- [ ] NFT charger ownership

### Phase 5: Advanced AI 🔮
- [ ] Predictive maintenance ML model
- [ ] Pattern recognition
- [ ] Anomaly detection
- [ ] Cost optimization algorithms

### Phase 6: Mobile & IoT 🔮
- [ ] Mobile app (React Native)
- [ ] IoT device integration
- [ ] Real charger hardware support
- [ ] Geolocation services

### Phase 7: Scaling 🔮
- [ ] Multi-tenant support
- [ ] Load balancing
- [ ] Cloud deployment
- [ ] API rate limiting

---

## 🤝 Contributing

We welcome contributions! Here's how you can help:

### Reporting Bugs
Open an issue with:
- Description of the bug
- Steps to reproduce
- Expected vs actual behavior
- Screenshots (if applicable)

### Suggesting Features
Open an issue with:
- Feature description
- Use case
- Proposed implementation

### Pull Requests
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Code Style
- Use ES6+ features
- Follow existing code patterns
- Add comments for complex logic
- Include console logs for debugging

---

## 👥 Team

**Aleph Dobi** was built during the [Hackathon Name] by:

- **[Your Name]** - Full Stack Developer & AI Integration
  - GitHub: [@username](https://github.com/username)
  - LinkedIn: [Profile](https://linkedin.com/in/username)

*Add your team members here*

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **OpenAI** - For GPT-4 API access
- **Base Network** - For blockchain infrastructure
- **Ethers.js** - For Web3 integration
- **The Hackathon Organizers** - For the opportunity

---

## 📞 Contact & Support

- **Issues**: [GitHub Issues](https://github.com/your-username/aleph-dobi/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-username/aleph-dobi/discussions)
- **Email**: your.email@example.com

---

## 🌟 Star History

If you find this project useful, please consider giving it a star ⭐

[![Star History Chart](https://api.star-history.com/svg?repos=your-username/aleph-dobi&type=Date)](https://star-history.com/#your-username/aleph-dobi&Date)

---

<div align="center">

**Made with ⚡ by the Aleph Dobi Team**

[Website](#) • [Documentation](#) • [Demo](#) • [Report Bug](#) • [Request Feature](#)

</div>