/**
 * Import VIN Lookup Data
 * Imports VIN to vehicle mappings from PPVVIN.txt file
 * For quick VIN-based vehicle lookups
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mongoose = require('mongoose');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const VinLookup = require('../src/schema/VinLookup');
const Vehicle = require('../src/schema/Vehicle');

const DATA_FILE = path.join(__dirname, '../data/ppvin/PPVVIN.txt');

async function importVinLookups() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/consumer_app');
    console.log('Connected to MongoDB');

    // Remove existing VIN lookups
    console.log('Removing existing VIN lookups...');
    const deleteResult = await VinLookup.deleteMany({});
    console.log(`Deleted ${deleteResult.deletedCount} existing VIN lookups`);

    // Prepare to read file line by line
    const fileStream = fs.createReadStream(DATA_FILE);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let lineNumber = 0;
    let imported = 0;
    let skipped = 0;
    let batch = [];
    const BATCH_SIZE = 1000;
    const vehicleCache = new Map(); // Cache vehicle lookups

    console.log('Importing VIN lookups from file...');

    for await (const line of rl) {
      lineNumber++;

      // Skip header
      if (lineNumber === 1) {
        continue;
      }

      // Parse CSV line (handle both quoted and unquoted fields)
      const parseCSVLine = (line) => {
        const fields = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            fields.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        fields.push(current.trim());
        return fields;
      };

      const fields = parseCSVLine(line);

      if (fields.length >= 6) {
        try {
          const [recNo, vin, viccCode, extVicc, modelYear, multVin] = fields;

          const modelYearInt = parseInt(modelYear) || 0;
          const extViccStr = extVicc.trim();
          const viccCodeStr = viccCode.trim();

          // Create cache key for vehicle lookup
          const cacheKey = `${modelYearInt}-${extViccStr}`;

          // Get vehicle details (use cache to avoid repeated DB queries)
          let vehicleDetails = vehicleCache.get(cacheKey);
          
          if (!vehicleDetails) {
            const vehicle = await Vehicle.findOne({
              modelYear: modelYearInt,
              extVicc: extViccStr
            }).lean();

            if (vehicle) {
              vehicleDetails = {
                make: vehicle.make,
                makeFr: vehicle.makeFr,
                model: vehicle.model,
                modelFr: vehicle.modelFr,
                bodyStyle: vehicle.bodyStyle,
                bodyType: vehicle.bodyType,
                fuelType: vehicle.fuelType,
                cylinder: vehicle.cylinder,
                drivetrain: vehicle.drivetrain,
                vehicleType: vehicle.vehicleType
              };
              vehicleCache.set(cacheKey, vehicleDetails);
            }
          }

          // Create VIN lookup object
          const vinLookupData = {
            vin: vin.toUpperCase(),
            modelYear: modelYearInt,
            extVicc: extViccStr,
            viccCode: viccCodeStr,
            vehicleDetails: vehicleDetails || {},
            recNo: parseInt(recNo) || 0,
            multVin: parseInt(multVin) || 0
          };

          batch.push(vinLookupData);

          // Insert batch when it reaches BATCH_SIZE
          if (batch.length >= BATCH_SIZE) {
            await VinLookup.insertMany(batch, { ordered: false });
            imported += batch.length;
            console.log(`Imported ${imported} VIN lookups... (cache size: ${vehicleCache.size})`);
            batch = [];
          }
        } catch (err) {
          skipped++;
          if (skipped <= 10) {
            console.warn(`Skipping line ${lineNumber}: ${err.message}`);
          }
        }
      }
    }

    // Insert remaining records
    if (batch.length > 0) {
      await VinLookup.insertMany(batch, { ordered: false });
      imported += batch.length;
    }

    console.log(`\n✅ Import completed successfully!`);
    console.log(`Total VIN lookups imported: ${imported}`);
    console.log(`Total lines skipped: ${skipped}`);
    console.log(`Vehicle cache size: ${vehicleCache.size}`);

    // Verify import
    const totalCount = await VinLookup.countDocuments();
    console.log(`Total VIN lookups in database: ${totalCount}`);

    // Show statistics
    const stats = await VinLookup.aggregate([
      {
        $group: {
          _id: null,
          minYear: { $min: '$modelYear' },
          maxYear: { $max: '$modelYear' },
          withDetails: { 
            $sum: { 
              $cond: [{ $gt: ['$vehicleDetails.make', null] }, 1, 0] 
            } 
          }
        }
      }
    ]);

    if (stats.length > 0) {
      console.log(`\nVIN lookup statistics:`);
      console.log(`  Year range: ${stats[0].minYear} - ${stats[0].maxYear}`);
      console.log(`  With vehicle details: ${stats[0].withDetails}`);
      console.log(`  Without vehicle details: ${totalCount - stats[0].withDetails}`);
    }

  } catch (error) {
    console.error('Error importing VIN lookups:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

// Run import
importVinLookups();
