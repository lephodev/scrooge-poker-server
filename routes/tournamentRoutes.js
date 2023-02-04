import express from "express";
import { getAllGame } from "../controller/tournamentController";

import auth from "../landing-server/middlewares/auth";

const router = express.Router();

router.get("/tournaments", getAllGame);

export default router;
