const express = require('express');
const { getBot } = require('../config/bot');

const router = express.Router();

router.post('/webhook', (req, res) => {
  const bot = getBot();
  if (!bot) {
    return res.status(500).json({ error: 'Bot not initialized' });
  }

  bot.webhookCallback('/webhook')(req, res);
});

router.get('/webhook-status', (req, res) => {
  res.json({ status: 'Webhook route active' });
});

module.exports = router;
