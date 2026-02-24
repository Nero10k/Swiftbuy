const logger = require('../../utils/logger');

/**
 * Notification Service
 *
 * Stores in-app notifications for users and will support
 * webhooks, email, and push notifications in the future.
 *
 * Notifications are stored in MongoDB and surfaced on the dashboard.
 */

// In-memory store for now (will move to MongoDB model later)
const notifications = new Map(); // userId -> [notifications]

class NotificationService {
  /**
   * Send a notification to a user
   *
   * @param {string} userId - MongoDB user ID
   * @param {Object} notification
   * @param {string} notification.type - order_pending_approval, order_approved, order_confirmed, order_failed, etc.
   * @param {string} notification.title
   * @param {string} notification.message
   * @param {string} [notification.orderId]
   * @param {number} [notification.amount]
   */
  async notify(userId, notification) {
    const userIdStr = userId.toString();

    const entry = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      ...notification,
      read: false,
      createdAt: new Date().toISOString(),
    };

    if (!notifications.has(userIdStr)) {
      notifications.set(userIdStr, []);
    }
    notifications.get(userIdStr).unshift(entry);

    // Keep only last 100 notifications per user
    const userNotifs = notifications.get(userIdStr);
    if (userNotifs.length > 100) {
      notifications.set(userIdStr, userNotifs.slice(0, 100));
    }

    logger.info(`📬 Notification [${notification.type}] for user ${userIdStr}: ${notification.title}`);

    // TODO: Future integrations
    // - WebSocket push (real-time dashboard updates)
    // - Email notifications (for pending approvals)
    // - Webhook callbacks (for agent integrations)

    return entry;
  }

  /**
   * Get all notifications for a user
   */
  async getNotifications(userId, { limit = 20, unreadOnly = false } = {}) {
    const userIdStr = userId.toString();
    let userNotifs = notifications.get(userIdStr) || [];

    if (unreadOnly) {
      userNotifs = userNotifs.filter((n) => !n.read);
    }

    return {
      notifications: userNotifs.slice(0, limit),
      unreadCount: (notifications.get(userIdStr) || []).filter((n) => !n.read).length,
      total: (notifications.get(userIdStr) || []).length,
    };
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(userId, notificationId) {
    const userIdStr = userId.toString();
    const userNotifs = notifications.get(userIdStr) || [];
    const notif = userNotifs.find((n) => n.id === notificationId);
    if (notif) {
      notif.read = true;
    }
    return notif;
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId) {
    const userIdStr = userId.toString();
    const userNotifs = notifications.get(userIdStr) || [];
    userNotifs.forEach((n) => { n.read = true; });
    return { markedCount: userNotifs.length };
  }
}

module.exports = new NotificationService();



