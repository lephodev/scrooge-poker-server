import express from "express";
import {
  getAllGame,
  enterRoom,
  getTournamentById,
} from "../controller/tournamentController";
import { JoinTournament } from "../functions/functions";

import auth from "../landing-server/middlewares/auth";

const router = express.Router();

router.get("/tournaments", auth(), getAllGame);
router.get("/tournamentById", auth(), getTournamentById);
router.post("/enterroom", auth(), enterRoom);
router.post("/jointournament", auth(), JoinTournament);

export default router;
