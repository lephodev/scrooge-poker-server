/* eslint-disable import/no-unresolved */
/* eslint-disable import/extensions */
/* eslint-disable import/no-dynamic-require */

import { CronJob } from "cron";
import gameService from "../service/game.service";
const returnCron = async() => {
  const job1 = new CronJob("* * * * *", async () => {
    console.log("Run ::> Every Saturday at 23:45 (11:45 PM)")
    await gameService.sendAcknowledgementForJoinTournament()
  });
  job1.start();
};
export default returnCron;
