const neo4j = require('neo4j-driver');
const fs = require('fs');
const path = require('path');

let driver;

/**
 * Initialize the Neo4j driver using environment variables.
 */
function initDriver() {
  const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  const user = process.env.NEO4J_USER || 'neo4j';
  const password = process.env.NEO4J_PASSWORD || 'password123';

  driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  console.log(`📦 Neo4j driver initialized for ${uri}`);
}

/**
 * Get the Neo4j driver instance.
 * @returns {neo4j.Driver}
 */
function getDriver() {
  if (!driver) {
    throw new Error('Neo4j driver not initialized. Call initDriver() first.');
  }
  return driver;
}

/**
 * Verify connectivity to the Neo4j database.
 */
async function connectToDatabase() {
  const d = getDriver();
  await d.verifyConnectivity();
  console.log('✅ Connected to Neo4j successfully');
}

/**
 * Read init.cypher and execute each statement to create constraints.
 * Statements are split by semicolons. Lines starting with // are comments.
 */
async function runInitCypher() {
  // Docker mount path first, then fallback to relative path for local dev
  const dockerPath = '/init.cypher';
  const localPath = path.join(__dirname, '..', '..', 'init.cypher');
  const cypherPath = fs.existsSync(dockerPath) ? dockerPath : localPath;

  if (!fs.existsSync(cypherPath)) {
    console.log('⚠️  init.cypher not found, skipping database initialization');
    return;
  }

  const raw = fs.readFileSync(cypherPath, 'utf-8');

  // Filter out comment lines and split by semicolons
  const statements = raw
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && line.trim() !== '')
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const session = getDriver().session();
  try {
    for (const statement of statements) {
      console.log(`⏳ Running: ${statement}`);
      await session.run(statement);
      console.log(`✅ Done`);
    }
    console.log('🎉 All init.cypher constraints applied successfully');
  } finally {
    await session.close();
  }
}

/**
 * Close the Neo4j driver connection.
 */
async function closeDriver() {
  if (driver) {
    await driver.close();
    console.log('🔌 Neo4j driver closed');
  }
}

module.exports = {
  initDriver,
  getDriver,
  connectToDatabase,
  runInitCypher,
  closeDriver,
};
