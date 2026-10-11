const rateLimit = require('express-rate-limit');
const { Redis } = require('@upstash/redis');
const { Ratelimit } = require('@upstash/ratelimit');

const hasUpstash = () =>
  !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

let redisInstance = null;
function getRedis() {
  if (!redisInstance && hasUpstash()) {
    redisInstance = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redisInstance;
}

/**
 * Creates a serverless distributed rate limiter with fallback
 */
function createRateLimiter({ windowMs, maxRequests, message, title = 'Too many attempts' }) {
  if (hasUpstash()) {
    const redis = getRedis();
    const windowSeconds = Math.ceil(windowMs / 1000);
    const ratelimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(maxRequests, `${windowSeconds} s`),
      analytics: true,
      prefix: 'studyhub:ratelimit',
    });

    return async (req, res, next) => {
      try {
        const ip =
          req.headers['x-forwarded-for']?.split(',')[0].trim() ||
          req.socket.remoteAddress ||
          '127.0.0.1';

        const identifier = `${req.path}:${ip}`;
        const { success, limit, remaining, reset } = await ratelimit.limit(identifier);

        res.setHeader('X-RateLimit-Limit', limit);
        res.setHeader('X-RateLimit-Remaining', remaining);
        res.setHeader('X-RateLimit-Reset', reset);

        if (!success) {
          return res.status(429).render('error', { title, message });
        }
        next();
      } catch (err) {
        console.error('Upstash ratelimit error (failing open):', err);
        next(); // fail open if Redis is temporarily unreachable
      }
    };
  }

  // Fallback to express-rate-limit for local development
  return rateLimit({
    windowMs,
    limit: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    handler: (req, res) => res.status(429).render('error', { title, message }),
  });
}

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 30,
  title: 'Too many attempts',
  message: 'Too many attempts. Please wait a few minutes and try again.',
});

const uploadLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxRequests: 30,
  title: 'Slow down',
  message: 'Upload limit reached. Please try again later.',
});

module.exports = {
  authLimiter,
  uploadLimiter,
  createRateLimiter,
};
