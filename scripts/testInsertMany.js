/**
 * Test Mongoose insertMany behavior with rawResult
 */

const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const Vehicle = require('../src/schema/Vehicle');

async function testInsert() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected\n');

    await Vehicle.deleteMany({});

    // Create test batch
    const batch = [
      { modelYear: 2025, extVicc: 100001, viccCode: 1000, make: 'TEST', makeFr: 'TEST', model: 'Test 1', modelFr: 'Test 1', makeMod: 'TEST Test 1', makeModFr: 'TEST Test 1', wheelbase: '', weight: '', horsepower: '', price: '', airbags: '', abs: '', tractionControl: '', stabilityControl: '', alarmAudio: '', alarmCutoff: '', alarmSecKey: '', cylinder: 4, fuelType: 'G', induction: '', hybrid: '', bodyStyle: '4D', bodyType: 'P4', drivetrain: 1, vehicleType: 'PP', convertible: false },
      { modelYear: 2025, extVicc: 100002, viccCode: 1000, make: 'TEST', makeFr: 'TEST', model: 'Test 2', modelFr: 'Test 2', makeMod: 'TEST Test 2', makeModFr: 'TEST Test 2', wheelbase: '', weight: '', horsepower: '', price: '', airbags: '', abs: '', tractionControl: '', stabilityControl: '', alarmAudio: '', alarmCutoff: '', alarmSecKey: '', cylinder: 4, fuelType: 'G', induction: '', hybrid: '', bodyStyle: '4D', bodyType: 'P4', drivetrain: 1, vehicleType: 'PP', convertible: false },
      { modelYear: 2025, extVicc: 100003, viccCode: 1000, make: 'TEST', makeFr: 'TEST', model: 'Test 3', modelFr: 'Test 3', makeMod: 'TEST Test 3', makeModFr: 'TEST Test 3', wheelbase: '', weight: '', horsepower: '', price: '', airbags: '', abs: '', tractionControl: '', stabilityControl: '', alarmAudio: '', alarmCutoff: '', alarmSecKey: '', cylinder: 4, fuelType: 'G', induction: '', hybrid: '', bodyStyle: '4D', bodyType: 'P4', drivetrain: 1, vehicleType: 'PP', convertible: false },
    ];

    console.log('Test 1: insertMany with ordered: false');
    console.log(`Attempting to insert ${batch.length} unique vehicles`);
    const result1 = await Vehicle.insertMany(batch, { ordered: false });
    console.log(`Result is array: ${Array.isArray(result1)}`);
    console.log(`Result.length: ${result1.length}`);
    console.log(`DB count: ${await Vehicle.countDocuments()}\n`);

    console.log('Test 2: insertMany with rawResult: true');
    await Vehicle.deleteMany({});
    const result2 = await Vehicle.insertMany(batch, { ordered: false, rawResult: true });
    console.log(`Result type: ${typeof result2}`);
    console.log(`Result.insertedCount: ${result2.insertedCount}`);
    console.log(`Result keys: ${Object.keys(result2).join(', ')}`);
    console.log(`DB count: ${await Vehicle.countDocuments()}\n`);

    console.log('Test 3: Try inserting same batch again (should have duplicates)');
    try {
      const result3 = await Vehicle.insertMany(batch, { ordered: false, rawResult: true });
      console.log(`Result.insertedCount: ${result3.insertedCount} (expected 0)`);
      console.log(`DB count: ${await Vehicle.countDocuments()}\n`);
    } catch (err) {
      console.log(`Caught error: ${err.name}`);
      console.log(`writeErrors: ${err.writeErrors?.length || 0}`);
      console.log(`Result?.nInserted: ${err.result?.nInserted || 0}`);
      console.log(`DB count: ${await Vehicle.countDocuments()}\n`);
    }

    console.log('Test 4: Using collection.insertMany directly');
    await Vehicle.deleteMany({});
    try {
      const result4 = await Vehicle.collection.insertMany(batch, { ordered: false });
      console.log(`insertedCount: ${result4.insertedCount}`);
      console.log(`DB count: ${await Vehicle.countDocuments()}\n`);
    } catch (err) {
      console.log(`Error: ${err.message}`);
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

testInsert();
