const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../../models/User');
const AgentSession = require('../../models/AgentSession');
const config = require('../../config');
const { AppError } = require('../middleware/errorHandler');
const { generateId } = require('../../utils/helpers');

/**
 * Register a new user
 */
const register = async (req, res, next) => {
  try {
    const { email, password, name, walletAddress } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new AppError('Email already registered', 409, 'EMAIL_EXISTS');
    }

    // Create user
    const user = await User.create({
      email,
      password,
      name,
      walletAddress,
    });

    // Generate token
    const token = jwt.sign({ id: user._id }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    res.status(201).json({
      success: true,
      data: {
        user: user.toJSON(),
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Login user
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
    }

    const token = jwt.sign({ id: user._id }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    });

    res.json({
      success: true,
      data: {
        user: user.toJSON(),
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Register a new AI agent (get API credentials)
 */
const registerAgent = async (req, res, next) => {
  try {
    const { agentName, permissions } = req.body;

    // The agent is bound to the authenticated user
    const userId = req.user._id.toString();

    const agentId = generateId('agent');
    const apiKey = generateId('sk');

    // Hash the API key for storage
    const apiKeyHash = await bcrypt.hash(apiKey, 10);

    const effectivePermissions = permissions || ['search', 'purchase', 'wallet_read'];

    await AgentSession.create({
      agentId,
      agentName,
      apiKeyHash,
      userId,
      permissions: effectivePermissions,
    });

    // Generate agent JWT — includes userId so /me can resolve the user
    const token = jwt.sign(
      { agentId, agentName, userId, permissions: effectivePermissions },
      config.jwt.agentSecret,
      { expiresIn: '365d' }
    );

    res.status(201).json({
      success: true,
      data: {
        agentId,
        agentName,
        userId,
        apiKey, // Only shown once
        token,
        permissions: effectivePermissions,
        message: 'Save your API key and token — they will not be shown again. Use the token as Bearer auth for all agent API calls.',
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current user profile
 */
const getProfile = async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: { user: req.user },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { register, login, registerAgent, getProfile };




