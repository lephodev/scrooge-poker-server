/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/* eslint-disable import/no-dynamic-require */

import { CronJob } from "cron";
import { activateTournament } from "../functions/functions";
import gameService from "../service/game.service";
const returnCron = async(io) => {
  const job1 = new CronJob("*    *    *    *    *", async () => {
    await gameService.sendAcknowledgementForJoinTournament()
    await activateTournament(io)
  });
  job1.start();
};
export default returnCron;
