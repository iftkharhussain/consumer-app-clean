/**
 * Import Quebec Postal Codes
 * Imports postal code data from B_Q_.txt file
 * For Quebec, Canada only
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const mongoose = require('mongoose');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const PostalCode = require('../src/schema/PostalCode');

const DATA_FILE = path.join(__dirname, '../data/postal/B_Q_.txt');

async function importPostalCodes() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/consumer_app');
    console.log('Connected to MongoDB');

    // Remove existing postal codes
    console.log('Removing existing postal codes...');
    const deleteResult = await PostalCode.deleteMany({});
    console.log(`Deleted ${deleteResult.deletedCount} existing postal codes`);

    // Prepare to read file line by line
    const fileStream = fs.createReadStream(DATA_FILE);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let lineNumber = 0;
    let imported = 0;
    let batch = [];
    const BATCH_SIZE = 1000;

    console.log('Importing postal codes from file...');

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

      if (fields.length >= 5) {
        const [city, fsa, lcr, gcnid, gcpcid] = fields;

        // Create postal code object
        const postalCodeData = {
          fsa: fsa.toUpperCase(),
          lcr: lcr.toUpperCase(),
          city: city.toUpperCase(),
          gcnid: gcnid,
          gcpcid: gcpcid,
          isSummary: lcr === '...',
          postalCode: lcr !== '...' ? `${fsa}${lcr}`.toUpperCase() : null
        };

        batch.push(postalCodeData);

        // Insert batch when it reaches BATCH_SIZE
        if (batch.length >= BATCH_SIZE) {
          await PostalCode.insertMany(batch, { ordered: false });
          imported += batch.length;
          console.log(`Imported ${imported} postal codes...`);
          batch = [];
        }
      }
    }

    // Insert remaining records
    if (batch.length > 0) {
      await PostalCode.insertMany(batch, { ordered: false });
      imported += batch.length;
    }

    console.log(`\n✅ Import completed successfully!`);
    console.log(`Total postal codes imported: ${imported}`);

    // Verify import
    const totalCount = await PostalCode.countDocuments();
    console.log(`Total postal codes in database: ${totalCount}`);

    // Show statistics by FSA prefix
    const stats = await PostalCode.aggregate([
      {
        $group: {
          _id: { $substr: ['$fsa', 0, 1] },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    console.log('\nPostal codes by province:');
    stats.forEach(stat => {
      const province = stat._id === 'G' || stat._id === 'H' || stat._id === 'J' ? 'Quebec' : 'Other';
      console.log(`  ${stat._id} (${province}): ${stat.count}`);
    });

  } catch (error) {
    console.error('Error importing postal codes:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

// Run import
importPostalCodes();
