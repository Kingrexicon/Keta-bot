require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });

const express = require('express');
const cron = require('node-cron');
const { connectDB, disconnectDB } = require('./config/database');
const { initializeBot } = require('./config/bot');
const webhookRoute = require('./routes/webhook');
const { expireOrders } = require('./services/orderService');

const app = express();
const PORT = process.env.PORT || 4040;

app.use(express.json());

async function startServer() {
  try {
    await connectDB();
    const bot = await initializeBot();

    app.use(webhookRoute);

    app.get('/', (req, res) => {
      res.json({ message: '✅ KetaBot API is running', status: 'active' });
    });

    app.get('/health', (req, res) => {
      res.json({ ok: true });
    });

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

    cron.schedule('*/5 * * * *', async () => {
      try {
        const expired = await expireOrders();
        if (expired > 0) {
          console.log(`⏰ Expired ${expired} orders`);
        }
      } catch (error) {
        console.error('Cron job error:', error.message);
      }
    });

    process.on('SIGINT', async () => {
      console.log('\n⛔ Shutting down...');
      await disconnectDB();
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ Server startup failed:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
