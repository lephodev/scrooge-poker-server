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
import Basicauth from "../config/basicAuth.js";

const router = express.Router();
const pokerRoute = (io) => {
  router.get('/getDoc/:coll/"id', getDocument);
  router.post("/createTable", validateCreateTable, (req, res) =>
    createTable(req, res, io)
  );
  router.get("/rooms", Basicauth, getAllGame);
  router.get("/getAllUsers", Basicauth, getAllUsers);
  router.get("/checkUserInTable/:tableId", auth(), checkIfUserInTable);
  router.get("/getTablePlayers/:tableId", auth(), getTablePlayers);
  router.post("/refillWallet", auth(), refillWallet);

  router.get("/check-auth", auth(), async (req, res) => {
    try {
      res.status(200).send({ user: req.user });
    } catch (error) {
      console.log(error);
      res.status(500).send({ message: "Internal server error" });
    }
  });
  return router;
};

export default pokerRoute;
