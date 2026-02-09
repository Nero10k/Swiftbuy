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

    const agentId = generateId('agent');
    const apiKey = generateId('sk');

    // Hash the API key for storage
    const apiKeyHash = await bcrypt.hash(apiKey, 10);

    await AgentSession.create({
      agentId,
      agentName,
      apiKeyHash,
      permissions: permissions || ['search', 'purchase', 'wallet_read'],
    });

    // Generate agent JWT
    const token = jwt.sign(
      { agentId, agentName, permissions },
      config.jwt.agentSecret,
      { expiresIn: '365d' }
    );

    res.status(201).json({
      success: true,
      data: {
        agentId,
        agentName,
        apiKey, // Only shown once
        token,
        permissions,
        message: 'Save your API key — it will not be shown again',
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


