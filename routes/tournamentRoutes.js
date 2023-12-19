import express from "express";
import {
  getAllGame,
  enterRoom,
  getTournamentById,
} from "../controller/tournamentController";
import { JoinTournament } from "../functions/functions";

import auth from "../landing-server/middlewares/auth";
import Basicauth from "../config/basicAuth";

const router = express.Router();

router.get("/tournaments", Basicauth, getAllGame);
router.get("/tournamentById", getTournamentById);
router.post("/enterroom", Basicauth, enterRoom);
router.post("/jointournament", JoinTournament);

export default router;
