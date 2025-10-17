// server.js
require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const { ethers } = require("ethers");
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const app = express();

const port = process.env.PORT;

// =================== ENHANCED LOGGING ===================
const LOG_COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function log(type, message, data = null) {
  const timestamp = new Date().toLocaleTimeString();
  let color = LOG_COLORS.reset;
  let icon = '•';

  switch(type) {
    case 'success':
      color = LOG_COLORS.green;
      icon = '✓';
      break;
    case 'error':
      color = LOG_COLORS.red;
      icon = '✗';
      break;
    case 'warning':
      color = LOG_COLORS.yellow;
      icon = '⚠';
      break;
    case 'info':
      color = LOG_COLORS.blue;
      icon = 'ℹ';
      break;
    case 'transaction':
      color = LOG_COLORS.cyan;
      icon = '⚡';
      break;
    case 'action':
      color = LOG_COLORS.magenta;
      icon = '🔧';
      break;
  }

  console.log(`${LOG_COLORS.gray}[${timestamp}]${LOG_COLORS.reset} ${color}${icon} ${message}${LOG_COLORS.reset}`);
  
  if (data) {
    console.log(`${LOG_COLORS.gray}  └─ Data:${LOG_COLORS.reset}`, data);
  }
}

// =================== CORS ===================
app.use(cors());
app.use(cors({
  origin: ['http://localhost:8080', 'http://127.0.0.1:8080', 'http://localhost:3001', 'file://'],
  credentials: true
}));

app.use(express.json());

// =================== CONFIG ===================
const API_KEY = process.env.API_KEY
const BASE_RPC = process.env.BASE_RPC
const provider = new ethers.JsonRpcProvider(BASE_RPC);

// Toggle real on-chain sends (default false: simulate only)
const SEND_ONCHAIN = process.env.SEND_ONCHAIN;

// Master wallet (sender of simulated deposits to chargers)
const MASTER_PRIVATE_KEY = process.env.MASTER_PRIVATE_KEY;
const masterWallet = new ethers.Wallet(MASTER_PRIVATE_KEY, provider);

// Simulation parameters
const MAX_DAILY_CHARGES = 100;
const SIMULATION_HOURS = { start: 0, end: 24 }; // local server time window
const MIN_TX_ETH = Number(process.env.MIN_TX_ETH || '0.0001');
const MAX_TX_ETH = Number(process.env.MAX_TX_ETH || '0.0002');

// =================== SQLITE ===================
const db = new sqlite3.Database('./chargers.db', (err) => {
  if (err) {
    log('error', 'Error connecting to SQLite', { error: err.message });
  } else {
    log('success', 'Connected to SQLite database');
  }
});

// Create tables if not exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS chargers (
      id_charger TEXT PRIMARY KEY,
      owner_address TEXT,
      wallet_address TEXT,
      wallet_privateKey TEXT,
      status TEXT,
      transactions INTEGER,
      income_generated REAL,
      cost_generated REAL,
      balance_total REAL,
      location TEXT,
      description TEXT,
      battery REAL,
      power REAL
    )
  `, (err) => {
    if (err) log('error', 'Failed to create chargers table', { error: err.message });
    else log('success', 'Chargers table ready');
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      charger_id TEXT,
      message TEXT,
      timestamp TEXT,
      transactions INTEGER,
      income_generated REAL,
      cost_generated REAL,
      balance_total REAL,
      battery REAL,
      power REAL
    )
  `, (err) => {
    if (err) log('error', 'Failed to create logs table', { error: err.message });
    else log('success', 'Logs table ready');
  });
});

// =================== INITIAL DATA LOADING ===================
async function loadInitialChargers() {
  try {
    const chargerJsonPath = path.join(__dirname, 'chargers.json');
    if (fs.existsSync(chargerJsonPath)) {
      const chargerData = JSON.parse(fs.readFileSync(chargerJsonPath, 'utf8'));
      log('info', `Loading ${chargerData.length} chargers from chargers.json...`);
      
      for (const charger of chargerData) {
        await new Promise((resolve) => {
          db.get("SELECT id_charger FROM chargers WHERE id_charger = ?", [charger.id_charger], (err, row) => {
            if (!row) {
              const newWallet = ethers.Wallet.createRandom();
              
              db.run(
                `INSERT INTO chargers (id_charger, owner_address, wallet_address, wallet_privateKey, status, 
                 transactions, income_generated, cost_generated, balance_total, location, description, 
                 battery, power)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  charger.id_charger,
                  charger.owner_address || "0x0000000000000000000000000000000000000000",
                  newWallet.address,
                  newWallet.privateKey,
                  charger.status || "inactive",
                  charger.transactions || 0,
                  charger.income_generated || 0,
                  charger.cost_generated || 0,
                  charger.balance_total || 0,
                  charger.location || "No especificada",
                  charger.description || "Cargador estándar",
                  charger.battery || 100.0,
                  charger.power || 7.4
                ],
                function (err) {
                  if (err) {
                    log('error', `Failed to create charger ${charger.id_charger}`, { error: err.message });
                  } else {
                    log('success', `Loaded charger ${charger.id_charger}`, {
                      location: charger.location,
                      status: charger.status,
                      wallet: newWallet.address
                    });
                    if (charger.status === 'active') {
                      scheduleChargerTransactions(charger.id_charger);
                    }
                  }
                  resolve();
                }
              );
            } else {
              log('info', `Charger ${charger.id_charger} already exists, skipping...`);
              resolve();
            }
          });
        });
      }
    } else {
      log('warning', 'No chargers.json found, starting with empty database');
    }
  } catch (error) {
    log('error', 'Error loading initial chargers', { error: error.message });
  }
}

// =================== HELPERS ===================
let scheduledCharges = {};
let scheduledTimeouts = [];

function clearScheduledTimeouts() {
  scheduledTimeouts.forEach(clearTimeout);
  scheduledTimeouts = [];
  log('info', 'Cleared all scheduled timeouts');
}

function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function nowISO() {
  return new Date().toISOString();
}

function addLog({ charger_id, message, transactions, income_generated, cost_generated, balance_total, battery, power }) {
  db.run(
    `INSERT INTO logs (charger_id, message, timestamp, transactions, income_generated, cost_generated, 
     balance_total, battery, power)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [charger_id, message, nowISO(), transactions, income_generated, cost_generated, balance_total, 
     battery, power],
    (err) => {
      if (err) {
        log('error', `Failed to add log for ${charger_id}`, { error: err.message });
      }
    }
  );
}

function initializeScheduledCharges() {
  db.all("SELECT id_charger FROM chargers", [], (err, rows) => {
    if (err) {
      log('error', 'Failed to initialize scheduled charges', { error: err.message });
      return;
    }
    scheduledCharges = rows.reduce((acc, row) => {
      acc[row.id_charger] = 0;
      return acc;
    }, {});
    log('success', `Initialized scheduled charges for ${rows.length} chargers`);
  });
}

function scheduleChargerTransactions(chargerId) {
  db.get("SELECT * FROM chargers WHERE id_charger = ? AND status = 'active'", [chargerId], (err, charger) => {
    if (err || !charger) return;

    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    let scheduledTimes = [];
    let nextWindow = Math.ceil((currentHour * 60 + currentMinute) / 15) * 15;
    
    while (nextWindow < SIMULATION_HOURS.end * 60) {
      const hour = Math.floor(nextWindow / 60);
      const baseMinute = nextWindow % 60;
      
      if (hour >= SIMULATION_HOURS.start && hour < SIMULATION_HOURS.end) {
        const randomOffset = Math.floor(Math.random() * 11) - 5;
        let minute = baseMinute + randomOffset;
        
        if (minute < 0) minute = 0;
        if (minute > 59) minute = 59;
        
        scheduledTimes.push({ hour, minute });
      }
      
      nextWindow += 15;
    }
    
    let scheduledCount = 0;
    scheduledTimes.forEach(time => {
      const scheduledTime = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        time.hour,
        time.minute,
        Math.floor(Math.random() * 60),
        0
      );
      
      const delay = scheduledTime.getTime() - now.getTime();
      
      if (delay > 0) {
        const t = setTimeout(async () => {
          db.get("SELECT * FROM chargers WHERE id_charger = ?", [chargerId], async (e, fresh) => {
            if (e || !fresh) return;
            if (fresh.status === 'active') {
              if (Math.random() < 0.9) {
                if ((fresh.battery || 100) >= 10) {
                  await performSimulatedTransaction(fresh);
                  scheduledCharges[chargerId] = (scheduledCharges[chargerId] || 0) + 1;
                } else {
                  log('warning', `Skipped transaction for ${chargerId} - battery too low`, {
                    battery: fresh.battery?.toFixed(1) + '%'
                  });
                }
              } else {
                log('info', `Skipped transaction for ${chargerId} (random skip for realism)`);
              }
            }
          });
        }, delay);
        
        scheduledTimeouts.push(t);
        scheduledCount++;
      }
    });

    log('success', `Scheduled ${scheduledCount} transactions for ${chargerId}`);
  });
}

function scheduleDailyTransactions() {
  db.all("SELECT id_charger FROM chargers WHERE status = 'active'", [], (err, rows) => {
    if (err) {
      log('error', 'Failed to schedule daily transactions', { error: err.message });
      return;
    }
    log('info', `Scheduling transactions for ${rows.length} active chargers`);
    rows.forEach(row => {
      scheduleChargerTransactions(row.id_charger);
    });
  });
}

function resetDailySchedule() {
  log('info', 'Daily reset: clearing timeouts, zeroing counters, and rescheduling');
  clearScheduledTimeouts();
  initializeScheduledCharges();
  scheduleDailyTransactions();
}

// =================== CORE: Simulate a transaction ===================
async function performSimulatedTransaction(charger) {
  const startTime = Date.now();
  log('transaction', `Starting transaction for ${charger.id_charger}`, {
    location: charger.location,
    current_battery: charger.battery?.toFixed(1) + '%',
    current_balance: charger.balance_total?.toFixed(6) + ' ETH'
  });

  try {
    const id = charger.id_charger;

    if ((scheduledCharges[id] || 0) >= MAX_DAILY_CHARGES) {
      log('warning', `Rate limit reached for ${id}`, {
        charges_today: scheduledCharges[id],
        max_allowed: MAX_DAILY_CHARGES
      });
      return;
    }

    const batteryConsumption = (charger.power || 7.4) * 0.5;
    const newBatteryLevel = Math.max(0, (charger.battery || 100) - batteryConsumption);
    
    log('info', `Battery consumption calculated for ${id}`, {
      power: charger.power + ' kW',
      consumption: batteryConsumption.toFixed(2) + '%',
      new_level: newBatteryLevel.toFixed(1) + '%'
    });

    const amountEth = randomFloat(MIN_TX_ETH, MAX_TX_ETH);
    const amountWei = ethers.parseEther(amountEth.toFixed(6));

    log('transaction', `Generating transaction amount for ${id}`, {
      amount: amountEth.toFixed(6) + ' ETH',
      range: `${MIN_TX_ETH} - ${MAX_TX_ETH} ETH`
    });

    let txHash = "simulated";
    if (SEND_ONCHAIN) {
      log('info', `Sending REAL on-chain transaction for ${id}...`);
      try {
        const tx = await masterWallet.sendTransaction({
          to: charger.wallet_address,
          value: amountWei
        });
        log('transaction', `Transaction sent, waiting for confirmation...`, {
          tx_hash: tx.hash,
          to: charger.wallet_address
        });
        
        const receipt = await tx.wait();
        txHash = receipt?.hash || tx.hash;
        
        log('success', `On-chain transaction confirmed for ${id}`, {
          tx_hash: txHash,
          block: receipt.blockNumber,
          gas_used: receipt.gasUsed.toString()
        });
      } catch (txError) {
        log('error', `Failed to send on-chain transaction for ${id}`, {
          error: txError.message
        });
        throw txError;
      }
    } else {
      log('info', `Simulated transaction (no on-chain) for ${id}`);
    }

    const income = Number(ethers.formatEther(amountWei));
    const cost = income * 0.4;
    const delta = income - cost;

    log('info', `Calculating economics for ${id}`, {
      income: income.toFixed(6) + ' ETH',
      cost: cost.toFixed(6) + ' ETH (40%)',
      profit: delta.toFixed(6) + ' ETH'
    });

    const newTransactions = (charger.transactions || 0) + 1;
    const newIncome = Number(charger.income_generated || 0) + income;
    const newCost = Number(charger.cost_generated || 0) + cost;
    const newBalance = Number(charger.balance_total || 0) + delta;

    log('info', `Updating database for ${id}...`);
    
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE chargers 
         SET transactions = ?, income_generated = ?, cost_generated = ?, balance_total = ?, battery = ?
         WHERE id_charger = ?`,
        [newTransactions, newIncome, newCost, newBalance, newBatteryLevel, id],
        (err) => {
          if (err) {
            log('error', `Database update failed for ${id}`, { error: err.message });
            reject(err);
          } else {
            log('success', `Database updated for ${id}`);
            resolve();
          }
        }
      );
    });

    addLog({
      charger_id: id,
      message: `completed deposit (${txHash}) - Battery: ${newBatteryLevel.toFixed(1)}%`,
      transactions: newTransactions,
      income_generated: newIncome,
      cost_generated: newCost,
      balance_total: newBalance,
      battery: newBatteryLevel,
      power: charger.power
    });

    scheduledCharges[id] = (scheduledCharges[id] || 0) + 1;
    
    const duration = Date.now() - startTime;
    log('success', `Transaction completed for ${id}`, {
      duration: duration + 'ms',
      new_balance: newBalance.toFixed(6) + ' ETH',
      total_transactions: newTransactions,
      charges_today: scheduledCharges[id]
    });

  } catch (error) {
    log('error', `Transaction failed for ${charger.id_charger}`, {
      error: error.message,
      stack: error.stack
    });
  }
}

// =================== ENDPOINTS ===================

app.post('/api/chargers', async (req, res) => {
  const { id_charger, owner_address, status, location, description, battery, power } = req.body;
  
  log('info', `Request to create charger: ${id_charger}`);
  
  if (!id_charger || !owner_address) {
    log('error', 'Missing required fields', { id_charger, owner_address });
    return res.status(400).json({ error: "id_charger and owner_address are required" });
  }

  try {
    const newWallet = ethers.Wallet.createRandom();
    const chargerStatus = status || "inactive";

    db.run(
      `INSERT INTO chargers (id_charger, owner_address, wallet_address, wallet_privateKey, status, 
       transactions, income_generated, cost_generated, balance_total, location, description, 
       battery, power)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id_charger, owner_address, newWallet.address, newWallet.privateKey, chargerStatus,
        0, 0, 0, 0, location || "No especificada", description || "Cargador estándar",
        battery || 100.0, power || 7.4
      ],
      function (err) {
        if (err) {
          log('error', `Failed to create charger ${id_charger}`, { error: err.message });
          return res.status(500).json({ error: err.message });
        }
        
        scheduledCharges[id_charger] = 0;
        
        if (chargerStatus === 'active') {
          scheduleChargerTransactions(id_charger);
          log('success', `Charger ${id_charger} created and scheduled`, { status: chargerStatus });
        } else {
          log('success', `Charger ${id_charger} created`, { status: chargerStatus });
        }
        
        res.status(201).json({
          message: "Charger created",
          id_charger,
          wallet: newWallet.address,
          status: chargerStatus,
          location: location || "No especificada",
          description: description || "Cargador estándar",
          battery: battery || 100.0,
          power: power || 7.4
        });
      }
    );
  } catch (error) {
    log('error', `Error creating charger ${id_charger}`, { error: error.message });
    res.status(500).json({ error: "Error creating charger", details: error.message });
  }
});

app.put('/api/chargers/:id', async (req, res) => {
  const { id } = req.params;
  const { location, description, battery, power } = req.body;
  
  log('info', `Request to update charger: ${id}`, { location, description, battery, power });
  
  db.get("SELECT * FROM chargers WHERE id_charger = ?", [id], (err, charger) => {
    if (err || !charger) {
      log('error', `Charger not found: ${id}`);
      return res.status(404).json({ error: "Charger not found" });
    }
    
    const updates = [];
    const values = [];
    
    if (location !== undefined) {
      updates.push("location = ?");
      values.push(location);
    }
    if (description !== undefined) {
      updates.push("description = ?");
      values.push(description);
    }
    if (battery !== undefined) {
      updates.push("battery = ?");
      values.push(battery);
    }
    if (power !== undefined) {
      updates.push("power = ?");
      values.push(power);
    }
    
    if (updates.length === 0) {
      log('warning', `No fields to update for ${id}`);
      return res.status(400).json({ error: "No fields to update" });
    }
    
    values.push(id);
    const query = `UPDATE chargers SET ${updates.join(", ")} WHERE id_charger = ?`;
    
    db.run(query, values, function(err) {
      if (err) {
        log('error', `Failed to update ${id}`, { error: err.message });
        return res.status(500).json({ error: err.message });
      }
      
      addLog({
        charger_id: id,
        message: "Charger details updated",
        transactions: charger.transactions,
        income_generated: charger.income_generated,
        cost_generated: charger.cost_generated,
        balance_total: charger.balance_total,
        battery: battery || charger.battery,
        power: power || charger.power
      });
      
      log('success', `Updated charger ${id}`, { updated_fields: updates.length });
      res.json({ message: "Charger updated successfully", updated_fields: updates.length });
    });
  });
});

app.post('/api/chargers/:id/action', async (req, res) => {
  const { id } = req.params;
  const { action } = req.body;

  log('action', `Action requested: ${action} for ${id}`);

  db.get("SELECT * FROM chargers WHERE id_charger = ?", [id], async (err, charger) => {
    if (err || !charger) {
      log('error', `Charger not found: ${id}`);
      return res.status(404).json({ error: "Charger not found" });
    }

    log('info', `Charger found, current status: ${charger.status}`, {
      location: charger.location,
      battery: charger.battery?.toFixed(1) + '%'
    });

    try {
      let message = "";
      let batteryUpdate = null;

      switch (action) {
        case "turn_off":
          log('action', `Turning OFF charger ${id}`);
          db.run("UPDATE chargers SET status = ? WHERE id_charger = ?", ["inactive", id], (err) => {
            if (err) {
              log('error', `Failed to turn off ${id}`, { error: err.message });
            } else {
              log('success', `Charger ${id} turned OFF`);
            }
          });
          message = "Charger turned off";
          break;

        case "turn_on":
          log('action', `Turning ON charger ${id}`);
          db.run("UPDATE chargers SET status = ? WHERE id_charger = ?", ["active", id], (err) => {
            if (!err) {
              log('success', `Charger ${id} turned ON, scheduling transactions...`);
              scheduleChargerTransactions(id);
              log('info', `Transactions scheduled for ${id}`);
            } else {
              log('error', `Failed to turn on ${id}`, { error: err.message });
            }
          });
          message = "Charger turned on";
          break;

        case "restart":
          log('action', `RESTARTING charger ${id}`);
          db.run("UPDATE chargers SET status = ? WHERE id_charger = ?", ["inactive", id], (e) => {
            if (!e) {
              log('info', `Charger ${id} set to inactive, waiting 3 seconds...`);
              setTimeout(() => {
                db.run("UPDATE chargers SET status = ? WHERE id_charger = ?", ["active", id], (err) => {
                  if (!err) {
                    log('success', `Charger ${id} reactivated, scheduling transactions...`);
                    scheduleChargerTransactions(id);
                    log('info', `Transactions rescheduled for ${id}`);
                  } else {
                    log('error', `Failed to reactivate ${id}`, { error: err.message });
                  }
                });
              }, 3000);
            } else {
              log('error', `Failed to restart ${id}`, { error: e.message });
            }
          });
          message = "Charger restarted";
          break;

        case "recharge_battery":
          log('action', `RECHARGING battery for ${id}`, {
            current: charger.battery?.toFixed(1) + '%',
            target: '100%'
          });
          batteryUpdate = 100.0;
          db.run("UPDATE chargers SET battery = ? WHERE id_charger = ?", [batteryUpdate, id], (err) => {
            if (err) {
              log('error', `Failed to recharge battery for ${id}`, { error: err.message });
            } else {
              log('success', `Battery recharged to 100% for ${id}`);
            }
          });
          message = "Battery recharged to 100%";
          break;

        case "create_ticket":
          log('action', `Creating SUPPORT TICKET for ${id}`, {
            location: charger.location,
            status: charger.status,
            battery: charger.battery?.toFixed(1) + '%'
          });
          message = `Support ticket created for charger at ${charger.location} (simulated)`;
          log('success', `Support ticket created for ${id}`);
          break;

        case "pay_costs": {
          log('action', `Processing COST PAYMENT for ${id}`);
          const chargerWallet = new ethers.Wallet(charger.wallet_privateKey, provider);
          
          log('info', `Fetching wallet balance for ${id}...`);
          const balance = await provider.getBalance(chargerWallet.address);
          const toPay = (balance * 40n) / 100n;

          log('info', `Balance calculation for ${id}`, {
            total_balance: ethers.formatEther(balance) + ' ETH',
            to_pay: ethers.formatEther(toPay) + ' ETH (40%)'
          });

          if (!SEND_ONCHAIN) {
            message = `Simulated costs payment: ${ethers.formatEther(toPay)} ETH`;
            log('info', `Simulated cost payment for ${id} (no on-chain)`);
            break;
          }

          if (toPay > 0n) {
            log('transaction', `Sending cost payment transaction for ${id}...`);
            const tx = await chargerWallet.sendTransaction({
              to: "0x57e56B49dcF7540a991ac6B4C9597eBa892A7168",
              value: toPay
            });
            log('info', `Transaction sent, waiting for confirmation...`, { tx_hash: tx.hash });
            
            const receipt = await tx.wait();
            message = `Paid costs: ${ethers.formatEther(toPay)} ETH`;
            
            log('success', `Cost payment confirmed for ${id}`, {
              tx_hash: receipt.hash,
              block: receipt.blockNumber,
              amount: ethers.formatEther(toPay) + ' ETH'
            });
          } else {
            message = "Not enough balance to pay costs";
            log('warning', `Insufficient balance for cost payment ${id}`);
          }
          break;
        }

        case "send_to_owner": {
          log('action', `Processing TRANSFER TO OWNER for ${id}`);
          const chargerWallet = new ethers.Wallet(charger.wallet_privateKey, provider);
          
          log('info', `Fetching wallet balance for ${id}...`);
          const balance = await provider.getBalance(chargerWallet.address);
          const gasBuffer = ethers.parseEther("0.001");

          log('info', `Balance calculation for ${id}`, {
            total_balance: ethers.formatEther(balance) + ' ETH',
            gas_buffer: ethers.formatEther(gasBuffer) + ' ETH',
            available: ethers.formatEther(balance - gasBuffer) + ' ETH'
          });

          if (!SEND_ONCHAIN) {
            message = `Simulated transfer to owner: ${ethers.formatEther(balance)} ETH`;
            log('info', `Simulated owner transfer for ${id} (no on-chain)`);
            break;
          }

          if (balance > gasBuffer) {
            const value = balance - gasBuffer;
            log('transaction', `Sending transfer to owner for ${id}...`, {
              to: charger.owner_address,
              amount: ethers.formatEther(value) + ' ETH'
            });
            
            const tx = await chargerWallet.sendTransaction({
              to: charger.owner_address,
              value
            });
            
            log('info', `Transaction sent, waiting for confirmation...`, { tx_hash: tx.hash });
            
            const receipt = await tx.wait();
            message = `Sent ${ethers.formatEther(value)} ETH to owner`;
            
            log('success', `Transfer to owner confirmed for ${id}`, {
              tx_hash: receipt.hash,
              block: receipt.blockNumber,
              amount: ethers.formatEther(value) + ' ETH',
              to: charger.owner_address
            });
          } else {
            message = "Not enough balance";
            log('warning', `Insufficient balance for owner transfer ${id}`);
          }
          break;
        }

        default:
          log('error', `Invalid action requested: ${action} for ${id}`);
          return res.status(400).json({ error: "Invalid action" });
      }

      addLog({
        charger_id: id,
        message,
        transactions: charger.transactions,
        income_generated: charger.income_generated,
        cost_generated: charger.cost_generated,
        balance_total: charger.balance_total,
        battery: batteryUpdate || charger.battery,
        power: charger.power
      });

      log('success', `Action completed successfully: ${action} for ${id}`);

      return res.json({ 
        message,
        charger_info: {
          location: charger.location,
          battery: batteryUpdate || charger.battery,
          power: charger.power
        }
      });
    } catch (error) {
      log('error', `Action failed: ${action} for ${id}`, {
        error: error.message,
        stack: error.stack
      });
      return res.status(500).json({ error: error.message });
    }
  });
});

app.get('/api/chargers/:id/action', async (req, res) => {
  const { id } = req.params;
  
  try {
    const charger = await new Promise((resolve, reject) => {
      db.get("SELECT * FROM chargers WHERE id_charger = ?", [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!charger) {
      return res.status(404).json({ error: "Charger not found" });
    }

    let blockchainBalance = "0";
    let blockchainBalanceWei = 0n;
    try {
      if (charger.wallet_address) {
        const balance = await provider.getBalance(charger.wallet_address);
        blockchainBalance = ethers.formatEther(balance);
        blockchainBalanceWei = balance;
      }
    } catch (error) {
      log('warning', `Could not fetch balance for ${charger.id_charger}`, { error: error.message });
    }

    const actions = {
      turn_off: {
        name: "Turn Off",
        description: "Turns off the charger and stops all charging operations",
        available: charger.status === 'active',
        requirements: ["Charger must be active"],
        effects: ["Changes status to inactive", "Stops scheduled transactions"],
        category: "power_management"
      },
      turn_on: {
        name: "Turn On", 
        description: "Activates the charger and starts charging operations",
        available: charger.status === 'inactive',
        requirements: ["Charger must be inactive"],
        effects: ["Changes status to active", "Schedules automatic transactions"],
        category: "power_management"
      },
      restart: {
        name: "Restart",
        description: "Restarts the charger (turns off for 3 seconds, then back on)",
        available: true,
        requirements: ["None"],
        effects: ["Briefly turns off charger", "Reactivates after 3 seconds", "Reschedules transactions"],
        category: "power_management"
      },
      recharge_battery: {
        name: "Recharge Battery",
        description: "Recharges the charger's battery to 100%",
        available: (charger.battery || 100) < 100,
        requirements: ["Battery level below 100%"],
        effects: ["Sets battery level to 100%"],
        category: "maintenance",
        current_battery: charger.battery || 100
      },
      create_ticket: {
        name: "Create Support Ticket",
        description: "Creates a support ticket for maintenance or issues",
        available: true,
        requirements: ["None"],
        effects: ["Simulates support ticket creation"],
        category: "support"
      },
      pay_costs: {
        name: "Pay Operating Costs",
        description: "Pays 40% of wallet balance as operating costs",
        available: blockchainBalanceWei > 0n,
        requirements: ["Wallet must have balance"],
        effects: ["Sends 40% of wallet balance to costs address"],
        category: "financial",
        current_balance_eth: blockchainBalance,
        estimated_payment_eth: blockchainBalanceWei > 0n ? 
          ethers.formatEther((blockchainBalanceWei * 40n) / 100n) : "0",
        simulation_mode: !SEND_ONCHAIN
      },
      send_to_owner: {
        name: "Send Funds to Owner",
        description: "Sends available wallet balance to the owner address",
        available: blockchainBalanceWei > ethers.parseEther("0.001"),
        requirements: ["Wallet balance > 0.001 ETH (gas buffer)"],
        effects: ["Transfers funds to owner address", "Keeps small amount for gas"],
        category: "financial",
        current_balance_eth: blockchainBalance,
        owner_address: charger.owner_address,
        estimated_transfer_eth: blockchainBalanceWei > ethers.parseEther("0.001") ?
          ethers.formatEther(blockchainBalanceWei - ethers.parseEther("0.001")) : "0",
        simulation_mode: !SEND_ONCHAIN
      }
    };

    const availableActions = {};
    const unavailableActions = {};

    Object.entries(actions).forEach(([key, action]) => {
      if (action.available) {
        availableActions[key] = action;
      } else {
        unavailableActions[key] = {
          ...action,
          reason_unavailable: getUnavailableReason(key, charger, blockchainBalanceWei)
        };
      }
    });

    const actionsByCategory = {
      power_management: {},
      maintenance: {},
      support: {},
      financial: {}
    };

    Object.entries(actions).forEach(([key, action]) => {
      actionsByCategory[action.category][key] = action;
    });

    const recentActions = await new Promise((resolve, reject) => {
      db.all(
        `SELECT message, timestamp FROM logs 
         WHERE charger_id = ? AND (
           message LIKE '%turned%' OR 
           message LIKE '%restarted%' OR 
           message LIKE '%recharged%' OR 
           message LIKE '%ticket%' OR 
           message LIKE '%paid%' OR 
           message LIKE '%sent%'
         )
         ORDER BY id DESC LIMIT 10`,
        [id],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    const response = {
      charger_info: {
        id_charger: charger.id_charger,
        status: charger.status,
        battery_level: charger.battery || 100,
        location: charger.location,
        wallet_address: charger.wallet_address,
        owner_address: charger.owner_address
      },
      blockchain_info: {
        wallet_balance_eth: blockchainBalance,
        network: "Base",
        simulation_mode: !SEND_ONCHAIN
      },
      actions: {
        available: availableActions,
        unavailable: unavailableActions,
        total_available: Object.keys(availableActions).length,
        total_actions: Object.keys(actions).length
      },
      actions_by_category: actionsByCategory,
      recent_actions: recentActions.map(log => ({
        action: log.message,
        timestamp: log.timestamp,
        time_ago: getTimeAgo(new Date(log.timestamp))
      })),
      usage_info: {
        endpoint: `/api/chargers/${id}/action`,
        method: "POST",
        body_format: {
          action: "action_name"
        },
        example: {
          action: "turn_on"
        }
      },
      metadata: {
        checked_at: new Date().toISOString()
      }
    };

    res.json(response);

  } catch (error) {
    log('error', `Error fetching actions for charger ${id}`, { error: error.message });
    res.status(500).json({ 
      error: "Internal server error",
      message: error.message 
    });
  }
});

function getUnavailableReason(actionKey, charger, blockchainBalance) {
  switch (actionKey) {
    case 'turn_off':
      return charger.status !== 'active' ? 'Charger is already inactive' : 'Unknown';
    case 'turn_on':
      return charger.status !== 'inactive' ? 'Charger is already active' : 'Unknown';
    case 'recharge_battery':
      return (charger.battery || 100) >= 100 ? 'Battery is already at 100%' : 'Unknown';
    case 'pay_costs':
      return blockchainBalance <= 0n ? 'No balance available in wallet' : 'Unknown';
    case 'send_to_owner':
      return blockchainBalance <= ethers.parseEther("0.001") ? 
        'Insufficient balance (need >0.001 ETH for gas)' : 'Unknown';
    default:
      return 'Conditions not met';
  }
}

function getTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  return `${diffDays} days ago`;
}

app.post('/api/chargers/:id/simulate_transaction', async (req, res) => {
  const { id } = req.params;
  const { amount_eth } = req.body || {};

  log('info', `Manual transaction simulation requested for ${id}`, { amount_eth });

  db.get("SELECT * FROM chargers WHERE id_charger = ?", [id], async (err, charger) => {
    if (err || !charger) {
      log('error', `Charger not found: ${id}`);
      return res.status(404).json({ error: "Charger not found" });
    }
    
    if ((charger.battery || 0) < 10) {
      log('warning', `Battery too low for ${id}`, { battery: charger.battery });
      return res.status(400).json({ 
        error: "Battery too low", 
        message: "Charger needs battery recharge",
        battery_level: charger.battery 
      });
    }
    
    if (amount_eth && typeof amount_eth === 'number' && amount_eth > 0) {
      try {
        const batteryConsumption = (charger.power || 7.4) * 0.5;
        const newBatteryLevel = Math.max(0, (charger.battery || 100) - batteryConsumption);
        
        const amountWei = ethers.parseEther(amount_eth.toFixed(6));
        let txHash = "simulated";
        if (SEND_ONCHAIN) {
          const tx = await masterWallet.sendTransaction({
            to: charger.wallet_address,
            value: amountWei
          });
          const receipt = await tx.wait();
          txHash = receipt?.hash || tx.hash;
        }

        const income = Number(ethers.formatEther(amountWei));
        const cost = income * 0.4;
        const delta = income - cost;

        const newTransactions = (charger.transactions || 0) + 1;
        const newIncome = Number(charger.income_generated || 0) + income;
        const newCost = Number(charger.cost_generated || 0) + cost;
        const newBalance = Number(charger.balance_total || 0) + delta;

        db.run(
          `UPDATE chargers 
           SET transactions = ?, income_generated = ?, cost_generated = ?, balance_total = ?, battery = ?
           WHERE id_charger = ?`,
          [newTransactions, newIncome, newCost, newBalance, newBatteryLevel, id]
        );

        addLog({
          charger_id: id,
          message: `manual simulated deposit (${txHash}) - Battery: ${newBatteryLevel.toFixed(1)}%`,
          transactions: newTransactions,
          income_generated: newIncome,
          cost_generated: newCost,
          balance_total: newBalance,
          battery: newBatteryLevel,
          power: charger.power
        });

        log('success', `Manual transaction completed for ${id}`, {
          amount: amount_eth + ' ETH',
          tx_hash: txHash
        });

        return res.json({ 
          message: `Simulated ${amount_eth} ETH deposit`, 
          txHash,
          battery_level: newBatteryLevel,
          location: charger.location
        });
      } catch (e) {
        log('error', `Manual transaction failed for ${id}`, { error: e.message });
        return res.status(500).json({ error: e.message });
      }
    } else {
      await performSimulatedTransaction(charger);
      return res.json({ message: "Simulated transaction executed" });
    }
  });
});

app.get('/api/chargers/detailed', async (req, res) => {
  try {
    const chargers = await new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          id_charger, owner_address, wallet_address, status, transactions, 
          income_generated, cost_generated, balance_total, location, description, battery, power
        FROM chargers
      `, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    const detailedChargers = await Promise.all(chargers.map(async (charger) => {
      const scheduledToday = scheduledCharges[charger.id_charger] || 0;
      const remainingCharges = Math.max(0, MAX_DAILY_CHARGES - scheduledToday);
      
      const recentLogs = await new Promise((resolve, reject) => {
        db.all(
          "SELECT message, timestamp, battery FROM logs WHERE charger_id = ? ORDER BY id DESC LIMIT 5",
          [charger.id_charger],
          (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          }
        );
      });

      const nextScheduledTime = getNextScheduledTransaction(charger.id_charger);
      
      let blockchainBalance = "0";
      try {
        if (charger.wallet_address) {
          const balance = await provider.getBalance(charger.wallet_address);
          blockchainBalance = ethers.formatEther(balance);
        }
      } catch (error) {
        log('warning', `Could not fetch balance for ${charger.id_charger}`, { error: error.message });
      }

      const batteryAlert = (charger.battery || 100) < 20 ? "Low battery - needs recharge" : null;

      return {
        ...charger,
        battery_alert: batteryAlert,
        schedule_info: {
          charges_today: scheduledToday,
          remaining_charges: remainingCharges,
          max_daily_charges: MAX_DAILY_CHARGES,
          next_scheduled: nextScheduledTime,
          simulation_window: SIMULATION_HOURS
        },
        blockchain_info: {
          wallet_balance_eth: blockchainBalance,
          send_onchain_enabled: SEND_ONCHAIN
        },
        recent_activity: recentLogs,
        last_updated: new Date().toISOString()
      };
    }));

    const summary = {
      total_chargers: detailedChargers.length,
      active_chargers: detailedChargers.filter(c => c.status === 'active').length,
      inactive_chargers: detailedChargers.filter(c => c.status === 'inactive').length,
      low_battery_chargers: detailedChargers.filter(c => (c.battery || 100) < 20).length,
      total_transactions: detailedChargers.reduce((sum, c) => sum + (c.transactions || 0), 0),
      total_income: detailedChargers.reduce((sum, c) => sum + (c.income_generated || 0), 0),
      total_costs: detailedChargers.reduce((sum, c) => sum + (c.cost_generated || 0), 0),
      total_balance: detailedChargers.reduce((sum, c) => sum + (c.balance_total || 0), 0),
      average_battery_level: detailedChargers.reduce((sum, c) => sum + (c.battery || 0), 0) / detailedChargers.length,
      total_power_capacity: detailedChargers.reduce((sum, c) => sum + (c.power || 0), 0),
      charges_scheduled_today: Object.values(scheduledCharges).reduce((sum, count) => sum + count, 0)
    };

    res.json({
      summary,
      chargers: detailedChargers,
      system_info: {
        simulation_mode: !SEND_ONCHAIN,
        min_tx_eth: MIN_TX_ETH,
        max_tx_eth: MAX_TX_ETH,
        simulation_hours: SIMULATION_HOURS,
        server_time: new Date().toISOString()
      }
    });

  } catch (error) {
    log('error', 'Failed to get detailed chargers', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/chargers/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const charger = await new Promise((resolve, reject) => {
      db.get(
        `SELECT 
          id_charger, owner_address, wallet_address, status, transactions,
          income_generated, cost_generated, balance_total, location, description, battery, power
        FROM chargers 
        WHERE id_charger = ?`,
        [id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!charger) {
      log('warning', `Charger not found: ${id}`);
      return res.status(404).json({ 
        error: "Charger not found",
        charger_id: id 
      });
    }

    const scheduledToday = scheduledCharges[charger.id_charger] || 0;
    const remainingCharges = Math.max(0, MAX_DAILY_CHARGES - scheduledToday);
    
    const recentLogs = await new Promise((resolve, reject) => {
      db.all(
        `SELECT message, timestamp, transactions, income_generated, cost_generated, balance_total, battery, power
        FROM logs 
        WHERE charger_id = ? 
        ORDER BY id DESC 
        LIMIT 10`,
        [id],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    let blockchainBalance = "0";
    let blockchainBalanceWei = "0";
    try {
      if (charger.wallet_address) {
        const balance = await provider.getBalance(charger.wallet_address);
        blockchainBalance = ethers.formatEther(balance);
        blockchainBalanceWei = balance.toString();
      }
    } catch (error) {
      log('warning', `Could not fetch balance for ${charger.id_charger}`, { error: error.message });
    }

    const efficiency = charger.transactions > 0 
      ? ((charger.balance_total / charger.income_generated) * 100).toFixed(2)
      : "0.00";

    const batteryStatus = {
      level: charger.battery || 0,
      status: charger.battery >= 80 ? "good" : 
              charger.battery >= 50 ? "medium" : 
              charger.battery >= 20 ? "low" : "critical",
      needs_recharge: charger.battery < 20
    };

    const nextScheduledTime = charger.status === 'active' 
      ? getNextScheduledTransaction(charger.id_charger) 
      : null;

    const response = {
      charger: {
        id_charger: charger.id_charger,
        owner_address: charger.owner_address,
        wallet_address: charger.wallet_address,
        status: charger.status,
        location: charger.location || "Not specified",
        description: charger.description || "Standard charger",
        power: charger.power || 7.4,
        battery: batteryStatus
      },
      financial: {
        transactions: charger.transactions || 0,
        income_generated: charger.income_generated || 0,
        cost_generated: charger.cost_generated || 0,
        balance_total: charger.balance_total || 0,
        efficiency_percentage: efficiency
      },
      blockchain: {
        wallet_balance_eth: blockchainBalance,
        wallet_balance_wei: blockchainBalanceWei,
        network: "Base",
        onchain_mode: SEND_ONCHAIN ? "REAL" : "SIMULATION"
      },
      schedule: {
        charges_today: scheduledToday,
        remaining_charges_today: remainingCharges,
        max_daily_charges: MAX_DAILY_CHARGES,
        next_scheduled_transaction: nextScheduledTime,
        simulation_window: {
          start_hour: SIMULATION_HOURS.start,
          end_hour: SIMULATION_HOURS.end
        }
      },
      recent_activity: recentLogs.map(log => ({
        message: log.message,
        timestamp: log.timestamp,
        battery_at_time: log.battery,
        transactions_total: log.transactions,
        balance_at_time: log.balance_total
      })),
      metadata: {
        last_checked: new Date().toISOString(),
        server_time: new Date().toISOString()
      }
    };

    res.json(response);

  } catch (error) {
    log('error', `Error fetching charger ${id}`, { error: error.message });
    res.status(500).json({ 
      error: "Internal server error",
      message: error.message 
    });
  }
});

function getNextScheduledTransaction(chargerId) {
  const now = new Date();
  const currentHour = now.getHours();
  
  if (currentHour >= SIMULATION_HOURS.start && currentHour < SIMULATION_HOURS.end) {
    const remainingHours = SIMULATION_HOURS.end - currentHour;
    const chargesLeft = Math.max(0, MAX_DAILY_CHARGES - (scheduledCharges[chargerId] || 0));
    
    if (chargesLeft > 0 && remainingHours > 0) {
      const avgInterval = (remainingHours * 60) / chargesLeft;
      const nextTime = new Date(now.getTime() + (avgInterval * 60 * 1000));
      return nextTime.toISOString();
    }
  }
  
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(SIMULATION_HOURS.start, 0, 0, 0);
  return tomorrow.toISOString();
}

app.get('/api/logs', async (req, res) => {
  const { include_blockchain = 'false', charger_id } = req.query;
  
  try {
    let dbQuery = "SELECT * FROM logs";
    let queryParams = [];
    
    if (charger_id) {
      dbQuery += " WHERE charger_id = ?";
      queryParams.push(charger_id);
    }
    
    dbQuery += " ORDER BY id DESC LIMIT 500";
    
    const dbLogs = await new Promise((resolve, reject) => {
      db.all(dbQuery, queryParams, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    let response = {
      database_logs: dbLogs,
      blockchain_transactions: []
    };

    if (include_blockchain === 'true') {
      log('info', 'Fetching blockchain transactions...');
      
      let chargersQuery = "SELECT id_charger, wallet_address, location FROM chargers";
      let chargersParams = [];
      
      if (charger_id) {
        chargersQuery += " WHERE id_charger = ?";
        chargersParams.push(charger_id);
      }

      const chargers = await new Promise((resolve, reject) => {
        db.all(chargersQuery, chargersParams, (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        });
      });

      const blockchainTransactions = [];
      
      for (const charger of chargers) {
        try {
          const history = await getWalletTransactionHistory(charger.wallet_address);
          
          history.forEach(tx => {
            blockchainTransactions.push({
              charger_id: charger.id_charger,
              location: charger.location,
              wallet_address: charger.wallet_address,
              tx_hash: tx.hash,
              block_number: tx.blockNumber,
              timestamp: new Date(tx.timestamp * 1000).toISOString(),
              from: tx.from,
              to: tx.to,
              value_eth: ethers.formatEther(tx.value),
              gas_used: tx.gasUsed ? tx.gasUsed.toString() : null,
              status: tx.status === 1 ? 'success' : 'failed',
              type: tx.to.toLowerCase() === charger.wallet_address.toLowerCase() ? 'incoming' : 'outgoing'
            });
          });
        } catch (error) {
          log('error', `Error fetching transactions for ${charger.id_charger}`, { error: error.message });
        }
      }

      blockchainTransactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      response.blockchain_transactions = blockchainTransactions;
    }

    res.json(response);
  } catch (error) {
    log('error', 'Failed to get logs', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

async function getWalletTransactionHistory(walletAddress, limit = 100) {
  try {
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latestBlock - 10000);
    
    const transactions = [];
    
    try {
      const recentBlocks = 50;
      const startBlock = Math.max(0, latestBlock - recentBlocks);
      
      for (let blockNum = startBlock; blockNum <= latestBlock; blockNum++) {
        try {
          const block = await provider.getBlock(blockNum, true);
          if (block && block.transactions) {
            for (const tx of block.transactions) {
              if (tx.to && tx.to.toLowerCase() === walletAddress.toLowerCase() || 
                  tx.from && tx.from.toLowerCase() === walletAddress.toLowerCase()) {
                
                const receipt = await provider.getTransactionReceipt(tx.hash);
                
                transactions.push({
                  hash: tx.hash,
                  blockNumber: blockNum,
                  timestamp: block.timestamp,
                  from: tx.from,
                  to: tx.to,
                  value: tx.value,
                  gasUsed: receipt ? receipt.gasUsed : null,
                  status: receipt ? receipt.status : null
                });
              }
            }
          }
        } catch (blockError) {
          continue;
        }
      }
    } catch (scanError) {
      log('warning', 'Block scanning failed', { error: scanError.message });
    }
    
    return transactions.slice(0, limit);
  } catch (error) {
    log('error', 'Error fetching wallet history', { error: error.message });
    return [];
  }
}

// =================== AUTOMATED TASKS ===================
setInterval(() => {
  log('info', 'Running hourly automated tasks...');
  db.all("SELECT * FROM chargers", [], (err, rows) => {
    if (err) return log('error', 'Failed to get chargers for automated tasks', { error: err.message });
    
    rows.forEach(row => {
      if ((row.battery || 100) < 20) {
        db.run("UPDATE chargers SET battery = ? WHERE id_charger = ?", [100, row.id_charger]);
        log('success', `Auto-recharged battery for ${row.id_charger}`);
        
        addLog({
          charger_id: row.id_charger,
          message: "Automatic battery recharge",
          transactions: row.transactions,
          income_generated: row.income_generated,
          cost_generated: row.cost_generated,
          balance_total: row.balance_total,
          battery: 100,
          power: row.power
        });
      }
      
      const newStatus = Math.random() > 0.5 ? "active" : "inactive";
      db.run("UPDATE chargers SET status = ? WHERE id_charger = ?", [newStatus, row.id_charger], (err) => {
        if (!err) {
          log('info', `Auto status change: ${row.id_charger} -> ${newStatus}`);
          if (newStatus === 'active') {
            scheduleChargerTransactions(row.id_charger);
          }
        }
      });
    });
  });
}, 60 * 60 * 1000);

setInterval(resetDailySchedule, 24 * 60 * 60 * 1000);

app.get('/', (req, res) => {
  res.send('API Aleph Dobi is running!');
});

// =================== RUN ===================
app.listen(port, "0.0.0.0", async () => {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║            🚀 Aleph Dobi Server Started               ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  log('success', `Server running on port ${port}`);
  log('info', `Blockchain mode: ${SEND_ONCHAIN ? 'REAL TRANSACTIONS' : 'SIMULATION ONLY'}`);
  log('info', `Transaction range: ${MIN_TX_ETH} - ${MAX_TX_ETH} ETH`);
  log('info', `Max daily charges per charger: ${MAX_DAILY_CHARGES}`);
  log('info', `Simulation hours: ${SIMULATION_HOURS.start}:00 - ${SIMULATION_HOURS.end}:00`);
});