import express from "express";
import {
  getAllGame,
  // JoinTournament,
  enterRoom,
  activateTournament,
} from "../controller/tournamentController";

import auth from "../landing-server/middlewares/auth";

const router = express.Router();

router.get("/tournaments", getAllGame);
// router.post("/jointournament", auth(), JoinTournament);
router.post("/enterroom", auth(), enterRoom);

export default router;
