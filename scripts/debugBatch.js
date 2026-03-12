/**
 * Debug batch import to find duplicate issues
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mongoose = require('mongoose');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const Vehicle = require('../src/schema/Vehicle');

const DATA_FILE = path.join(__dirname, '../data/ppvicc/PPVDETL_bi.txt');

async function debugBatch() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/consumer_app');
    console.log('Connected to MongoDB');

    // Clear collection
    await Vehicle.deleteMany({});

    // Read last 700 lines (final batch area)
    const fileStream = fs.createReadStream(DATA_FILE);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let lineNumber = 0;
    const allLines = [];

    for await (const line of rl) {
      lineNumber++;
      if (lineNumber === 1) continue; // Skip header
      allLines.push({ lineNumber, line });
    }

    // Take last 700 lines
    const targetLines = allLines.slice(-700);
    console.log(`\nProcessing last 700 lines (${targetLines[0].lineNumber} to ${targetLines[targetLines.length-1].lineNumber})`);

    const batch = [];
    const keys = new Map();

    for (const {lineNumber, line} of targetLines) {
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
        if (keys.has(key)) {
          keys.set(key, keys.get(key) + 1);
          console.warn(`\n⚠️  DUPLICATE KEY FOUND IN BATCH!`);
          console.warn(`  Key: ${key}`);
          console.warn(`  First occurrence: line ${keys.get(key + '_line')}`);
          console.warn(`  Duplicate at: line ${lineNumber}`);
          console.warn(`  Vehicle: ${vehicleData.make} ${vehicleData.model}`);
        } else {
          keys.set(key, 1);
          keys.set(key + '_line', lineNumber);
        }

        batch.push(vehicleData);
      }
    }

    console.log(`\nParsed ${batch.length} vehicles from last 700 lines`);
    console.log(`Unique (modelYear|extVicc) combinations: ${keys.size / 2}`); // Divide by 2 because we store key and key_line

    // Check for 2027 vehicles in batch
    const vehicles2027 = batch.filter(v => v.modelYear === 2027);
    console.log(`\n2027 vehicles in batch: ${vehicles2027.length}`);
    if (vehicles2027.length > 0) {
      vehicles2027.forEach(v => {
        console.log(`  ${v.modelYear}|${v.extVicc} - ${v.make} ${v.model}`);
      });
    }

    // Try inserting
    console.log(`\nAttempting to insert ${batch.length} vehicles...`);
    try {
      const result = await Vehicle.collection.insertMany(batch, { ordered: false });
      console.log(`✅ Successfully inserted: ${result.insertedCount}`);
      console.log(`❌ Not inserted: ${batch.length - result.insertedCount}`);
    } catch (err) {
      if (err.writeErrors) {
        console.log(`\n⚠️  Got ${err.writeErrors.length} writeErrors`);
        console.log(`✅ Successfully inserted: ${err.result?.nInserted || 0}`);
        
        // Show first 20 errors
        err.writeErrors.slice(0, 20).forEach((e, idx) => {
          const doc = batch[e.index];
          console.warn(`\n${idx + 1}. [Index ${e.index}] Error code ${e.code}:`);
          console.warn(`   Vehicle: ${doc.modelYear}|${doc.extVicc} - ${doc.make} ${doc.model}`);
          console.warn(`   Message: ${e.errmsg.substring(0, 150)}`);
        });
      } else {
        console.error('Unexpected error:', err.message);
      }
    }

    // Check what's in DB
    const count2027 = await Vehicle.countDocuments({ modelYear: 2027 });
    console.log(`\n2027 vehicles in database: ${count2027}`);

    const totalInDb = await Vehicle.countDocuments();
    console.log(`Total vehicles in database: ${totalInDb}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

debugBatch();
