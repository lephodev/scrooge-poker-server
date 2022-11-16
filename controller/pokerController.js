import mongoose from 'mongoose';
import User from '../landing-server/models/user.model.js';
import roomModel from './../models/room.js';

export const getDocument = async (req, res) => {
  try {
    const { coll, id } = req.params;

    if (coll === 'users' && id) {
      const userData = await User.findOne({ _id: mongoose.Types.ObjectId(id) });
      return res.status(200).send({ data: userData ?? {} });
    }

    return res.status(200).send({ data: {} });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: 'Internal server error' });
  }
};

export const createTable = async (req, res) => {
  try {
    const { gameName, public: gameType, minChips, timer } = req.body;
    const userData = req.user;

    await roomModel.create({
      gameName,
      public: gameType,
      smallBlind: minchips / 2,
      bigblind: minChips,
      timer,
      hostId: userData._id,
      players: [],
    });

    console.log({ gameName, gameType, minchips, userData });
    res.status(200).send({});
  } catch (error) {
    res.status(500).send({ message: 'Internal server error' });
  }
};
