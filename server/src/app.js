const express = require('express');
const cors = require('cors');
const path = require('path');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const groupRoutes = require('./routes/groups');
const tripRoutes = require('./routes/trips');
const expenseRoutes = require('./routes/expenses');
const paymentRoutes = require('./routes/payments');
const balanceRoutes = require('./routes/balances');
const notificationRoutes = require('./routes/notifications');
const activityRoutes = require('./routes/activity');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/groups', tripRoutes);
app.use('/api/groups', expenseRoutes);
app.use('/api/groups', paymentRoutes);
app.use('/api/groups', balanceRoutes);
app.use('/api', balanceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api', activityRoutes);

// Error handler for API routes
app.use('/api', errorHandler);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
  });
}

// General error handler (must be last)
app.use(errorHandler);

module.exports = app;
