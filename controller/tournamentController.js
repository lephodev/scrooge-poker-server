import tournamentModel from "../models/tournament.js";
import User from "../landing-server/models/user.model.js";
import roomModel from "../models/room.js";
import mongoose from "mongoose";
import { JoinTournament } from "../functions/functions.js";
import payout from "../config/payout.json";
import { getCachedGame } from "../redis-cache/index.js";

var cron = require("node-cron");
const img =
  "https://i.pinimg.com/736x/06/d0/00/06d00052a36c6788ba5f9eeacb2c37c3.jpg";

export const getAllGame = async (req, res) => {
  try {
    const getAllTournament = await tournamentModel.find({}).sort({_id: -1}).populate("rooms");
    return res.status(200).send({ tournaments: getAllTournament || [] });
  } catch (error) {
    console.log("getAllGame", error);
    return res.status(500).send({ message: "Internal server error" });
  }
};
//this API to show the data on the leader board page
export const getTournamentById = async (req, res) => {
  try {
    const { tournamentId } = req.query;
    let payoutStructure = {};
    if (tournamentId) {
      let tournament = await tournamentModel
        .findOne({ _id: tournamentId })
        .populate({
          path: "winPlayer.first.userId",
          model: "User",
        })
        .populate({
          path: "winPlayer.second.userId",
          model: "User",
        })
        .populate({
          path: "winPlayer.third.userId",
          model: "User",
        })
        .populate({
          path: "winPlayer.4-10.userIds",
          model: "User",
        })
        .populate({
          path: "winPlayer.11-25.userIds",
          model: "User",
        })
        .lean();

      if (tournament) {
        let rooms = [];
        for await (let r of tournament.rooms) {
          rooms.push(await getCachedGame(r));
        }
        tournament.rooms = rooms;
        if (tournament.prizeType !== "Fixed") {
          payoutStructure = await getRequiredPaytout(tournament, payout);
        }

        return res
          .status(200)
          .send({ tournament: tournament || {}, payout: payoutStructure });
      }
      return res.status(404).send({ message: "Tournament not found" });
    }
  } catch (err) {
    return res.status(500).send({ message: "Internal server error" });
  }
};

const getRequiredPaytout = async (tournamentData, payouts) => {
  const { totalJoinPlayer, prizeDistribution } = tournamentData;
  let percnt = 0;
  if (prizeDistribution === "top-10") {
    percnt = Math.ceil(totalJoinPlayer * 0.1);
  } else if (prizeDistribution === "top-15") {
    percnt = Math.ceil(totalJoinPlayer * 0.15);
  } else {
    percnt = Math.ceil(totalJoinPlayer * 0.2);
  }
  let values =
    (await payouts[prizeDistribution]) &&
    Object.values(payouts[prizeDistribution]);

  let reqPayout = values?.find(
    (el) => el.min <= totalJoinPlayer && el.max >= totalJoinPlayer
  );
  if (reqPayout) {
    return reqPayout;
  } else {
    return {
      amount: [],
    };
  }
};

export const jointournament = async (req, res) => {
  try {
    const { _id } = req.user;
    const { tournamentId } = req.body;
    await JoinTournament({ userId: _id, tournamentId });
  } catch (error) {
    console.log("eroor in jointournament", error);
    res.status(500).send({ message: "Internal server error" });
  }
};
export const enterRoom = async (req, res) => {
  try {
    const {
      body: { tournamentId },
      user: { id },
    } = req;

    const tournament = await tournamentModel
      .findOne({ _id: tournamentId })
      .populate("rooms");
    if (!tournament) {
      return res.send({ status: 404, msg: "Tournament not found" });
    }
    if (tournament.isFinished) {
      return res.send({ status: 400, msg: "Tournament already finished" });
    }

    const room = tournament.rooms.find((room) =>
      room.players.find((player) =>
        player.id.toString() === id.toString() ? true : false
      )
    );
    if (room) {
      return res.send({ code: 200, roomId: room._id });
    }
    return res.send({ code: 404, msg: "You have not joined the tournament" });
  } catch (e) {
    console.log("error in enterRoom", e);
    res.send({ status: 406, msg: "Some error has occured!" });
  }
};
