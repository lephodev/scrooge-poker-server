import express from "express";
import {
  getDocument,
  createTable,
  getAllGame,
  getAllUsers,
  checkIfUserInTable,
  getTablePlayers,
  refillWallet,
} from "../controller/pokerController.js";
import { validateCreateTable } from "../validation/poker.validation.js";
import auth from "../landing-server/middlewares/auth";

const router = express.Router();

router.get('/getDoc/:coll/"id', getDocument);
router.post("/createTable", validateCreateTable, createTable);
router.get("/rooms", getAllGame);
router.get("/getAllUsers", getAllUsers);
router.get("/checkUserInTable/:tableId", auth(), checkIfUserInTable);
router.get("/getTablePlayers/:tableId", auth(), getTablePlayers);
router.post("/refillWallet", auth(), refillWallet);

router.get("/check-auth", auth(), async (req, res) => {
  try {
    // if (!checkTokenExists) {
    //   return res.status(500).send({ message: "Token not exists." });
    // }

    res.status(200).send({ user: req.user });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Internal server error" });
  }
});

export default router;
