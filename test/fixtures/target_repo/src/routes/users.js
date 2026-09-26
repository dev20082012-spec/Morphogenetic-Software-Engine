import express from 'express';
import { requireAuth, listUsers, createUser } from '../controllers/usersController.js';

export const usersRouter = express.Router();

usersRouter.get('/',  requireAuth, listUsers);
usersRouter.post('/', requireAuth, createUser);

