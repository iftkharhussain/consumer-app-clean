/**
 * Import All Data
 * Master script to import all data files in the correct order
 * 1. Postal Codes (Quebec only)
 * 2. Vehicles
 * 3. VIN Lookups (depends on vehicles)
 */

const { execSync } = require('child_process');
const path = require('path');

const scripts = [
  { name: 'Postal Codes', file: 'importPostalCodes.js' },
  { name: 'Vehicles', file: 'importVehicles.js' },
  { name: 'VIN Lookups', file: 'importVinLookups.js' }
];

async function importAll() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  Consumer App Data Import - Quebec, Canada            ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  const startTime = Date.now();
  
  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i];
    console.log(`\n${'='.repeat(60)}`);
    console.log(`[${i + 1}/${scripts.length}] Importing ${script.name}...`);
    console.log('='.repeat(60));

    try {
      const scriptPath = path.join(__dirname, script.file);
      execSync(`node "${scriptPath}"`, {
        stdio: 'inherit',
        cwd: __dirname
      });
      console.log(`✅ ${script.name} imported successfully\n`);
    } catch (error) {
      console.error(`❌ Failed to import ${script.name}`);
      console.error(error.message);
      process.exit(1);
    }
  }

  const endTime = Date.now();
  const duration = ((endTime - startTime) / 1000).toFixed(2);

  console.log('\n' + '='.repeat(60));
  console.log('✅ All data imported successfully!');
  console.log(`⏱️  Total time: ${duration} seconds`);
  console.log('='.repeat(60));
}

// Run all imports
importAll().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
