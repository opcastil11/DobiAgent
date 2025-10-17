const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Configuration
const DB_PATH = './chargers.db'; // Adjust if your database is in a different location
const NEW_OWNER_ADDRESS = '0x57e56B49dcF7540a991ac6B4C9597eBa892A7168'; // Replace with your desired owner address

// Function to update all owner addresses
function updateAllOwnerAddresses(newOwnerAddress) {
  return new Promise((resolve, reject) => {
    // Connect to database
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE, (err) => {
      if (err) {
        console.error('Error connecting to database:', err.message);
        reject(err);
        return;
      }
      console.log('Connected to SQLite database');
    });

    // First, show current chargers before update
    db.all("SELECT id_charger, owner_address, location FROM chargers", [], (err, rows) => {
      if (err) {
        console.error('Error reading chargers:', err.message);
        db.close();
        reject(err);
        return;
      }

      console.log('\n=== CURRENT CHARGERS ===');
      console.log('ID\t\t\tCurrent Owner\t\t\t\t\tLocation');
      console.log('─'.repeat(80));
      rows.forEach(row => {
        console.log(`${row.id_charger}\t${row.owner_address}\t${row.location || 'N/A'}`);
      });

      console.log(`\n=== UPDATING TO NEW OWNER: ${newOwnerAddress} ===`);

      // Update all owner addresses
      const updateQuery = "UPDATE chargers SET owner_address = ?";
      db.run(updateQuery, [newOwnerAddress], function(err) {
        if (err) {
          console.error('Error updating owner addresses:', err.message);
          db.close();
          reject(err);
          return;
        }

        const updatedCount = this.changes;
        console.log(`✅ Successfully updated ${updatedCount} charger(s)`);

        // Show updated chargers
        db.all("SELECT id_charger, owner_address, location FROM chargers", [], (err, updatedRows) => {
          if (err) {
            console.error('Error reading updated chargers:', err.message);
          } else {
            console.log('\n=== UPDATED CHARGERS ===');
            console.log('ID\t\t\tNew Owner\t\t\t\t\tLocation');
            console.log('─'.repeat(80));
            updatedRows.forEach(row => {
              console.log(`${row.id_charger}\t${row.owner_address}\t${row.location || 'N/A'}`);
            });
          }

          // Close database connection
          db.close((err) => {
            if (err) {
              console.error('Error closing database:', err.message);
              reject(err);
            } else {
              console.log('\n✅ Database connection closed');
              resolve(updatedCount);
            }
          });
        });
      });
    });
  });
}

// Function to update specific charger
function updateSpecificCharger(chargerId, newOwnerAddress) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE, (err) => {
      if (err) {
        console.error('Error connecting to database:', err.message);
        reject(err);
        return;
      }
    });

    // Check if charger exists
    db.get("SELECT * FROM chargers WHERE id_charger = ?", [chargerId], (err, row) => {
      if (err) {
        console.error('Error checking charger:', err.message);
        db.close();
        reject(err);
        return;
      }

      if (!row) {
        console.log(`❌ Charger ${chargerId} not found`);
        db.close();
        resolve(0);
        return;
      }

      console.log(`\n=== UPDATING CHARGER: ${chargerId} ===`);
      console.log(`Current owner: ${row.owner_address}`);
      console.log(`New owner: ${newOwnerAddress}`);

      // Update specific charger
      db.run("UPDATE chargers SET owner_address = ? WHERE id_charger = ?", 
        [newOwnerAddress, chargerId], 
        function(err) {
          if (err) {
            console.error('Error updating charger:', err.message);
            db.close();
            reject(err);
            return;
          }

          console.log(`✅ Successfully updated charger ${chargerId}`);
          
          db.close((err) => {
            if (err) {
              console.error('Error closing database:', err.message);
              reject(err);
            } else {
              resolve(1);
            }
          });
        }
      );
    });
  });
}

// Function to backup database before making changes
function backupDatabase() {
  const fs = require('fs');
  const backupPath = `./chargers_backup_${Date.now()}.db`;
  
  try {
    fs.copyFileSync(DB_PATH, backupPath);
    console.log(`✅ Database backed up to: ${backupPath}`);
    return backupPath;
  } catch (error) {
    console.error('❌ Error creating backup:', error.message);
    throw error;
  }
}

// Main execution function
async function main() {
  console.log('🔧 CHARGER OWNER ADDRESS UPDATE SCRIPT');
  console.log('═'.repeat(50));

  // Get command line arguments
  const args = process.argv.slice(2);
  
  // Parse arguments
  let targetCharger = null;
  let newAddress = NEW_OWNER_ADDRESS;
  let skipBackup = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--charger':
      case '-c':
        targetCharger = args[i + 1];
        i++; // Skip next argument as it's the value
        break;
      case '--address':
      case '-a':
        newAddress = args[i + 1];
        i++; // Skip next argument as it's the value
        break;
      case '--no-backup':
        skipBackup = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: node update_owner_addresses.js [options]

Options:
  --charger, -c <id>      Update specific charger only
  --address, -a <addr>    New owner address (default: ${NEW_OWNER_ADDRESS})
  --no-backup            Skip database backup
  --help, -h             Show this help message

Examples:
  node update_owner_addresses.js
  node update_owner_addresses.js --charger CHARGER_001
  node update_owner_addresses.js --address 0x1234567890123456789012345678901234567890
  node update_owner_addresses.js --charger CHARGER_001 --address 0x1234... --no-backup
        `);
        process.exit(0);
    }
  }

  try {
    // Validate address format (basic check)
    if (!newAddress || !newAddress.startsWith('0x') || newAddress.length !== 42) {
      throw new Error('Invalid Ethereum address format. Must be 42 characters starting with 0x');
    }

    // Create backup unless skipped
    if (!skipBackup) {
      backupDatabase();
    }

    // Update chargers
    let updatedCount = 0;
    if (targetCharger) {
      console.log(`\n🎯 Updating specific charger: ${targetCharger}`);
      updatedCount = await updateSpecificCharger(targetCharger, newAddress);
    } else {
      console.log('\n🌍 Updating all chargers');
      updatedCount = await updateAllOwnerAddresses(newAddress);
    }

    console.log('\n' + '═'.repeat(50));
    console.log(`🎉 Update completed! ${updatedCount} charger(s) updated.`);
    
    if (updatedCount > 0) {
      console.log(`\n📝 Summary:`);
      console.log(`   • New owner address: ${newAddress}`);
      console.log(`   • Chargers updated: ${updatedCount}`);
      console.log(`   • Backup created: ${!skipBackup ? 'Yes' : 'No'}`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Export functions for potential module use
module.exports = {
  updateAllOwnerAddresses,
  updateSpecificCharger,
  backupDatabase
};

// Run if called directly
if (require.main === module) {
  main();
}