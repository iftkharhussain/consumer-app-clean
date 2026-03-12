/**
 * Import with detailed duplicate tracking 
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const Vehicle = require('../src/schema/Vehicle');
const DATA_FILE = path.join(__dirname, '../data/ppvicc/PPVDETL_bi.txt');

async function importWithTracking() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected\n');

    await Vehicle.deleteMany({});
    console.log('Cleared collection\n');

    const fileStream = fs.createReadStream(DATA_FILE);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let lineNumber = 0;
    let batch = [];
    let imported = 0;
    const BATCH_SIZE = 1000;
    
    // Track all keys we've attempted to insert
    const attemptedKeys = new Map(); // key -> { lineNumber, make, model }

    for await (const line of rl) {
      lineNumber++;
      if (lineNumber === 1) continue;

      const fields = line.split('|');
      if (fields.length >= 29) {
        const [
          modelYear, extVicc, viccCode, make, makeFr, model, modelFr,
          makeMod, makeModFr, wheelbase, weight, horsepower, price,
          airbags, abs, almAud, almCutoff, almSeckey, cylinder,
          fuelType, induction, hybrid, tracCtrl, stabCtrl,
          bodyStyle, bodyType, drivetrain, vehType, convertible
        ] = fields;

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

        const key = `${vehicleData.modelYear}|${vehicleData.extVicc}`;
        
        // Track duplicate within current processing
        if (attemptedKeys.has(key)) {
          const first = attemptedKeys.get(key);
          console.log(`\n⚠️  DUPLICATE KEY DETECTED IN IMPORT!`);
          console.log(`   Key: ${key}`);
          console.log(`   First: line ${first.lineNumber} - ${first.make} ${first.model}`);
          console.log(`   Duplicate: line ${lineNumber} - ${vehicleData.make} ${vehicleData.model}`);
        } else {
          attemptedKeys.set(key, { lineNumber, make: vehicleData.make, model: vehicleData.model });
        }

        batch.push(vehicleData);

        if (batch.length >= BATCH_SIZE) {
          try {
            const result = await Vehicle.insertMany(batch, { ordered: false, rawResult: true });
            imported += result.insertedCount;
            if (result.insertedCount !== batch.length) {
              console.log(`Batch: attempted ${batch.length}, inserted ${result.insertedCount}, skipped ${batch.length - result.insertedCount}`);
            }
          } catch (err) {
            if (err.writeErrors) {
              const successCount = err.result?.nInserted || 0;
              imported += successCount;
              console.log(`\nBatch errors: ${err.writeErrors.length}, successful: ${successCount}`);
              err.writeErrors.slice(0, 3).forEach(e => {
                const doc = batch[e.index];
                console.log(`  ${doc.modelYear}|${doc.extVicc} - ${doc.make} ${doc.model}`);
              });
            }
          }
          batch = [];
        }
      }
    }

    // Final batch
    if (batch.length > 0) {
      console.log(`\n=== Final Batch ===`);
      console.log(`Batch size: ${batch.length}`);
      
      // Check for 2027 vehicles
      const vehicles2027 = batch.filter(v => v.modelYear === 2027);
      console.log(`2027 vehicles in final batch: ${vehicles2027.length}`);
      
      try {
        const result = await Vehicle.insertMany(batch, { ordered: false, rawResult: true });
        imported += result.insertedCount;
        console.log(`Inserted: ${result.insertedCount} out of ${batch.length}`);
      } catch (err) {
        if (err.writeErrors) {
          const successCount = err.result?.nInserted || 0;
          imported += successCount;
          console.log(`Errors: ${err.writeErrors.length}, successful: ${successCount}`);
        }
      }
    }

    console.log(`\n✅ Total imported: ${imported}`);
    console.log(`✅ Total in DB: ${await Vehicle.countDocuments()}`);
    console.log(`✅ 2027 vehicles in DB: ${await Vehicle.countDocuments({ modelYear: 2027 })}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

importWithTracking();
