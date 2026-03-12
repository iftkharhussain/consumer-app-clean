/**
 * Import Vehicle Data
 * Imports vehicle specifications from PPVDETL_bi.txt file
 * For insurance rating purposes
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mongoose = require('mongoose');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const Vehicle = require('../src/schema/Vehicle');

const DATA_FILE = path.join(__dirname, '../data/ppvicc/PPVDETL_bi.txt');

async function importVehicles() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/consumer_app');
    console.log('Connected to MongoDB');

    // Remove existing vehicles
    console.log('Removing existing vehicles...');
    const deleteResult = await Vehicle.deleteMany({});
    console.log(`Deleted ${deleteResult.deletedCount} existing vehicles`);

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

    console.log('Importing vehicles from file...');

    for await (const line of rl) {
      lineNumber++;

      // Skip header
      if (lineNumber === 1) {
        continue;
      }

      // Split by pipe delimiter
      const fields = line.split('|');

      if (fields.length >= 29) {
        try {
          // Extract fields according to header
          const [
            modelYear, extVicc, viccCode, make, makeFr, model, modelFr,
            makeMod, makeModFr, wheelbase, weight, horsepower, price,
            airbags, abs, almAud, almCutoff, almSeckey, cylinder,
            fuelType, induction, hybrid, tracCtrl, stabCtrl,
            bodyStyle, bodyType, drivetrain, vehType, convertible
          ] = fields;

          // Create vehicle object
          const vehicleData = {
            modelYear: parseInt(modelYear) || 0,
            extVicc: parseInt(extVicc) || 0,
            viccCode: parseInt(viccCode) || 0,
            make: make.trim(),
            makeFr: makeFr.trim(),
            model: model.trim(),
            modelFr: modelFr.trim(),
            makeMod: makeMod.trim(),
            makeModFr: makeModFr.trim(),
            wheelbase: wheelbase.trim(),
            weight: weight.trim(),
            horsepower: horsepower.trim(),
            price: price.trim(),
            airbags: airbags.trim(),
            abs: abs.trim(),
            tractionControl: tracCtrl.trim(),
            stabilityControl: stabCtrl.trim(),
            alarmAudio: almAud.trim(),
            alarmCutoff: almCutoff.trim(),
            alarmSecKey: almSeckey.trim(),
            cylinder: parseInt(cylinder) || 0,
            fuelType: fuelType.trim(),
            induction: induction.trim(),
            hybrid: hybrid.trim(),
            bodyStyle: bodyStyle.trim(),
            bodyType: bodyType.trim(),
            drivetrain: parseInt(drivetrain) || 0,
            vehicleType: vehType.trim(),
            convertible: convertible.trim() === '1'
          };

          batch.push(vehicleData);

          // Insert batch when it reaches BATCH_SIZE
          if (batch.length >= BATCH_SIZE) {
            try {
              const result = await Vehicle.insertMany(batch, { ordered: false, rawResult: true });
              const insertedCount = result.insertedCount || result.length;
              imported += insertedCount;
              
              if (insertedCount !== batch.length) {
                const skippedCount = batch.length - insertedCount;
                console.warn(`⚠️  Batch ${Math.floor(imported/1000)}: attempted ${batch.length}, inserted ${insertedCount}, skipped ${skippedCount}`);
                
                // Log first few records in batch to help debug
                if (skippedCount > 0) {
                  const batchKeys = batch.slice(0, 3).map(v => `${v.modelYear}|${v.extVicc}|${v.make}`);
                  console.warn(`  First 3 in batch: ${batchKeys.join(', ')}`);
                }
              } else {
                console.log(`Imported ${imported} vehicles...`);
              }
            } catch (err) {
              // Mongoose wraps MongoDB BulkWriteError
              if (err.writeErrors || err.result) {
                const successCount = err.result ? err.result.nInserted : (batch.length - (err.writeErrors?.length || 0));
                const errorCount = err.writeErrors?.length || 0;
                console.warn(`\n⚠️  Batch ${Math.floor(imported/1000)} had ${errorCount} write errors out of ${batch.length} attempts (${successCount} succeeded)`);
                imported += successCount;
                
                // Log details of first few errors  
                if (err.writeErrors) {
                  err.writeErrors.slice(0, 5).forEach(e => {
                    const doc = batch[e.index];
                    const errCode = e.code || e.err?.code;
                    const errMsg = e.errmsg || e.err?.errmsg || '';
                    console.warn(`  [${e.index}] Error ${errCode}: ${doc.modelYear}|${doc.extVicc}|${doc.make} ${doc.model}`);
                    if (errMsg.includes('duplicate')) {
                      console.warn(`    Duplicate key error`);
                    }
                  });
                  if (err.writeErrors.length > 5) {
                    console.warn(`  ... and ${err.writeErrors.length - 5} more errors`);
                  }
                }
              } else {
                console.error(`Batch error:`, err.message);
                throw err;
              }
            }
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
      console.log(`\nProcessing final batch of ${batch.length} vehicles...`);
      console.log(`First 3 in batch: ${batch.slice(0, 3).map(v => `${v.modelYear}|${v.extVicc}|${v.make} ${v.model}`).join(', ')}`);
      console.log( `Last 3 in batch: ${batch.slice(-3).map(v => `${v.modelYear}|${v.extVicc}|${v.make} ${v.model}`).join(', ')}`);
      
      // Check for internal duplicates in batch
      const combinations = new Map();
      batch.forEach((v, idx) => {
        const key = `${v.modelYear}|${v.extVicc}`;
        if (combinations.has(key)) {
          combinations.get(key).push(idx);
        } else {
          combinations.set(key, [idx]);
        }
      });
      
      const internalDupes = Array.from(combinations.entries()).filter(([_, indexes]) => indexes.length > 1);
      if (internalDupes.length > 0) {
        console.warn(`\n⚠️  Found ${internalDupes.length} duplicate (modelYear|extVicc) combinations within the batch:`);
        internalDupes.slice(0, 10).forEach(([key, indexes]) => {
          const v = batch[indexes[0]];
          console.warn(`  ${key} - ${v.make} ${v.model} appears ${indexes.length} times at indexes: ${indexes.join(', ')}`);
        });
      }
      
      try {
        const result = await Vehicle.insertMany(batch, { ordered: false, rawResult: true });
        const insertedCount = result.insertedCount || result.length;
        imported += insertedCount;
        console.log(`Imported final batch: ${insertedCount} out of ${batch.length} (${batch.length - insertedCount} not inserted)`);
      } catch (err) {
        if (err.writeErrors || err.result) {
          const successCount = err.result ? err.result.nInserted : (batch.length - (err.writeErrors?.length || 0));
          const errorCount = err.writeErrors?.length || 0;
          console.warn(`\n⚠️  Final batch had ${errorCount} write errors out of ${batch.length} attempts (${successCount} succeeded)`);
          imported += successCount;
          
          // Log details of first 10 errors from final batch
          if (err.writeErrors) {
            err.writeErrors.slice(0, 10).forEach(e => {
              const doc = batch[e.index];
              const errCode = e.code || e.err?.code;
              const errMsg = e.errmsg || e.err?.errmsg || '';
              console.warn(`  [${e.index}] Error ${errCode}: ${doc.modelYear}|${doc.extVicc}|${doc.make} ${doc.model}`);
              if (errMsg) {
                console.warn(`    ${errMsg.substring(0, 150)}`);
              }
            });
            if (err.writeErrors.length > 10) {
              console.warn(`  ... and ${err.writeErrors.length - 10} more errors`);
            }
          }
        } else {
          throw err;
        }
      }
    }

    console.log(`\n✅ Import completed successfully!`);
    console.log(`Total vehicles imported: ${imported}`);
    console.log(`Total lines skipped: ${skipped}`);

    // Verify import
    const totalCount = await Vehicle.countDocuments();
    console.log(`Total vehicles in database: ${totalCount}`);

    // Show statistics
    const stats = await Vehicle.aggregate([
      {
        $group: {
          _id: null,
          minYear: { $min: '$modelYear' },
          maxYear: { $max: '$modelYear' },
          uniqueMakes: { $addToSet: '$make' }
        }
      }
    ]);

    if (stats.length > 0) {
      console.log(`\nVehicle statistics:`);
      console.log(`  Year range: ${stats[0].minYear} - ${stats[0].maxYear}`);
      console.log(`  Unique makes: ${stats[0].uniqueMakes.length}`);
    }

    // Top 10 makes
    const topMakes = await Vehicle.aggregate([
      { $group: { _id: '$make', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    console.log(`\nTop 10 makes:`);
    topMakes.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item._id}: ${item.count} models`);
    });

  } catch (error) {
    console.error('Error importing vehicles:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

// Run import
importVehicles();
