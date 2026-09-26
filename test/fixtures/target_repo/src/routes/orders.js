import express from 'express';
import { requireAuth } from '../controllers/usersController.js';
import { listOrders, createOrder } from '../controllers/ordersController.js';

export const ordersRouter = express.Router();

ordersRouter.get('/',  requireAuth, listOrders);
ordersRouter.post('/', requireAuth, createOrder);

