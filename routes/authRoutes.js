const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const protect = require('../middleware/authMiddleware');

const router = express.Router();


router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // --- Basic validation ---
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required.' });
    }

    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
    }

    // --- Check if the email is already taken ---
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'This email is already registered.' });
    }

  
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
    });

    res.status(201).json({
      message: 'Registration successful. Please log in.',
      user: { id: user._id, name: user.name, email: user.email }, // no password!
    });
  } catch (error) {
    // Error code 11000 = duplicate key (email already exists race condition)
    if (error.code === 11000) {
      return res.status(400).json({ message: 'This email is already registered.' });
    }
    console.error('Register error:', error.message);
    res.status(500).json({ message: 'Server error during registration.' });
  }
});


router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

    if (!user) {
    
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    // --- Create a JWT valid for 1 day ---
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: '1d',
    });

    res.json({
      message: 'Login successful.',
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ message: 'Server error during login.' });
  }
});

// ============================================
// GET /api/auth/me — info about the logged-in user
// ============================================
router.get('/me', protect, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;