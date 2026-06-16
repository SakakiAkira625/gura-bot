const { scanAndSave } = require('./src/services/modelScanner');

async function main() {
  console.log("Starting manual model scan...");
  await scanAndSave();
  console.log("Scan finished!");
  process.exit(0);
}

main();
