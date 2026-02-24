const axios = require('axios');
const config = require('../../config');
const logger = require('../../utils/logger');
const { AppError } = require('../../api/middleware/errorHandler');
const { retry } = require('../../utils/helpers');

/**
 * Karma Wallet Client
 *
 * Interfaces with the Karma Agent Card API (https://agents.karmapay.xyz)
 *
 * Two key types:
 *   sk_live_... — Owner key: create cards, set limits, freeze, withdraw
 *   sk_agent_... — Agent key: check balance, get card details, verify budget
 *
 * Flow:
 *   1. Register (email) → account_id + sk_live
 *   2. KYC (human verifies identity)
 *   3. Create card → card_id + sk_agent + deposit_address
 *   4. Fund with USDC on Solana
 *   5. Agent spends via card
 */
class KarmaWalletClient {
  constructor() {
    this.baseUrl = config.karma.baseUrl;
  }

  /**
   * Create an axios instance with the appropriate auth key
   */
  _client(apiKey) {
    return axios.create({
      baseURL: this.baseUrl,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    });
  }

  /* ─────────────────────────────────────────────
   * OWNER ENDPOINTS (sk_live key)
   * ───────────────────────────────────────────── */

  /**
   * Register a new Karma account
   * @param {string} email - User's email
   * @returns {{ accountId: string, skLive: string }}
   */
  async register(email) {
    try {
      const response = await axios.post(`${this.baseUrl}/api/register`, {
        email,
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      });

      return {
        accountId: response.data.account_id,
        skLive: response.data.secret_key,
      };
    } catch (error) {
      const msg = error.response?.data?.message || error.response?.data?.error || error.message;
      logger.error(`Karma register failed: ${msg}`);
      throw new AppError(`Failed to create Karma account: ${msg}`, 502, 'KARMA_REGISTER_ERROR');
    }
  }

  /**
   * Start KYC process — sends personal info required by Karma/SumSub
   * @param {string} skLive - Owner key
   * @param {Object} personalInfo - Required KYC fields
   * @param {string} personalInfo.firstName
   * @param {string} personalInfo.lastName
   * @param {string} personalInfo.birthDate - YYYY-MM-DD
   * @param {string} personalInfo.nationalId
   * @param {string} personalInfo.countryOfIssue - 2-letter country code
   * @param {Object} personalInfo.address
   * @param {string} personalInfo.address.line1
   * @param {string} personalInfo.address.city
   * @param {string} personalInfo.address.region
   * @param {string} personalInfo.address.postalCode
   * @param {string} personalInfo.address.countryCode - 2-letter country code
   * @returns {{ status: string, kycUrl: string }}
   */
  async startKyc(skLive, personalInfo = {}) {
    try {
      const body = {};

      // Include personal info if provided
      if (personalInfo.firstName) body.firstName = personalInfo.firstName;
      if (personalInfo.lastName) body.lastName = personalInfo.lastName;
      if (personalInfo.birthDate) body.birthDate = personalInfo.birthDate;
      if (personalInfo.nationalId) body.nationalId = personalInfo.nationalId;
      if (personalInfo.countryOfIssue) body.countryOfIssue = personalInfo.countryOfIssue;
      if (personalInfo.address) {
        body.address = {
          line1: personalInfo.address.line1,
          city: personalInfo.address.city,
          region: personalInfo.address.region,
          postalCode: personalInfo.address.postalCode,
          countryCode: personalInfo.address.countryCode,
        };
      }

      const response = await this._client(skLive).post('/api/kyc', body);

      return {
        status: response.data.status,
        kycUrl: response.data.kyc_url,
      };
    } catch (error) {
      const msg = error.response?.data?.message || error.response?.data?.error || error.message;
      logger.error(`Karma KYC start failed: ${msg}`);
      throw new AppError(`Failed to start KYC: ${msg}`, 502, 'KARMA_KYC_ERROR');
    }
  }

  /**
   * Check KYC status
   * @param {string} skLive - Owner key
   * @returns {{ status: string }}
   */
  async getKycStatus(skLive) {
    try {
      const response = await this._client(skLive).get('/api/kyc/status');
      return { status: response.data.status };
    } catch (error) {
      const msg = error.response?.data?.message || error.response?.data?.error || error.message;
      logger.error(`Karma KYC status failed: ${msg}`);
      throw new AppError(`Failed to check KYC status: ${msg}`, 502, 'KARMA_KYC_STATUS_ERROR');
    }
  }

  /**
   * Create a virtual card
   * @param {string} skLive - Owner key
   * @param {Object} options
   * @param {string} options.name - Card name
   * @param {number} [options.perTxnLimit] - Per-transaction limit
   * @param {number} [options.dailyLimit] - Daily limit
   * @param {number} [options.monthlyLimit] - Monthly limit
   * @returns {{ cardId: string, skAgent: string, depositAddress: string, last4: string }}
   */
  async createCard(skLive, { name = 'Swiftbuy Agent', perTxnLimit = 500, dailyLimit, monthlyLimit } = {}) {
    try {
      const body = { name, per_txn_limit: perTxnLimit };
      if (dailyLimit) body.daily_limit = dailyLimit;
      if (monthlyLimit) body.monthly_limit = monthlyLimit;

      const response = await this._client(skLive).post('/api/cards', body);

      return {
        cardId: response.data.card_id,
        skAgent: response.data.agent_api_key,
        depositAddress: response.data.deposit_address,
        last4: response.data.last4,
      };
    } catch (error) {
      const msg = error.response?.data?.message || error.response?.data?.error || error.message;
      logger.error(`Karma create card failed: ${msg}`);
      throw new AppError(`Failed to create card: ${msg}`, 502, 'KARMA_CARD_ERROR');
    }
  }

  /**
   * List cards
   * @param {string} skLive - Owner key
   * @returns {Array}
   */
  async listCards(skLive) {
    try {
      const response = await this._client(skLive).get('/api/cards');
      return response.data;
    } catch (error) {
      const msg = error.response?.data?.message || error.response?.data?.error || error.message;
      logger.error(`Karma list cards failed: ${msg}`);
      throw new AppError(`Failed to list cards: ${msg}`, 502, 'KARMA_LIST_CARDS_ERROR');
    }
  }

  /**
   * Update card limits
   * @param {string} skLive - Owner key
   * @param {string} cardId
   * @param {Object} updates - { name, per_txn_limit, daily_limit, monthly_limit }
   */
  async updateCardLimits(skLive, cardId, updates) {
    try {
      const response = await this._client(skLive).patch(`/api/cards/${cardId}`, updates);
      return response.data;
    } catch (error) {
      const msg = error.response?.data?.message || error.response?.data?.error || error.message;
      logger.error(`Karma update card failed: ${msg}`);
      throw new AppError(`Failed to update card: ${msg}`, 502, 'KARMA_UPDATE_CARD_ERROR');
    }
  }

  /**
   * Freeze a card
   * @param {string} skLive - Owner key
   * @param {string} cardId
   */
  async freezeCard(skLive, cardId) {
    try {
      const response = await this._client(skLive).post(`/api/cards/${cardId}/freeze`);
      return response.data;
    } catch (error) {
      const msg = error.response?.data?.message || error.response?.data?.error || error.message;
      logger.error(`Karma freeze card failed: ${msg}`);
      throw new AppError(`Failed to freeze card: ${msg}`, 502, 'KARMA_FREEZE_ERROR');
    }
  }

  /**
   * Unfreeze a card
   * @param {string} skLive - Owner key
   * @param {string} cardId
   */
  async unfreezeCard(skLive, cardId) {
    try {
      const response = await this._client(skLive).post(`/api/cards/${cardId}/unfreeze`);
      return response.data;
    } catch (error) {
      const msg = error.response?.data?.message || error.response?.data?.error || error.message;
      logger.error(`Karma unfreeze card failed: ${msg}`);
      throw new AppError(`Failed to unfreeze card: ${msg}`, 502, 'KARMA_UNFREEZE_ERROR');
    }
  }

  /**
   * Withdraw USDC
   * @param {string} skLive - Owner key
   * @param {string} cardId
   * @param {string} address - Solana wallet address
   * @param {number} amount - USDC amount
   */
  async withdraw(skLive, cardId, address, amount) {
    try {
      const response = await this._client(skLive).post(`/api/cards/${cardId}/withdraw`, {
        address,
        amount,
      });
      return response.data;
    } catch (error) {
      const msg = error.response?.data?.message || error.response?.data?.error || error.message;
      logger.error(`Karma withdraw failed: ${msg}`);
      throw new AppError(`Failed to withdraw: ${msg}`, 502, 'KARMA_WITHDRAW_ERROR');
    }
  }

  /* ─────────────────────────────────────────────
   * AGENT/SPEND ENDPOINTS (sk_agent key)
   * ───────────────────────────────────────────── */

  /**
   * Get balance
   * @param {string} skAgent - Agent key
   * @returns {{ available: number, balance: number, depositAddress: string, dailyRemaining: number, monthlyRemaining: number }}
   */
  async getBalance(skAgent) {
    try {
      const response = await retry(async () => {
        return this._client(skAgent).get('/api/spend/balance');
      });

      return {
        available: response.data.available,
        balance: response.data.balance,
        depositAddress: response.data.deposit_address,
        dailyRemaining: response.data.daily_remaining,
        monthlyRemaining: response.data.monthly_remaining,
        currency: 'USDC',
        balanceUSD: response.data.available, // USDC is pegged 1:1
      };
    } catch (error) {
      const msg = error.response?.data?.message || error.response?.data?.error || error.message;
      logger.error(`Karma get balance failed: ${msg}`);
      throw new AppError(`Failed to fetch balance: ${msg}`, 502, 'KARMA_BALANCE_ERROR');
    }
  }

  /**
   * Check if agent can afford a purchase
   * @param {string} skAgent - Agent key
   * @param {number} amount
   * @param {string} [currency='USD']
   * @returns {{ allowed: boolean, fees: number, total: number, available: number }}
   */
  async canSpend(skAgent, amount, currency = 'USD') {
    try {
      const response = await this._client(skAgent).post('/api/spend/can-spend', {
        amount,
        currency,
      });

      return {
        allowed: response.data.allowed,
        fees: response.data.fees || 0,
        total: response.data.total,
        available: response.data.available,
      };
    } catch (error) {
      const msg = error.response?.data?.message || error.response?.data?.error || error.message;
      logger.error(`Karma can-spend check failed: ${msg}`);
      throw new AppError(`Failed to check spending: ${msg}`, 502, 'KARMA_CAN_SPEND_ERROR');
    }
  }

  /**
   * Get card details for checkout
   * @param {string} skAgent - Agent key
   * @returns {{ number: string, cvv: string, expiry: string, expiryMonth: string, expiryYear: string }}
   */
  async getCardDetails(skAgent) {
    try {
      const response = await this._client(skAgent).get('/api/spend/card');

      return {
        number: response.data.number,
        cvv: response.data.cvv,
        expiry: response.data.expiry,
        expiryMonth: response.data.expiry_month,
        expiryYear: response.data.expiry_year,
      };
    } catch (error) {
      const msg = error.response?.data?.message || error.response?.data?.error || error.message;
      logger.error(`Karma get card details failed: ${msg}`);
      throw new AppError(`Failed to get card details: ${msg}`, 502, 'KARMA_CARD_DETAILS_ERROR');
    }
  }

  /**
   * Get transaction history
   * @param {string} skAgent - Agent key
   * @param {number} [limit=20]
   * @returns {Array}
   */
  async getTransactions(skAgent, limit = 20) {
    try {
      const response = await this._client(skAgent).get(`/api/spend/transactions?limit=${limit}`);
      return response.data;
    } catch (error) {
      const msg = error.response?.data?.message || error.response?.data?.error || error.message;
      logger.error(`Karma get transactions failed: ${msg}`);
      throw new AppError(`Failed to get transactions: ${msg}`, 502, 'KARMA_TX_ERROR');
    }
  }

  /* ─────────────────────────────────────────────
   * HELPER: Check if user has Karma connected
   * ───────────────────────────────────────────── */

  /**
   * Check if a user's Karma setup is complete and ready to spend
   * @param {Object} user - User document
   * @returns {{ connected: boolean, ready: boolean, status: string }}
   */
  checkStatus(user) {
    // Connected if we have either an owner key or an agent key
    if (!user.karma || (!user.karma.skLive && !user.karma.skAgent)) {
      return { connected: false, ready: false, status: 'not_connected' };
    }

    if (user.karma.kycStatus !== 'approved') {
      return { connected: true, ready: false, status: `kyc_${user.karma.kycStatus}` };
    }

    // If we have an agent key directly (no owner key), we're ready
    // (agent key means card exists and KYC is approved)
    if (user.karma.skAgent && !user.karma.cardId) {
      // Agent-key-only connection — skip cardId check
      if (user.karma.cardFrozen) {
        return { connected: true, ready: false, status: 'card_frozen' };
      }
      return { connected: true, ready: true, status: 'ready' };
    }

    if (!user.karma.cardId) {
      return { connected: true, ready: false, status: 'no_card' };
    }

    if (user.karma.cardFrozen) {
      return { connected: true, ready: false, status: 'card_frozen' };
    }

    return { connected: true, ready: true, status: 'ready' };
  }
}

// Singleton
module.exports = new KarmaWalletClient();
