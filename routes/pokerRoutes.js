import express from 'express';
import {
  getDocument,
  createTable,
  getAllGame,
  getAllUsers,
} from '../controller/pokerController.js';
import { validateCreateTable } from '../validation/poker.validation.js';

const router = express.Router();

router.get('/getDoc/:coll/"id', getDocument);
router.post('/createTable', validateCreateTable, createTable);
router.get('/rooms', getAllGame);
router.get('/getAllUsers', getAllUsers);

export default router;
