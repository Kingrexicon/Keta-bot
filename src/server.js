require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });
const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);

const express = require('express');
const cron = require('node-cron');
const { connectDB, disconnectDB } = require('./config/database');
const { initializeBot, getBot } = require('./config/bot');
const webhookRoute = require('./routes/webhook');
const { expireOrders } = require('./services/orderService');
const { refreshRatesFromApi } = require('./services/rateService');
const { runDailyJob } = require('./services/backupService');

const app = express();
const PORT = process.env.PORT || 4040;
const HOST = '0.0.0.0';

// Track server state
let serverReady = false;
let serverStartTime = null;

// Handle raw body for Telegram webhook (Express v5 body parsing fix)
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));

// Health check — always responds, even before DB/bot are ready
app.get('/', (req, res) => {
  res.json({
    message: '✅ KetaBot API is running',
    status: 'active',
    serverReady,
    uptime: serverStartTime ? Math.floor((Date.now() - serverStartTime) / 1000) + 's' : 'just started',
    services: {
      database: global.__dbConnected || false,
      bot: global.__botReady || false
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/debug', (req, res) => {
  const bot = getBot();
  res.json({
    hasBot: !!bot,
    hasToken: !!process.env.BOT_TOKEN,
    tokenPrefix: process.env.BOT_TOKEN ? process.env.BOT_TOKEN.substring(0, 10) + '...' : 'missing',
    webhookUrl: process.env.WEBHOOK_URL,
    nodeEnv: process.env.NODE_ENV,
    usePolling: process.env.USE_POLLING || 'not set',
    mongoConfigured: !!process.env.MONGO_URI,
    mongoUriPrefix: process.env.MONGO_URI ? process.env.MONGO_URI.substring(0, 30) + '...' : 'missing',
    serverReady,
    dbConnected: global.__dbConnected,
    botReady: global.__botReady
  });
});

// Start the HTTP server FIRST so Render detects the port immediately
const server = app.listen(PORT, HOST, () => {
  const addr = server.address();
  const bind = typeof addr === 'string' ? `pipe ${addr}` : `${addr.address}:${addr.port}`;
  console.log(`🚀 Server listening on ${bind}`);
  serverReady = true;
  serverStartTime = Date.now();
});

// Then initialize DB and bot asynchronously
(async function initServices() {
  try {
    console.log('⏳ Connecting to MongoDB...');
    await connectDB();
    global.__dbConnected = true;
    console.log('✅ MongoDB connected');

    console.log('⏳ Initializing Telegram bot...');
    const bot = await initializeBot();
    global.__botReady = true;
    console.log('✅ Telegram bot initialized');

    // Only mount webhook route if we're using webhook mode (not polling)
    if (process.env.NODE_ENV === 'production' && process.env.WEBHOOK_URL && process.env.USE_POLLING !== 'true') {
      app.use(webhookRoute);
      console.log('✅ Webhook route mounted');
    } else {
      console.log('⏭️ Polling mode active, webhook route not mounted');
    }

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
          const bot = getBot();
          const adminGroupId = process.env.ADMIN_GROUP_ID;

          for (const order of expiredOrders) {
            if (order.clientTelegramId) {
              await notifyUserOrderExpired({ telegram: bot.telegram }, order.clientTelegramId, order.orderRef);
            }
            if (adminGroupId) {
              await notifyAdminOrderExpired({ telegram: bot.telegram }, order, adminGroupId);
            }
          }
        }
      } catch (error) {
        console.error('Cron job error:', error.message);
      }
    });

    // MongoDB backup + prune job: runs daily at 3 AM
    cron.schedule('0 3 * * *', async () => {
      try {
        await runDailyJob();
      } catch (error) {
        console.error('Backup job cron error:', error.message);
      }
    });

    console.log('✅ All services initialized');
  } catch (error) {
    console.error('❌ Service initialization failed (server will keep running):', error.message);
    // Don't crash — server stays up for health checks
  }
})();

process.on('SIGINT', async () => {
  console.log('\n⛔ Shutting down...');
  server.close(() => {
    console.log('HTTP server closed');
  });
  await disconnectDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⛔ Shutting down (SIGTERM)...');
  server.close(() => {
    console.log('HTTP server closed');
  });
  await disconnectDB();
  process.exit(0);
});

module.exports = app;