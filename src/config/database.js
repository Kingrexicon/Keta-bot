const mongoose = require('mongoose');

async function connectDB() {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) {
      throw new Error('MONGO_URI environment variable is not set');
    }
    
    // Ensure URI has a database name (append /ketabot if missing)
    let mongoUri = uri;
    if (!uri.includes('/?') && !uri.match(/\/[^/]+\?/)) {
      // No database name in URI, add one
      const baseUri = uri.replace(/\/\?/, '/ketabot?');
      if (baseUri === uri) {
        // URI doesn't have a trailing slash before params
        const queryIndex = uri.indexOf('?');
        if (queryIndex > 0 && uri.lastIndexOf('/') < queryIndex) {
          mongoUri = uri.substring(0, queryIndex) + '/ketabot?' + uri.substring(queryIndex + 1);
        } else {
          mongoUri = uri + '/ketabot';
        }
      } else {
        mongoUri = baseUri;
      }
    }
    
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    throw error; // Let the caller handle it gracefully
  }
}

async function disconnectDB() {
  try {
    await mongoose.disconnect();
    console.log('✅ MongoDB disconnected');
  } catch (error) {
    console.error('❌ MongoDB disconnection failed:', error.message);
  }
}

module.exports = {
  connectDB,
  disconnectDB
};
