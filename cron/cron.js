/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/* eslint-disable import/no-dynamic-require */

import { CronJob } from "cron";
import { ISO_8601 } from "moment/moment";
import { activateTournament } from "../functions/functions";
import gameService from "../service/game.service";
const returnCron = async(io) => {
  const job1 = new CronJob("*    *    *    *    *", async () => {
    await gameService.sendAcknowledgementForJoinTournament(io)
    console.log("new date-->",new Date('2023-02-16T13:03:00.000+00:00').toUTCString(),new Date().toUTCString())
    await activateTournament(io)
  });
  job1.start();
};
export default returnCron;
