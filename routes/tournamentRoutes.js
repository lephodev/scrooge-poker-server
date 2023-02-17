import express from "express";
import {
  getAllGame,
  enterRoom,
} from "../controller/tournamentController";
import { JoinTournament } from "../functions/functions";

import auth from "../landing-server/middlewares/auth";

const router = express.Router();

router.get("/tournaments", getAllGame);
// router.post("/jointournament", auth(), JoinTournament);
router.post("/enterroom", auth(), enterRoom);
router.post("/jointournament", auth(), JoinTournament);

export default router;

// const router = express.Router();
// const steamRoute = (bot) => {
//   router.get(
//     "/getUserSteamInventory/:steamId/:gameId/2",
//     userAuth,
//     getUserSteamInventory
//   );
//   router.post("/sendToGoFestInventory", userAuth, (req, res) =>
//     sendToGoFestInventory(req, res, bot)
//   );
//   router.post("/sendTradeOfferForBuy", userAuth, (req, res) =>
//     sendTradeOfferForBuy(req, res, bot)
//   );
//   router.post("/updateTradeUrl", userAuth, updateTradeUrl);
//   router.post("/updateAPIKey", userAuth, updateAPIKey);
//   return router;
// };
// export default steamRoute;