// Deprecated: Please use DBManager and Repositories instead.
// This wrapper is kept for backward compatibility.

const dbManager = require('./DBManager');

async function getDb() {
  await dbManager.initialize();
  return dbManager.getAdapter();
}

module.exports = {
  getDb
};
