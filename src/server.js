require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);

const express = require('express');
const cron = require('node-cron');
const { connectDB, disconnectDB } = require('./config/database');
const { initializeBot } = require('./config/bot');
const webhookRoute = require('./routes/webhook');
const { expireOrders } = require('./services/orderService');
const { refreshRatesFromApi } = require('./services/rateService');

const app = express();
const PORT = process.env.PORT || 4040;

app.use(express.json());

async function startServer() {
  try {
    await connectDB();
    const bot = await initializeBot();

    app.use(webhookRoute);

    app.get('/', (req, res) => {
      res.json({ message: '✅ KetaBot API is running locally', status: 'active' });
    });

    app.get('/health', (req, res) => {
      res.json({ ok: true });
    });

    app.listen(PORT, () => {
      console.log(`🚀 Server running on  ${PORT}`);
    });

    // Rate refresh: runs every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      try {
        await refreshRatesFromApi();
      } catch (error) {
        console.error('Rate refresh cron error:', error.message);
      }
    });

    // Expiry sweep: runs every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      try {
        const expiredOrders = await expireOrders();
        if (expiredOrders.length > 0) {
          console.log(`⏰ Expired ${expiredOrders.length} orders`);
          
          // Notify users and admin about expired orders
          const { notifyUserOrderExpired, notifyAdminOrderExpired } = require('./services/notificationService');
          const { getBot } = require('./config/bot');
          const bot = getBot();
          const adminGroupId = process.env.ADMIN_GROUP_ID;
          
          for (const order of expiredOrders) {
            // Notify user
            if (order.clientTelegramId) {
              await notifyUserOrderExpired({ telegram: bot.telegram }, order.clientTelegramId, order.orderRef);
            }
            // Notify admin with resurrect button
            if (adminGroupId) {
              await notifyAdminOrderExpired({ telegram: bot.telegram }, order, adminGroupId);
            }
          }
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