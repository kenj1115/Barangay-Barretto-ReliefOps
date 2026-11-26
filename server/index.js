require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { verifyToken } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);

// ============================================================
// Socket.IO Setup with CORS
// ============================================================
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    socket.user = verifyToken(token);
    next();
  } catch (err) {
    next(new Error('Invalid or expired token'));
  }
});

// Make io accessible to route handlers
app.set('io', io);

// ============================================================
// CORS Middleware
// ============================================================
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// ============================================================
// Body Parsing
// ============================================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ============================================================
// Routes
// ============================================================
app.use('/api/auth', require('./routes/auth'));
app.use('/api/claims', require('./routes/claims'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/audit-logs', require('./routes/auditLogs'));
app.use('/api/donations', require('./routes/donations'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/distributions', require('./routes/distributions'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/cash-disbursements', require('./routes/cashDisbursements'));
app.use('/api/households', require('./routes/households'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================================
// Socket.IO Events
// ============================================================
io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on('join:staff', () => {
    if (!['admin', 'staff'].includes(socket.user.role)) return;
    socket.join('staff');
    console.log(`👤 ${socket.id} joined staff room`);
  });

  socket.on('join:resident', () => {
    if (socket.user.role !== 'resident') return;
    socket.join(`resident:${socket.user.id}`);
    console.log(`👤 ${socket.id} joined resident room: ${socket.user.id}`);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

// ============================================================
// Start Server
// ============================================================
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`\n🚀 Barangay Barretto ReliefOps Server`);
  console.log(`   Running at: http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Env: ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = { app, server, io };
