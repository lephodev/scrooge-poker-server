import express from 'express';
import { getDocument, createTable } from '../controller/pokerController.js';
import { validateCreateTable } from '../validation/poker.validation.js';

const router = express.Router();

router.get('/getDoc/:coll/"id', getDocument);
router.post('/createTable', validateCreateTable, createTable);

export default router;
