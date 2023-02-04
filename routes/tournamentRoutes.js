import express from "express";
import { getAllGame, JoinTournament } from "../controller/tournamentController";

import auth from "../landing-server/middlewares/auth";

const router = express.Router();

router.get("/tournaments", getAllGame);
router.post("/jointournament", auth(), JoinTournament);

export default router;
