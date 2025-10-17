#!/usr/bin/env node

require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const { ethers } = require("ethers");

// =================== CONFIG ===================
const BASE_RPC = process.env.BASE_RPC;
const provider = new ethers.JsonRpcProvider(BASE_RPC);

// Toggle real on-chain sends (default false: simulate only)
const SEND_ONCHAIN = process.env.SEND_ONCHAIN;

// Dirección fija para el pago de costos (misma que en server.js)
const COSTS_ADDRESS = "0x57e56B49dcF7540a991ac6B4C9597eBa892A7168";

// =================== SQLITE CONNECTION ===================
const db = new sqlite3.Database('./chargers.db', (err) => {
  if (err) {
    console.error('Error conectando a SQLite:', err);
    process.exit(1);
  } else {
    console.log('Conectado a SQLite');
  }
});

// =================== HELPER FUNCTIONS ===================
function nowISO() {
  return new Date().toISOString();
}

function addLog({ charger_id, message, transactions, income_generated, cost_generated, balance_total, battery, power }) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO logs (charger_id, message, timestamp, transactions, income_generated, cost_generated, 
       balance_total, battery, power)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [charger_id, message, nowISO(), transactions, income_generated, cost_generated, balance_total, 
       battery, power],
      (err) => err ? reject(err) : resolve()
    );
  });
}

// =================== ACTION FUNCTIONS ===================
async function payCosts(charger) {
  try {
    const chargerWallet = new ethers.Wallet(charger.wallet_privateKey, provider);
    const balance = await provider.getBalance(chargerWallet.address);
    const toPay = (balance * 40n) / 100n; // 40%

    let message = "";
    let txHash = "pay";

    if (!SEND_ONCHAIN) {
      message = `costs payment: ${ethers.formatEther(toPay)} ETH`;
    } else {
      if (toPay > 0n) {
        const tx = await chargerWallet.sendTransaction({
          to: COSTS_ADDRESS,
          value: toPay
        });
        const receipt = await tx.wait();
        txHash = receipt.hash;
        message = `Paid costs: ${ethers.formatEther(toPay)} ETH (${txHash})`;
      } else {
        message = "Not enough balance to pay costs";
      }
    }

    // Log the action
    await addLog({
      charger_id: charger.id_charger,
      message,
      transactions: charger.transactions,
      income_generated: charger.income_generated,
      cost_generated: charger.cost_generated,
      balance_total: charger.balance_total,
      battery: charger.battery,
      power: charger.power
    });

    return { success: true, message, txHash, amount: ethers.formatEther(toPay) };
  } catch (error) {
    const errorMsg = `Error paying costs: ${error.message}`;
    
    await addLog({
      charger_id: charger.id_charger,
      message: errorMsg,
      transactions: charger.transactions,
      income_generated: charger.income_generated,
      cost_generated: charger.cost_generated,
      balance_total: charger.balance_total,
      battery: charger.battery,
      power: charger.power
    });

    return { success: false, error: errorMsg };
  }
}

async function sendToOwner(charger) {
  try {
    const chargerWallet = new ethers.Wallet(charger.wallet_privateKey, provider);
    const balance = await provider.getBalance(chargerWallet.address);
    const gasBuffer = ethers.parseEther("0.0001"); // keep a small buffer

    let message = "";
    let txHash = "transfer";

    if (!SEND_ONCHAIN) {
      message = `transfer to owner: ${ethers.formatEther(balance)} ETH`;
    } else {
      if (balance > gasBuffer) {
        const value = balance - gasBuffer;
        const tx = await chargerWallet.sendTransaction({
          to: charger.owner_address,
          value
        });
        const receipt = await tx.wait();
        txHash = receipt.hash;
        message = `Sent ${ethers.formatEther(value)} ETH to owner (${txHash})`;
      } else {
        message = "Not enough balance (only gas buffer remaining)";
      }
    }

    // Log the action
    await addLog({
      charger_id: charger.id_charger,
      message,
      transactions: charger.transactions,
      income_generated: charger.income_generated,
      cost_generated: charger.cost_generated,
      balance_total: charger.balance_total,
      battery: charger.battery,
      power: charger.power
    });

    const transferAmount = balance > gasBuffer ? ethers.formatEther(balance - gasBuffer) : "0";
    return { success: true, message, txHash, amount: transferAmount };
  } catch (error) {
    const errorMsg = `Error sending to owner: ${error.message}`;
    
    await addLog({
      charger_id: charger.id_charger,
      message: errorMsg,
      transactions: charger.transactions,
      income_generated: charger.income_generated,
      cost_generated: charger.cost_generated,
      balance_total: charger.balance_total,
      battery: charger.battery,
      power: charger.power
    });

    return { success: false, error: errorMsg };
  }
}

// =================== DATABASE FUNCTIONS ===================
function getAllChargers() {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM chargers", [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function getChargerBalance(walletAddress) {
  return provider.getBalance(walletAddress);
}

// =================== MAIN PROCESSING ===================
async function processCharger(charger, options = {}) {
  const { payFirst = true, delayBetweenActions = 2000 } = options;
  
  console.log(`\nProcesando cargador: ${charger.id_charger}`);
  console.log(`  Ubicación: ${charger.location}`);
  console.log(`  Estado: ${charger.status}`);
  console.log(`  Owner: ${charger.owner_address}`);
  console.log(`  Wallet: ${charger.wallet_address}`);

  const results = {
    charger_id: charger.id_charger,
    location: charger.location,
    status: charger.status,
    owner_address: charger.owner_address,
    wallet_address: charger.wallet_address,
    actions: {}
  };

  try {
    // Obtener balance inicial
    const initialBalance = await getChargerBalance(charger.wallet_address);
    results.initial_balance = ethers.formatEther(initialBalance);
    console.log(`  Balance inicial: ${results.initial_balance} ETH`);

    // Verificar si tiene balance suficiente
    if (initialBalance === 0n) {
      console.log(`  ⚠️ Cargador sin balance, saltando...`);
      results.skipped = true;
      results.reason = 'No balance';
      return results;
    }

    // Verificar si el owner_address es válido
    if (!charger.owner_address || charger.owner_address === "0x0000000000000000000000000000000000000000") {
      console.log(`  ⚠️ Owner address inválido, saltando...`);
      results.skipped = true;
      results.reason = 'Invalid owner address';
      return results;
    }

    // Ejecutar acciones en el orden especificado
    const actions = payFirst ? ['pay_costs', 'send_to_owner'] : ['send_to_owner', 'pay_costs'];
    
    for (const action of actions) {
      console.log(`    Ejecutando ${action}...`);
      
      let result;
      if (action === 'pay_costs') {
        result = await payCosts(charger);
      } else if (action === 'send_to_owner') {
        result = await sendToOwner(charger);
      }
      
      results.actions[action] = result;
      
      if (result.success) {
        console.log(`    ✅ ${action}: ${result.message}`);
      } else {
        console.log(`    ❌ ${action}: ${result.error}`);
      }
      
      // Pausa entre acciones
      if (delayBetweenActions > 0 && action !== actions[actions.length - 1]) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenActions));
      }
    }

    // Obtener balance final
    const finalBalance = await getChargerBalance(charger.wallet_address);
    results.final_balance = ethers.formatEther(finalBalance);
    console.log(`  Balance final: ${results.final_balance} ETH`);

  } catch (error) {
    console.log(`  💥 Error procesando cargador: ${error.message}`);
    results.error = error.message;
  }

  return results;
}

// =================== MAIN FUNCTION ===================
async function main() {
  console.log('🚀 Iniciando script de acciones masivas para cargadores');
  console.log(`🌐 RPC: ${BASE_RPC}`);
  console.log(`🔗 Modo blockchain: ${SEND_ONCHAIN ? 'TRANSACCIONES REALES' : 'SOLO SIMULACIÓN'}`);
  console.log(`💰 Dirección de costos: ${COSTS_ADDRESS}`);
  console.log('=' * 70);

  const startTime = Date.now();
  let summary = {
    total_chargers: 0,
    processed: 0,
    skipped: 0,
    errors: 0,
    successful_actions: 0,
    failed_actions: 0,
    total_costs_paid: 0,
    total_sent_to_owners: 0,
    results: []
  };

  try {
    // Obtener todos los cargadores
    const chargers = await getAllChargers();
    summary.total_chargers = chargers.length;

    if (chargers.length === 0) {
      console.log('⚠️ No se encontraron cargadores en la base de datos.');
      return;
    }

    console.log(`📊 Se encontraron ${chargers.length} cargadores en la base de datos\n`);

    // Procesar cada cargador
    for (let i = 0; i < chargers.length; i++) {
      const charger = chargers[i];
      
      try {
        const result = await processCharger(charger, {
          payFirst: true,        // Primero pagar costos, luego enviar al owner
          delayBetweenActions: 3000  // 3 segundos entre acciones
        });

        summary.results.push(result);

        if (result.skipped) {
          summary.skipped++;
        } else if (result.error) {
          summary.errors++;
        } else {
          summary.processed++;
          
          // Contar acciones exitosas y fallidas
          Object.values(result.actions).forEach(action => {
            if (action.success) {
              summary.successful_actions++;
              
              // Sumar montos transferidos
              if (action.amount && !isNaN(parseFloat(action.amount))) {
                const amount = parseFloat(action.amount);
                if (action.message.includes('costs')) {
                  summary.total_costs_paid += amount;
                } else if (action.message.includes('owner')) {
                  summary.total_sent_to_owners += amount;
                }
              }
            } else {
              summary.failed_actions++;
            }
          });
        }

        // Pausa entre cargadores
        if (i < chargers.length - 1) {
          console.log('  Esperando antes del siguiente cargador...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

      } catch (error) {
        console.error(`💥 Error procesando cargador ${charger.id_charger}:`, error.message);
        summary.errors++;
      }
    }

  } catch (error) {
    console.error('💥 Error fatal:', error.message);
    process.exit(1);
  } finally {
    // Cerrar conexión a la base de datos
    db.close((err) => {
      if (err) console.error('Error cerrando base de datos:', err.message);
      else console.log('Conexión a base de datos cerrada.');
    });
  }

  // Mostrar resumen final
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  console.log('\n' + '=' * 70);
  console.log('📋 RESUMEN FINAL');
  console.log('=' * 70);
  console.log(`⏱️ Tiempo total: ${duration} segundos`);
  console.log(`📊 Cargadores totales: ${summary.total_chargers}`);
  console.log(`✅ Cargadores procesados: ${summary.processed}`);
  console.log(`⏭️ Cargadores saltados: ${summary.skipped}`);
  console.log(`❌ Errores: ${summary.errors}`);
  console.log(`🎯 Acciones exitosas: ${summary.successful_actions}`);
  console.log(`💥 Acciones fallidas: ${summary.failed_actions}`);
  console.log(`💰 Total costos pagados: ${summary.total_costs_paid.toFixed(6)} ETH`);
  console.log(`📤 Total enviado a owners: ${summary.total_sent_to_owners.toFixed(6)} ETH`);

  // Mostrar detalles de resultados
  const successfulResults = summary.results.filter(r => 
    !r.skipped && !r.error && Object.values(r.actions || {}).every(a => a.success)
  );

  const failedResults = summary.results.filter(r => 
    !r.skipped && (r.error || Object.values(r.actions || {}).some(a => !a.success))
  );

  const skippedResults = summary.results.filter(r => r.skipped);

  if (successfulResults.length > 0) {
    console.log('\n✅ CARGADORES PROCESADOS EXITOSAMENTE:');
    successfulResults.forEach(result => {
      console.log(`  🔋 ${result.charger_id} (${result.location})`);
      console.log(`     Inicial: ${result.initial_balance} ETH → Final: ${result.final_balance} ETH`);
    });
  }

  if (skippedResults.length > 0) {
    console.log('\n⏭️ CARGADORES SALTADOS:');
    skippedResults.forEach(result => {
      console.log(`  🔋 ${result.charger_id} (${result.location}) - Razón: ${result.reason}`);
    });
  }

  if (failedResults.length > 0) {
    console.log('\n❌ CARGADORES CON ERRORES:');
    failedResults.forEach(result => {
      console.log(`  🔋 ${result.charger_id} (${result.location})`);
      if (result.error) {
        console.log(`     Error general: ${result.error}`);
      }
      Object.entries(result.actions || {}).forEach(([action, actionResult]) => {
        if (!actionResult.success) {
          console.log(`     ${action}: ${actionResult.error}`);
        }
      });
    });
  }

  console.log('\n🏁 Script completado!');
}

// =================== EXECUTION ===================
if (require.main === module) {
  // Verificar variables de entorno requeridas
  if (!BASE_RPC) {
    console.error('❌ BASE_RPC no está configurado en el archivo .env');
    process.exit(1);
  }

  // Verificar argumentos de ayuda
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🔧 Script de Acciones Masivas para Cargadores (Acceso Directo a DB)

DESCRIPCIÓN:
  Este script se conecta directamente a la base de datos SQLite y ejecuta
  las acciones pay_costs y send_to_owner para todos los cargadores.

USO:
  node mass_actions.js

VARIABLES DE ENTORNO REQUERIDAS (archivo .env):
  BASE_RPC            URL del RPC de Base/Ethereum
  SEND_ONCHAIN        true/false - Enviar transacciones reales o simular

ACCIONES EJECUTADAS:
  1. pay_costs        - Pagar 40% del balance a la dirección de costos
  2. send_to_owner    - Enviar balance restante al propietario

REQUISITOS:
  - Archivo chargers.db en el mismo directorio
  - Archivo .env con las variables configuradas
  - npm packages: sqlite3, ethers, dotenv

NOTAS:
  - Solo procesa cargadores con balance > 0
  - Salta cargadores con owner_address inválido
  - Mantiene buffer de gas de 0.001 ETH en transacciones reales
    `);
    process.exit(0);
  }

  // Ejecutar script principal
  main().catch(error => {
    console.error('💥 Error no manejado:', error);
    process.exit(1);
  });
}

module.exports = { main, processCharger, payCosts, sendToOwner };