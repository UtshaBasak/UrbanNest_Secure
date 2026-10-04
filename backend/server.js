// Must be the first import so env vars are set before other modules load
import './config/env.js';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { authLimiter, apiLimiter } from './middleware/rateLimit.js';

// Import routes
import authRoutes from './routes/authRoutes.js';
import propertyRoutes from './routes/propertyRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import userRoutes from './routes/userRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import ratingRoutes from './routes/ratingRoutes.js';
import leaveRequestRoutes from './routes/leaveRequestRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import chatRoutes from './routes/chatRoutes.js';

// Import config
import connectDB from './config/db.js';
import { initializeAllKeys } from './crypto/keyManager.js';

// Connect to database and initialize encryption keys
const startServer = async () => {
  await connectDB();
  await initializeAllKeys();
};

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false
}));

// Behind a reverse proxy (e.g. Render) use the client IP from X-Forwarded-For,
// otherwise every visitor shares one rate-limit bucket and IP binding is moot
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Rate limiting
app.use('/api', apiLimiter);
app.use('/api/auth', authLimiter);

// CORS configuration
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://urbannest-frontend-bt7n.onrender.com'
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    // Unknown origins get no CORS headers (the browser blocks the response)
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
// Express 5 leaves req.body undefined when no body was parsed; controllers
// destructure it, so keep the Express 4 behaviour of an empty object.
app.use((req, res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Force HTTPS in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
      next();
    }
  });
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/leave-requests', leaveRequestRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/chat', chatRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ message: 'Server is running', timestamp: new Date().toISOString() });
});

// Serve frontend static files in production
if (process.env.NODE_ENV === 'production') {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const distPath = path.join(__dirname, '../frontend/dist');

  app.use(express.static(distPath));

  // Serve index.html for non-API routes (client-side routing)
  app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Global error handler (must be registered last)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Client errors raised by body parsing (bad JSON, payload too large)
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Request is too large. Try smaller or fewer images.' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Malformed JSON in request body' });
  }
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

const PORT = process.env.PORT || 5000;

startServer().then(() => {
  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Kill the process and try again.`);
      process.exit(1);
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });

  // Only register graceful shutdown in production
  // In dev, nodemon handles restart — SIGTERM handler kills in-flight requests
  if (process.env.NODE_ENV === 'production') {
    const shutdown = () => {
      console.log('\n[Server] Shutting down gracefully...');
      server.close(() => { process.exit(0); });
      setTimeout(() => process.exit(0), 5000);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }

}).catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
