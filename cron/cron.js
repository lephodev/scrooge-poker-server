/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/* eslint-disable import/no-dynamic-require */

import { CronJob } from "cron";
import { ISO_8601 } from "moment/moment";
import { activateTournament } from "../functions/functions";
import gameService from "../service/game.service";
const returnCron = async (io) => {
  const job1 = new CronJob("*    *    *    *    *", async () => {
    await gameService.sendAcknowledgementForJoinTournament(io);
    await activateTournament(io);
    // await gameService.checkJoinTimeExceeded(io);
  });
  job1.start();
};
export default returnCron;
