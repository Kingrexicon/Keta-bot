/**
 * Anchor (Banking-as-a-Service) integration for BVN KYC verification.
 * Production base URL: https://api.getanchor.co
 */

const ANCHOR_BASE_URL = process.env.ANCHOR_BASE_URL || 'https://api.getanchor.co';
const ANCHOR_SECRET_KEY = process.env.ANCHOR_SECRET_KEY || '';
const ANCHOR_KYC_LEVEL = process.env.ANCHOR_KYC_LEVEL || 'TIER_2';

/**
 * Generic Anchor API request helper (JSON:API compatible).
 * @param {string} method - HTTP method
 * @param {string} path - API path, e.g. '/api/v1/customers'
 * @param {object|null} body - JSON body (optional)
 */
async function anchorRequest(method, path, body = null) {
  if (!ANCHOR_SECRET_KEY) {
    throw new Error('ANCHOR_SECRET_KEY is not configured');
  }

  const headers = {
    'accept': 'application/json',
    'content-type': 'application/json',
    'x-anchor-key': ANCHOR_SECRET_KEY
  };

  const options = {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  };

  const response = await fetch(`${ANCHOR_BASE_URL}${path}`, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    throw new Error(`Anchor returned non-JSON response (${response.status}): ${text}`);
  }

  if (!response.ok) {
    const errMsg = data?.errors?.[0]?.detail || data?.error?.message || data?.message || `HTTP ${response.status}`;
    throw new Error(`Anchor API error (${response.status}): ${errMsg}`);
  }

  return data;
}

/**
 * Create a new individual customer on Anchor.
 * @param {Object} params - { firstName, middleName, lastName, email, phoneNumber }
 * @returns {Promise<string>} customerId (e.g. "170116154363520-anc_ind_cst")
 */
async function createCustomer({ firstName, middleName, lastName, email, phoneNumber }) {
  const data = {
    data: {
      type: 'IndividualCustomer',
      attributes: {
        fullName: {
          firstName,
          middleName: middleName || '',
          lastName
        },
        email,
        phoneNumber: phoneNumber || '',
        address: {
          addressLine_1: 'Lagos, Nigeria',
          addressLine_2: 'Lagos, Nigeria',
          country: 'NG',
          city: 'Lagos',
          postalCode: '100001',
          state: 'Lagos'
        },
        metadata: {
          source: 'ketabot'
        }
      }
    }
  };

  const result = await anchorRequest('POST', '/api/v1/customers', data);
  const customerId = result?.data?.id;
  if (!customerId) {
    throw new Error('Anchor did not return a customerId');
  }
  return customerId;
}

/**
 * Submit BVN KYC verification for an existing customer.
 * @param {Object} params - { customerId, bvn, dateOfBirth, gender }
 * @returns {Promise<Object>} Anchor response
 */
async function submitKyc({ customerId, bvn, dateOfBirth, gender }) {
  const data = {
    data: {
      type: 'Verification',
      attributes: {
        level: ANCHOR_KYC_LEVEL,
        level2: {
          bvn,
          dateOfBirth,
          gender
        }
      }
    }
  };

  return anchorRequest('POST', `/api/v1/customers/${customerId}/verification/individual`, data);
}

/**
 * Get the current verification status for a customer.
 * Used as a fallback when webhooks are unreliable.
 * @param {string} customerId - Anchor customer ID
 * @returns {Promise<Object>} Customer data with verification status
 */
async function getCustomer(customerId) {
  return anchorRequest('GET', `/api/v1/customers/${customerId}`);
}

/**
 * Get the list of verifications for a customer.
 * @param {string} customerId - Anchor customer ID
 * @returns {Promise<Object>} Verifications list
 */
async function getVerifications(customerId) {
  return anchorRequest('GET', `/api/v1/customers/${customerId}/verifications`);
}

module.exports = {
  createCustomer,
  submitKyc,
  getCustomer,
  getVerifications,
  ANCHOR_BASE_URL
};
