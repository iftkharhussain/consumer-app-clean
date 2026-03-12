/**
 * Test mixed batch with both new and duplicate records
 */

const mongoose = require('mongoose');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const Vehicle = require('../src/schema/Vehicle');

async function testMixedBatch() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected\n');

    await Vehicle.deleteMany({});

    // Insert initial records
    const initial = [
      { modelYear: 2025, extVicc: 100001, viccCode: 1000, make: 'TEST', makeFr: 'TEST', model: 'Existing 1', modelFr: 'Existing 1', makeMod: 'TEST Existing 1', makeModFr: 'TEST Existing 1', wheelbase: '', weight: '', horsepower: '', price: '', airbags: '', abs: '', tractionControl: '', stabilityControl: '', alarmAudio: '', alarmCutoff: '', alarmSecKey: '', cylinder: 4, fuelType: 'G', induction: '', hybrid: '', bodyStyle: '4D', bodyType: 'P4', drivetrain: 1, vehicleType: 'PP', convertible: false },
      { modelYear: 2025, extVicc: 100002, viccCode: 1000, make: 'TEST', makeFr: 'TEST', model: 'Existing 2', modelFr: 'Existing 2', makeMod: 'TEST Existing 2', makeModFr: 'TEST Existing 2', wheelbase: '', weight: '', horsepower: '', price: '', airbags: '', abs: '', tractionControl: '', stabilityControl: '', alarmAudio: '', alarmCutoff: '', alarmSecKey: '', cylinder: 4, fuelType: 'G', induction: '', hybrid: '', bodyStyle: '4D', bodyType: 'P4', drivetrain: 1, vehicleType: 'PP', convertible: false },
    ];

    await Vehicle.insertMany(initial);
    console.log(`Inserted ${initial.length} initial records\n`);

    // Now try inserting a mixed batch: 2 duplicates + 2 new
    const mixedBatch = [
      { modelYear: 2025, extVicc: 100001, viccCode: 1000, make: 'TEST', makeFr: 'TEST', model: 'Duplicate 1', modelFr: 'Duplicate 1', makeMod: 'TEST Duplicate 1', makeModFr: 'TEST Duplicate 1', wheelbase: '', weight: '', horsepower: '', price: '', airbags: '', abs: '', tractionControl: '', stabilityControl: '', alarmAudio: '', alarmCutoff: '', alarmSecKey: '', cylinder: 4, fuelType: 'G', induction: '', hybrid: '', bodyStyle: '4D', bodyType: 'P4', drivetrain: 1, vehicleType: 'PP', convertible: false }, // Duplicate
      { modelYear: 2025, extVicc: 100003, viccCode: 1000, make: 'TEST', makeFr: 'TEST', model: 'New 1', modelFr: 'New 1', makeMod: 'TEST New 1', makeModFr: 'TEST New 1', wheelbase: '', weight: '', horsepower: '', price: '', airbags: '', abs: '', tractionControl: '', stabilityControl: '', alarmAudio: '', alarmCutoff: '', alarmSecKey: '', cylinder: 4, fuelType: 'G', induction: '', hybrid: '', bodyStyle: '4D', bodyType: 'P4', drivetrain: 1, vehicleType: 'PP', convertible: false }, // New
      { modelYear: 2025, extVicc: 100002, viccCode: 1000, make: 'TEST', makeFr: 'TEST', model: 'Duplicate 2', modelFr: 'Duplicate 2', makeMod: 'TEST Duplicate 2', makeModFr: 'TEST Duplicate 2', wheelbase: '', weight: '', horsepower: '', price: '', airbags: '', abs: '', tractionControl: '', stabilityControl: '', alarmAudio: '', alarmCutoff: '', alarmSecKey: '', cylinder: 4, fuelType: 'G', induction: '', hybrid: '', bodyStyle: '4D', bodyType: 'P4', drivetrain: 1, vehicleType: 'PP', convertible: false }, // Duplicate
      { modelYear: 2025, extVicc: 100004, viccCode: 1000, make: 'TEST', makeFr: 'TEST', model: 'New 2', modelFr: 'New 2', makeMod: 'TEST New 2', makeModFr: 'TEST New 2', wheelbase: '', weight: '', horsepower: '', price: '', airbags: '', abs: '', tractionControl: '', stabilityControl: '', alarmAudio: '', alarmCutoff: '', alarmSecKey: '', cylinder: 4, fuelType: 'G', induction: '', hybrid: '', bodyStyle: '4D', bodyType: 'P4', drivetrain: 1, vehicleType: 'PP', convertible: false }, // New
    ];

    console.log(`Attempting mixed batch: ${mixedBatch.length} records (2 duplicates, 2 new)`);
    
    try {
      const result = await Vehicle.insertMany(mixedBatch, { ordered: false, rawResult: true });
      console.log(`✅ No error thrown!`);
      console.log(`   insertedCount: ${result.insertedCount} (expected: 2)`);
      console.log(`   Total in DB: ${await Vehicle.countDocuments()} (expected: 4)\n`);
    } catch (err) {
      console.log(`⚠️  Error thrown: ${err.name}`);
      console.log(`   writeErrors: ${err.writeErrors?.length || 0}`);
      console.log(`   result.nInserted: ${err.result?.nInserted || 0}`);
      console.log(`   Total in DB: ${await Vehicle.countDocuments()}\n`);
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

testMixedBatch();
