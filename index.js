require('dotenv').config();
require('dotenv').config({path: '.env.local', override: true});

const express = require('express');
require('./bot');

const app = express();
const PORT = process.env.PORT || 4040;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('KetaBot Telegram server is running.');
});

app.get('/health', (req, res) => {
  res.json({ok: true});
});

app.listen(PORT, (error) => {
  if (error) {
    console.error(`Error occurred while starting the server: ${error}`);
    return;
  }

  console.log(`Server is running on port ${PORT}`);
  console.log('Telegram bot polling is active');
});
