/**
 * Check for duplicate (modelYear, extVicc) combinations in source file
 */

const fs = require('fs');
const readline = require('readline');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/ppvicc/PPVDETL_bi.txt');

async function checkDuplicates() {
  const rl = readline.createInterface({
    input: fs.createReadStream(DATA_FILE),
    crlfDelay: Infinity
  });

  let lineNum = 0;
  const combinations = new Map();

  for await (const line of rl) {
    lineNum++;
    if (lineNum === 1) continue; // Skip header

    const fields = line.split('|');
    if (fields.length >= 2) {
      const key = `${fields[0]}|${fields[1]}`;
      if (combinations.has(key)) {
        combinations.set(key, combinations.get(key) + 1);
      } else {
        combinations.set(key, 1);
      }
    }
  }

  const duplicates = Array.from(combinations.entries()).filter(([_, count]) => count > 1);
  console.log(`Total (modelYear|extVicc) combinations: ${combinations.size}`);
  console.log(`Duplicate combinations: ${duplicates.length}`);
  console.log(`Total duplicate records: ${duplicates.reduce((sum, [_, count]) => sum + count, 0)}`);
  console.log(`Unique duplicate records (should not be inserted): ${duplicates.reduce((sum, [_, count]) => sum + (count - 1), 0)}`);

  if (duplicates.length > 0) {
    console.log(`\nFirst 20 duplicate combinations:`);
    duplicates.slice(0, 20).forEach(([key, count]) => {
      console.log(`  ${key}: appears ${count} times`);
    });
  }
}

checkDuplicates();
