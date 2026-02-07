import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { generateToken } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

// In-memory user store (replace with database in production)
const users: Array<{ id: string; email: string; password: string; name: string }> = [];

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
});

// Register
router.post('/register', asyncHandler(async (req, res) => {
  const { email, password, name } = registerSchema.parse(req.body);

  // Check if user exists
  const existingUser = users.find(u => u.email === email);
  if (existingUser) {
    res.status(400).json({ error: { code: 'USER_EXISTS', message: 'User already exists' } });
    return;
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create user
  const user = {
    id: `user_${Date.now()}`,
    email,
    password: hashedPassword,
    name,
  };

  users.push(user);

  // Generate token
  const token = generateToken(user.id, user.email);

  res.status(201).json({
    user: { id: user.id, email: user.email, name },
    token,
  });
}));

// Login
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);

  // Find user
  const user = users.find(u => u.email === email);
  if (!user) {
    res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    return;
  }

  // Verify password
  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    return;
  }

  // Generate token
  const token = generateToken(user.id, user.email);

  res.json({
    user: { id: user.id, email: user.email },
    token,
  });
}));

// Get current user
router.get('/me', asyncHandler(async (req, res) => {
  // This would use the authenticateToken middleware in production
  res.json({ user: null });
}));

export { router as authRouter };
