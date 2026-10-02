const jwt = require('jsonwebtoken');
const User = require('../models/User');


const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';

  
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Not authorized. No token provided.' });
    }

    const token = authHeader.split(' ')[1];

   
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

   
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: 'Not authorized. User no longer exists.' });
    }

  
    req.user = user;
    next(); 
  } catch (error) {
    return res.status(401).json({ message: 'Not authorized. Token is invalid or expired.' });
  }
};

module.exports = protect;