const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const app = require('./app');
const { runMigrations } = require('./db/migrate');
const db = require('./db/connection');

const PORT = process.env.PORT || 3001;

// Run migrations on startup
runMigrations();

const server = app.listen(PORT, () => {
  console.log(`SplitSmart server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  db.close();
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  db.close();
  server.close(() => {
    process.exit(0);
  });
});
