const axios = require('axios');
const config = require('../../config');
const logger = require('../../utils/logger');
const { AppError } = require('../../api/middleware/errorHandler');
const { retry } = require('../../utils/helpers');

/**
 * Wallet Client
 * Interfaces with the external virtual wallet API (USDC + off-ramp)
 *
 * The wallet API (built by friend) handles:
 * - USDC balance management
 * - Off-ramping USDC → fiat
 * - Transaction tracking
 * - Refunds
 */
class WalletClient {
  constructor() {
    this.client = axios.create({
      baseURL: config.wallet.apiUrl,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.wallet.apiKey,
      },
    });

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('Wallet API response', {
          url: response.config.url,
          status: response.status,
        });
        return response;
      },
      (error) => {
        logger.error('Wallet API error', {
          url: error.config?.url,
          status: error.response?.status,
          message: error.response?.data?.message || error.message,
        });
        throw error;
      }
    );
  }

  /**
   * Get wallet balance (USDC)
   * @param {string} walletAddress - User's wallet address
   * @returns {Object} { balance, currency, lastUpdated }
   */
  async getBalance(walletAddress) {
    try {
      const response = await retry(async () => {
        return this.client.get(`/wallet/${walletAddress}/balance`);
      });

      return {
        balance: response.data.balance,
        currency: 'USDC',
        balanceUSD: response.data.balance, // USDC is pegged 1:1 to USD
        lastUpdated: response.data.lastUpdated || new Date().toISOString(),
      };
    } catch (error) {
      throw new AppError(
        `Failed to fetch wallet balance: ${error.message}`,
        502,
        'WALLET_BALANCE_ERROR'
      );
    }
  }

  /**
   * Initiate a purchase transfer with off-ramp
   * Converts USDC to fiat and holds it for purchase execution
   *
   * @param {string} walletAddress - User's wallet address
   * @param {number} usdAmount - Amount in USD to spend
   * @param {Object} metadata - Order metadata
   * @returns {Object} { transactionId, status, usdcDebited, fiatAmount, fee }
   */
  async initiateTransfer(walletAddress, usdAmount, metadata = {}) {
    try {
      const response = await this.client.post(`/wallet/${walletAddress}/transfer`, {
        amount: usdAmount,
        currency: 'USD',
        type: 'purchase',
        description: metadata.description || 'Swiftbuy purchase',
        metadata: {
          platform: 'swiftbuy',
          orderId: metadata.orderId,
          retailer: metadata.retailer,
          productTitle: metadata.productTitle,
        },
      });

      return {
        transactionId: response.data.transactionId,
        status: response.data.status,
        usdcDebited: response.data.usdcAmount,
        fiatAmount: response.data.fiatAmount,
        fee: response.data.fee || 0,
        exchangeRate: response.data.exchangeRate || 1,
      };
    } catch (error) {
      if (error.response?.status === 400 && error.response?.data?.code === 'INSUFFICIENT_FUNDS') {
        throw new AppError(
          'Insufficient USDC balance for this purchase',
          400,
          'INSUFFICIENT_FUNDS'
        );
      }
      throw new AppError(
        `Failed to initiate wallet transfer: ${error.message}`,
        502,
        'WALLET_TRANSFER_ERROR'
      );
    }
  }

  /**
   * Get transaction status from wallet
   * @param {string} transactionId - Wallet transaction ID
   * @returns {Object} { status, details }
   */
  async getTransactionStatus(transactionId) {
    try {
      const response = await retry(async () => {
        return this.client.get(`/wallet/transactions/${transactionId}`);
      });

      return {
        transactionId: response.data.transactionId,
        status: response.data.status,
        usdcAmount: response.data.usdcAmount,
        fiatAmount: response.data.fiatAmount,
        fee: response.data.fee,
        createdAt: response.data.createdAt,
        completedAt: response.data.completedAt,
      };
    } catch (error) {
      throw new AppError(
        `Failed to get transaction status: ${error.message}`,
        502,
        'WALLET_TX_STATUS_ERROR'
      );
    }
  }

  /**
   * Request a refund for a transaction
   * @param {string} transactionId - Wallet transaction ID
   * @param {string} reason - Refund reason
   * @returns {Object} { refundId, status }
   */
  async refundTransaction(transactionId, reason = 'Purchase cancelled') {
    try {
      const response = await this.client.post(`/wallet/transactions/${transactionId}/refund`, {
        reason,
        platform: 'swiftbuy',
      });

      return {
        refundId: response.data.refundId,
        status: response.data.status,
        refundedAmount: response.data.refundedAmount,
        currency: response.data.currency || 'USDC',
      };
    } catch (error) {
      throw new AppError(
        `Failed to process refund: ${error.message}`,
        502,
        'WALLET_REFUND_ERROR'
      );
    }
  }

  /**
   * Validate that a wallet address exists and is active
   * @param {string} walletAddress
   * @returns {boolean}
   */
  async validateWallet(walletAddress) {
    try {
      const balance = await this.getBalance(walletAddress);
      return balance !== null;
    } catch {
      return false;
    }
  }
}

// Singleton
module.exports = new WalletClient();


