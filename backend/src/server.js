const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { initDriver, getDriver, connectToDatabase, runInitCypher, closeDriver } = require('./db');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/', routes);

// Health check endpoint — pings Neo4j with a parameterized query
app.get('/health', async (req, res) => {
  const session = getDriver().session();
  try {
    const result = await session.run('RETURN $value AS status', { value: 1 });
    const status = result.records[0].get('status').toNumber();
    res.status(200).json({
      status: 'OK',
      neo4j: status === 1 ? 'connected' : 'error',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      neo4j: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  } finally {
    await session.close();
  }
});

// Startup sequence
async function startServer() {
  try {
    // 1. Initialize Neo4j driver
    initDriver();

    // 2. Verify connectivity
    await connectToDatabase();

    // 3. Run init.cypher constraints
    await runInitCypher();

    // 4. Start Express server
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await closeDriver();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await closeDriver();
  process.exit(0);
});

startServer();
