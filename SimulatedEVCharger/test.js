// test.js - Script completo de pruebas para la API de cargadores
// Ejecutar con: node test.js

const http = require('http');
const https = require('https');
const { URL } = require('url');

const BASE_URL = 'http://localhost:6139';
const API_KEY = '482967568f22cbe8167e2a6b41122feca6d133d5c380e';

// Colores para la consola
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

// Función helper para hacer peticiones HTTP (compatible con Node.js antiguo)
async function makeRequest(method, endpoint, data = null, headers = {}) {
  const url = new URL(`${BASE_URL}${endpoint}`);
  const isHttps = url.protocol === 'https:';
  const httpModule = isHttps ? https : http;
  
  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname + url.search,
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  };

  return new Promise((resolve) => {
    const req = httpModule.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(responseData);
          resolve({
            status: res.statusCode,
            data: parsedData,
            success: res.statusCode >= 200 && res.statusCode < 300
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            data: { error: 'Invalid JSON response', raw: responseData },
            success: false
          });
        }
      });
    });

    req.on('error', (error) => {
      resolve({
        status: 0,
        data: { error: error.message },
        success: false
      });
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Función para imprimir resultados
function printResult(testName, success, message, data = null) {
  const color = success ? colors.green : colors.red;
  const symbol = success ? '✓' : '✗';
  
  console.log(`${color}${symbol} ${testName}${colors.reset}`);
  console.log(`  ${message}`);
  
  if (data && process.env.VERBOSE) {
    console.log(`  ${colors.cyan}Data:${colors.reset}`, JSON.stringify(data, null, 2));
  }
  console.log('');
}

// Función para esperar
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Variables globales para el test
let createdChargers = [];
let testResults = {
  passed: 0,
  failed: 0,
  total: 0
};

// =================== TESTS ===================

async function test1_CreateChargers() {
  console.log(`${colors.bold}${colors.blue}=== TEST 1: Crear Cargadores ===${colors.reset}\n`);
  
  const testChargers = [
    {
      id_charger: 'TEST_CHARGER_011',
      owner_address: '0x742d35Cc6634C0532925a3b8D56B4B8d3d73a9B1',
      status: 'active'
    }
  ];

  for (const charger of testChargers) {
    const result = await makeRequest('POST', '/api/chargers', charger);
    testResults.total++;
    
    if (result.success) {
      createdChargers.push(charger.id_charger);
      testResults.passed++;
      printResult(
        `Crear cargador ${charger.id_charger}`,
        true,
        `Status: ${result.status} | Wallet: ${result.data.wallet}`,
        result.data
      );
    } else {
      testResults.failed++;
      printResult(
        `Crear cargador ${charger.id_charger}`,
        false,
        `Error: ${result.data.error}`,
        result.data
      );
    }
  }
}

async function test2_ChargerActions() {
  console.log(`${colors.bold}${colors.blue}=== TEST 2: Acciones de Cargadores ===${colors.reset}\n`);
  
  if (createdChargers.length === 0) {
    console.log(`${colors.yellow}⚠ Saltando test - No hay cargadores creados${colors.reset}\n`);
    return;
  }

  const actions = ['turn_on', 'turn_off', 'restart', 'create_ticket'];
  const testChargerId = createdChargers[0];

  for (const action of actions) {
    const result = await makeRequest('POST', `/api/chargers/${testChargerId}/action`, { action });
    testResults.total++;
    
    if (result.success) {
      testResults.passed++;
      printResult(
        `Acción ${action} en ${testChargerId}`,
        true,
        `Status: ${result.status} | ${result.data.message}`
      );
    } else {
      testResults.failed++;
      printResult(
        `Acción ${action} en ${testChargerId}`,
        false,
        `Error: ${result.data.error}`
      );
    }

    // Esperar un poco para acciones que toman tiempo (como restart)
    if (action === 'restart') {
      console.log(`  ${colors.yellow}Esperando 4 segundos para restart...${colors.reset}`);
      await sleep(4000);
    } else {
      await sleep(500);
    }
  }
}

async function test3_SimulateTransactions() {
  console.log(`${colors.bold}${colors.blue}=== TEST 3: Simular Transacciones ===${colors.reset}\n`);
  
  if (createdChargers.length === 0) {
    console.log(`${colors.yellow}⚠ Saltando test - No hay cargadores creados${colors.reset}\n`);
    return;
  }

  const testChargerId = createdChargers[0];

  // Activar el cargador primero
  await makeRequest('POST', `/api/chargers/${testChargerId}/action`, { action: 'turn_on' });
  await sleep(1000);

  // Test 1: Transacción con cantidad específica
  const result1 = await makeRequest('POST', `/api/chargers/${testChargerId}/simulate_transaction`, {
    amount_eth: 0.001
  });
  
  testResults.total++;
  if (result1.success) {
    testResults.passed++;
    printResult(
      `Simular transacción específica (0.001 ETH)`,
      true,
      `Status: ${result1.status} | ${result1.data.message}`,
      result1.data
    );
  } else {
    testResults.failed++;
    printResult(
      `Simular transacción específica`,
      false,
      `Error: ${result1.data.error}`
    );
  }

  // Test 2: Transacción aleatoria
  const result2 = await makeRequest('POST', `/api/chargers/${testChargerId}/simulate_transaction`);
  
  testResults.total++;
  if (result2.success) {
    testResults.passed++;
    printResult(
      `Simular transacción aleatoria`,
      true,
      `Status: ${result2.status} | ${result2.data.message}`
    );
  } else {
    testResults.failed++;
    printResult(
      `Simular transacción aleatoria`,
      false,
      `Error: ${result2.data.error}`
    );
  }
}

async function test4_GetDetailedChargers() {
  console.log(`${colors.bold}${colors.blue}=== TEST 4: Información Detallada de Cargadores ===${colors.reset}\n`);
  
  const result = await makeRequest('GET', '/api/chargers/detailed');
  testResults.total++;
  
  if (result.success) {
    testResults.passed++;
    const { summary, chargers, system_info } = result.data;
    
    printResult(
      `Obtener información detallada`,
      true,
      `Encontrados ${chargers.length} cargadores | Activos: ${summary.active_chargers}`,
      {
        summary,
        charger_count: chargers.length,
        system_info
      }
    );

    // Mostrar información de cada cargador
    chargers.forEach((charger, index) => {
      console.log(`  ${colors.cyan}Cargador ${index + 1}:${colors.reset}`);
      console.log(`    ID: ${charger.id_charger}`);
      console.log(`    Estado: ${charger.status}`);
      console.log(`    Transacciones: ${charger.transactions}`);
      console.log(`    Balance: ${charger.balance_total}`);
      console.log(`    Cargas hoy: ${charger.schedule_info.charges_today}/${charger.schedule_info.max_daily_charges}`);
      console.log(`    Balance blockchain: ${charger.blockchain_info.wallet_balance_eth} ETH`);
      console.log('');
    });

  } else {
    testResults.failed++;
    printResult(
      `Obtener información detallada`,
      false,
      `Error: ${result.data.error}`
    );
  }
}

async function test5_GetLogs() {
  console.log(`${colors.bold}${colors.blue}=== TEST 5: Obtener Logs ===${colors.reset}\n`);
  
  // Test 1: Logs sin blockchain
  const result1 = await makeRequest('GET', '/api/logs?include_blockchain=false');
  testResults.total++;
  
  if (result1.success) {
    testResults.passed++;
    printResult(
      `Obtener logs (sin blockchain)`,
      true,
      `Logs DB: ${result1.data.database_logs.length} | Blockchain: ${result1.data.blockchain_transactions.length}`,
      {
        db_logs_count: result1.data.database_logs.length,
        blockchain_count: result1.data.blockchain_transactions.length
      }
    );
  } else {
    testResults.failed++;
    printResult(
      `Obtener logs (sin blockchain)`,
      false,
      `Error: ${result1.data.error}`
    );
  }

  await sleep(1000);

  // Test 2: Logs con blockchain (puede tardar más)
  console.log(`  ${colors.yellow}Consultando blockchain... (puede tardar)${colors.reset}`);
  const result2 = await makeRequest('GET', '/api/logs?include_blockchain=true');
  testResults.total++;
  
  if (result2.success) {
    testResults.passed++;
    printResult(
      `Obtener logs (con blockchain)`,
      true,
      `Logs DB: ${result2.data.database_logs.length} | Blockchain: ${result2.data.blockchain_transactions.length}`,
      {
        db_logs_count: result2.data.database_logs.length,
        blockchain_count: result2.data.blockchain_transactions.length
      }
    );

    // Mostrar algunos logs recientes
    if (result2.data.database_logs.length > 0) {
      console.log(`  ${colors.cyan}Logs recientes:${colors.reset}`);
      result2.data.database_logs.slice(0, 3).forEach((log, index) => {
        console.log(`    ${index + 1}. [${log.timestamp}] ${log.charger_id}: ${log.message}`);
      });
      console.log('');
    }

  } else {
    testResults.failed++;
    printResult(
      `Obtener logs (con blockchain)`,
      false,
      `Error: ${result2.data.error}`
    );
  }

  // Test 3: Logs de cargador específico
  if (createdChargers.length > 0) {
    const testChargerId = createdChargers[0];
    const result3 = await makeRequest('GET', `/api/logs?charger_id=${testChargerId}&include_blockchain=false`);
    testResults.total++;
    
    if (result3.success) {
      testResults.passed++;
      printResult(
        `Obtener logs de cargador específico (${testChargerId})`,
        true,
        `Logs encontrados: ${result3.data.database_logs.length}`
      );
    } else {
      testResults.failed++;
      printResult(
        `Obtener logs de cargador específico`,
        false,
        `Error: ${result3.data.error}`
      );
    }
  }
}

async function test6_ErrorHandling() {
  console.log(`${colors.bold}${colors.blue}=== TEST 6: Manejo de Errores ===${colors.reset}\n`);
  
  // Test 1: Crear cargador sin datos requeridos
  const result1 = await makeRequest('POST', '/api/chargers', {});
  testResults.total++;
  
  if (!result1.success && result1.status === 400) {
    testResults.passed++;
    printResult(
      `Error esperado: crear cargador sin datos`,
      true,
      `Status: ${result1.status} | ${result1.data.error}`
    );
  } else {
    testResults.failed++;
    printResult(
      `Error esperado: crear cargador sin datos`,
      false,
      `Debería haber fallado con status 400`
    );
  }

  // Test 2: Acción en cargador inexistente
  const result2 = await makeRequest('POST', '/api/chargers/NONEXISTENT/action', { action: 'turn_on' });
  testResults.total++;
  
  if (!result2.success && result2.status === 404) {
    testResults.passed++;
    printResult(
      `Error esperado: cargador inexistente`,
      true,
      `Status: ${result2.status} | ${result2.data.error}`
    );
  } else {
    testResults.failed++;
    printResult(
      `Error esperado: cargador inexistente`,
      false,
      `Debería haber fallado con status 404`
    );
  }

  // Test 3: Acción inválida
  if (createdChargers.length > 0) {
    const result3 = await makeRequest('POST', `/api/chargers/${createdChargers[0]}/action`, { action: 'invalid_action' });
    testResults.total++;
    
    if (!result3.success && result3.status === 400) {
      testResults.passed++;
      printResult(
        `Error esperado: acción inválida`,
        true,
        `Status: ${result3.status} | ${result3.data.error}`
      );
    } else {
      testResults.failed++;
      printResult(
        `Error esperado: acción inválida`,
        false,
        `Debería haber fallado con status 400`
      );
    }
  }
}

async function test7_ServerStatus() {
  console.log(`${colors.bold}${colors.blue}=== TEST 7: Estado del Servidor ===${colors.reset}\n`);
  
  // Verificar que el servidor esté respondiendo
  try {
    const result = await makeRequest('GET', '/api/chargers/detailed');
    testResults.total++;
    
    if (result.success) {
      testResults.passed++;
      printResult(
        `Servidor respondiendo`,
        true,
        `Status: ${result.status} | Modo: ${result.data.system_info.simulation_mode ? 'SIMULACIÓN' : 'BLOCKCHAIN REAL'}`
      );

      // Mostrar información del sistema
      console.log(`  ${colors.cyan}Información del sistema:${colors.reset}`);
      console.log(`    Modo simulación: ${result.data.system_info.simulation_mode}`);
      console.log(`    ETH mín por tx: ${result.data.system_info.min_tx_eth}`);
      console.log(`    ETH máx por tx: ${result.data.system_info.max_tx_eth}`);
      console.log(`    Horas simulación: ${result.data.system_info.simulation_hours.start}:00 - ${result.data.system_info.simulation_hours.end}:00`);
      console.log(`    Tiempo servidor: ${result.data.system_info.server_time}`);
      console.log('');

    } else {
      testResults.failed++;
      printResult(
        `Servidor respondiendo`,
        false,
        `Error: ${result.data.error}`
      );
    }
  } catch (error) {
    testResults.total++;
    testResults.failed++;
    printResult(
      `Conexión al servidor`,
      false,
      `Error de conexión: ${error.message}`
    );
  }
}

// =================== EJECUCIÓN PRINCIPAL ===================

async function runAllTests() {
  console.log(`${colors.bold}${colors.cyan}🚀 INICIANDO TESTS COMPLETOS DE LA API DE CARGADORES${colors.reset}\n`);
  console.log(`${colors.yellow}Servidor: ${BASE_URL}${colors.reset}`);
  console.log(`${colors.yellow}Modo verbose: ${process.env.VERBOSE ? 'ON' : 'OFF'} (usa VERBOSE=1 para más detalles)${colors.reset}\n`);

  const startTime = Date.now();

  try {
    // Verificar que el servidor esté corriendo
    await test7_ServerStatus();
    
    if (testResults.failed === testResults.total) {
      console.log(`${colors.red}❌ No se puede conectar al servidor. Asegúrate de que esté ejecutándose en ${BASE_URL}${colors.reset}`);
      process.exit(1);
    }

    // Ejecutar todos los tests
    await test1_CreateChargers();
    await test2_ChargerActions();
    await test3_SimulateTransactions();
    await test4_GetDetailedChargers();
    await test5_GetLogs();
    await test6_ErrorHandling();

  } catch (error) {
    console.log(`${colors.red}❌ Error inesperado durante los tests: ${error.message}${colors.reset}`);
  }

  // Reporte final
  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  console.log(`${colors.bold}${colors.cyan}📊 REPORTE FINAL${colors.reset}`);
  console.log(`${colors.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.green}✓ Tests pasados: ${testResults.passed}${colors.reset}`);
  console.log(`${colors.red}✗ Tests fallidos: ${testResults.failed}${colors.reset}`);
  console.log(`${colors.blue}📋 Total tests: ${testResults.total}${colors.reset}`);
  console.log(`${colors.yellow}⏱ Duración: ${duration}s${colors.reset}`);
  
  const successRate = testResults.total > 0 ? ((testResults.passed / testResults.total) * 100).toFixed(1) : 0;
  console.log(`${colors.cyan}📈 Tasa de éxito: ${successRate}%${colors.reset}`);

  if (testResults.failed === 0) {
    console.log(`\n${colors.bold}${colors.green}🎉 ¡TODOS LOS TESTS PASARON!${colors.reset}`);
    process.exit(0);
  } else {
    console.log(`\n${colors.bold}${colors.yellow}⚠ Algunos tests fallaron. Revisa los detalles arriba.${colors.reset}`);
    process.exit(1);
  }
}

// Ejecutar tests si se ejecuta directamente
if (require.main === module) {
  runAllTests();
}

module.exports = {
  makeRequest,
  runAllTests,
  testResults
};