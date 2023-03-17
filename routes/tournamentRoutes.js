import express from "express";
import {
  getAllGame,
  enterRoom,
  getTournamentById,
} from "../controller/tournamentController";
import { JoinTournament } from "../functions/functions";

import auth from "../landing-server/middlewares/auth";

const router = express.Router();

router.get("/tournaments", getAllGame);
router.get('/tournamentById',getTournamentById)
router.post("/enterroom", auth(), enterRoom);
router.post("/jointournament", auth(), JoinTournament);

export default router;