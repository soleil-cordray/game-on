// load .env vars & import MongoDB client lib
require('dotenv').config();
const { MongoClient } = require('mongodb');

// create client via connection str stored in MONGODB_URI
const client = new MongoClient(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 8000
});

// connect to admin db & ping (connectivity test)
client.db('admin').command({ ping: 1 })
  .then(() => {
    console.log('ping ok');
    return client.close();
  })
  .catch((e) => {
    console.error(e.name + ': ' + e.message);
    process.exit(1);
  });
