import express from 'express';
import {
  getDocument,
  createTable,
  getAllGame,
  getAllUsers,
} from '../controller/pokerController.js';
import Token from '../landing-server/models/Token.model.js';
import { validateCreateTable } from '../validation/poker.validation.js';

const router = express.Router();

router.get('/getDoc/:coll/"id', getDocument);
router.post('/createTable', validateCreateTable, createTable);
router.get('/rooms', getAllGame);
router.get('/getAllUsers', getAllUsers);
router.get('/check-auth', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const checkTokenExists = await Token.findOne({ token });

    if (!checkTokenExists) {
      return res.status(500).send({ message: 'Token not exists.' });
    }

    res.status(200).send({ user: req.user });
  } catch (error) {
    res.status(500).send({ message: 'Internal server error' });
  }
});

export default router;
