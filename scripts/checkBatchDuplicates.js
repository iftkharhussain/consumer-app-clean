/**
 * Check for duplicates in batches of 1000
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DATA_FILE = path.join(__dirname, '../data/ppvicc/PPVDETL_bi.txt');

async function checkBatchDuplicates() {
  const rl = readline.createInterface({
    input: fs.createReadStream(DATA_FILE),
    crlfDelay: Infinity
  });

  let lineNumber = 0;
  let batchNum = 0;
  const currentBatch = [];
  let totalDuplicatesFound = 0;

  for await (const line of rl) {
    lineNumber++;
    if (lineNumber === 1) continue; // Skip header

    const fields = line.split('|');
    if (fields.length >= 2) {
      const key = `${fields[0]}|${fields[1]}`; // modelYear|extVicc
      currentBatch.push({ lineNumber, key, make: fields[3], model: fields[5] });

      if (currentBatch.length >= 1000) {
        // Check for duplicates in this batch
        const keys = new Map();
        const duplicates = [];
        
        currentBatch.forEach((item, idx) => {
          if (keys.has(item.key)) {
            duplicates.push({ ...item, firstAt: keys.get(item.key) });
          } else {
            keys.set(item.key, item.lineNumber);
          }
        });

        if (duplicates.length > 0) {
          console.log(`\n⚠️  Batch ${batchNum}: found ${duplicates.length} duplicates`);
          duplicates.slice(0, 5).forEach(dup => {
            console.log(`  ${dup.key} - ${dup.make} ${dup.model}`);
            console.log(`    First at line ${dup.firstAt}, duplicate at line ${dup.lineNumber}`);
          });
          totalDuplicatesFound += duplicates.length;
        }

        batchNum++;
        currentBatch.length = 0;
      }
    }
  }

  // Check final batch
  if (currentBatch.length > 0) {
    const keys = new Map();
    const duplicates = [];
    
    currentBatch.forEach((item, idx) => {
      if (keys.has(item.key)) {
        duplicates.push({ ...item, firstAt: keys.get(item.key) });
      } else {
        keys.set(item.key, item.lineNumber);
      }
    });

    if (duplicates.length > 0) {
      console.log(`\n⚠️  Final batch ${batchNum}: found ${duplicates.length} duplicates`);
      duplicates.slice(0, 5).forEach(dup => {
        console.log(`  ${dup.key} - ${dup.make} ${dup.model}`);
        console.log(`    First at line ${dup.firstAt}, duplicate at line ${dup.lineNumber}`);
      });
      totalDuplicatesFound += duplicates.length;
    }
  }

  console.log(`\n========================================`);
  console.log(`Total batches processed: ${batchNum + 1}`);
  console.log(`Total duplicates within batches: ${totalDuplicatesFound}`);
  console.log(`========================================`);
}

checkBatchDuplicates();
