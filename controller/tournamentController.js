import tournamentModel from "../models/tournament.js";

export const getAllGame = async (req, res) => {
  try {
    const getAllTournament = await tournamentModel.find({});
    console.log("getAllTournament", getAllTournament);
    return res.status(200).send({ tournaments: getAllTournament || [] });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Internal server error" });
  }
};
