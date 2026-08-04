require('dotenv').config();
require('dotenv').config({ path: '.env.local', override: true });

const ANCHOR_BASE_URL = process.env.ANCHOR_BASE_URL || 'https://api.getanchor.co';
const ANCHOR_SECRET_KEY = process.env.ANCHOR_SECRET_KEY || '';

async function test() {
  if (!ANCHOR_SECRET_KEY) {
    console.log('❌ ANCHOR_SECRET_KEY is empty in .env');
    return;
  }

  console.log('Anchor base URL:', ANCHOR_BASE_URL);
  console.log('Key length:', ANCHOR_SECRET_KEY.length);
  console.log('Key prefix:', ANCHOR_SECRET_KEY.substring(0, 10) + '...');
  console.log('Key contains $:', ANCHOR_SECRET_KEY.includes('$'));
  console.log('Key contains .:', ANCHOR_SECRET_KEY.includes('.'));
  console.log('');

  // Test 1: Simple GET to a common Anchor endpoint to check key validity
  const endpoints = [
    { method: 'GET', path: '/api/v1/customers' },
    { method: 'GET', path: '/api/v1/organizations' }
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(`${ANCHOR_BASE_URL}${ep.path}`, {
        method: ep.method,
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'x-anchor-key': ANCHOR_SECRET_KEY
        }
      });
      const text = await res.text();
      console.log(`[${ep.method} ${ep.path}] -> HTTP ${res.status}`);
      console.log('  Body:', text.substring(0, 300));
      console.log('');
    } catch (e) {
      console.log(`[${ep.method} ${ep.path}] -> ERROR: ${e.message}`);
      console.log('');
    }
  }
}

test().catch(e => console.error('Test failed:', e.message));