const jwt = require('jsonwebtoken');
const config = require('../../config');
const { AppError } = require('./errorHandler');
const User = require('../../models/User');

/**
 * Authenticate user requests (dashboard, approvals, etc.)
 */
const authenticateUser = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      throw new AppError('Authentication required', 401, 'AUTH_REQUIRED');
    }

    const decoded = jwt.verify(token, config.jwt.secret);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      throw new AppError('User not found', 401, 'USER_NOT_FOUND');
    }

    if (!user.isActive) {
      throw new AppError('Account is deactivated', 403, 'ACCOUNT_INACTIVE');
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof AppError) return next(error);
    next(new AppError('Invalid authentication token', 401, 'INVALID_TOKEN'));
  }
};

/**
 * Authenticate agent requests (search, purchase, etc.)
 * Agents use a separate secret and include user_id in their requests
 */
const authenticateAgent = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      throw new AppError('Agent authentication required', 401, 'AGENT_AUTH_REQUIRED');
    }

    const decoded = jwt.verify(token, config.jwt.agentSecret);
    req.agent = {
      id: decoded.agentId,
      name: decoded.agentName,
      userId: decoded.userId || null,  // User this agent is authorized for
      permissions: decoded.permissions || ['search', 'purchase'],
    };

    next();
  } catch (error) {
    if (error instanceof AppError) return next(error);
    next(new AppError('Invalid agent token', 401, 'INVALID_AGENT_TOKEN'));
  }
};

/**
 * Verify agent has specific permission
 */
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.agent || !req.agent.permissions.includes(permission)) {
      return next(
        new AppError(
          `Agent lacks required permission: ${permission}`,
          403,
          'PERMISSION_DENIED'
        )
      );
    }
    next();
  };
};

/**
 * Extract bearer token from request headers
 */
const extractToken = (req) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
};

module.exports = { authenticateUser, authenticateAgent, requirePermission };


