// MongoDB connection (Mongoose)
// Used by independent Fault Case feature (fault-cases).

const mongoose = require('mongoose');

const processKey = `mongo_${process.pid}`;

function getMongoUri() {
  return (
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    'mongodb://127.0.0.1:27017/logtool'
  );
}

async function connectMongo() {
  if (global[processKey]?.connection) return global[processKey].connection;

  const uri = getMongoUri();
  const options = {
    // keep defaults; allow overriding via env if needed later
    autoIndex: process.env.MONGODB_AUTO_INDEX === 'true',
    serverSelectionTimeoutMS: Number.parseInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || '5000', 10)
  };

  try {
    const conn = await mongoose.connect(uri, options);
    global[processKey] = { connection: conn };
    return conn;
  } catch (err) {
    // do not throw hard here to avoid taking down unrelated modules
    // fault-case routes will fail fast if Mongo isn't connected
    console.error('[MongoDB] connection failed:', err.message);
    global[processKey] = { connection: null, error: err };
    return null;
  }
}

function isMongoConnected() {
  return mongoose.connection?.readyState === 1;
}

async function disconnectMongo() {
  try {
    if (mongoose.connection?.readyState) {
      await mongoose.connection.close();
    }
  } catch (err) {
    console.warn('[MongoDB] disconnect failed:', err.message);
  }
}

module.exports = {
  connectMongo,
  isMongoConnected,
  disconnectMongo
};


