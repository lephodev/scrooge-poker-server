import roomModel from '../models/room.js';
import Game from '../models/room.js';
import userService from './user.service.js';
import mongoose from 'mongoose';

const converMongoId = (id) => mongoose.Types.ObjectId(id);

const maxPlayer = 10;
const img =
  'https://i.pinimg.com/736x/06/d0/00/06d00052a36c6788ba5f9eeacb2c37c3.jpg';

const getGameById = async (id) => {
  const game = await Game.findOne({ _id: converMongoId(id) }).lean();
  if (game) return { ...game, id: game._id };
  return null;
};

const findAvailablePosition = async (playerList) => {
  return new Promise((resolve, reject) => {
    try {
      let i = 0;
      let isFound = false;
      while (i < maxPlayer && !isFound) {
        // eslint-disable-next-line no-loop-func
        const have = playerList.filter((el) => el.position === i);
        if (!have.length) {
          isFound = true;
          resolve({ i, isFound });
        }
        i += 1;
      }
      // eslint-disable-next-line prefer-promise-reject-errors
      reject({ isFound: false });
    } catch (error) {
      // eslint-disable-next-line prefer-promise-reject-errors
      reject({ isFound: false });
    }
  });
};

const pushUserInRoom = async (roomId, userId, position) => {
  try {
    const userData = await userService.getUserById(userId);
    const { username, wallet, email, _id, avatar } = userData;

    await Promise.allSettled([
      userService.updateUserWallet(_id),
      roomModel.updateOne(
        { _id: roomId },
        {
          $push: {
            players: {
              name: username,
              userid: _id,
              id: _id,
              photoURI: avatar || img,
              wallet: wallet,
              position,
              missedSmallBlind: false,
              missedBigBlind: false,
              forceBigBlind: false,
              playing: true,
              initialCoinBeforeStart: wallet,
              gameJoinedAt: new Date(),
              hands: [],
            },
          },
        }
      ),
    ]);

    const room = await getGameById(roomId);
    return room;
  } catch (error) {
    console.log(error);
    return null;
  }
};

const joinRoomByUserId = async (game, userId) => {
  // if public table -
  // check empty slot for table else return slot full,
  // join user in game if there is empty slot
  if (game.public && game.players.length < 10) {
    const availblePosition = await findAvailablePosition(game.players);
    if (!availblePosition.isFound) {
      return null;
    }
    const room = pushUserInRoom(game._id, userId, availblePosition.i);
    return room;
    // else check invite array for private tables
    // join user in game if there is empty slot else return slot full
  } else if (
    game.invPlayers.find((uId) => uId.toString() === userId.toString()) &&
    game.players.length < 10
  ) {
    const availblePosition = await findAvailablePosition(game.players);
    if (!availblePosition.isFound) {
      return null;
    }
    const room = pushUserInRoom(game._id, userId, availblePosition.i);
    return room;
  } else {
    return null;
  }
};

// leave roomId empty if you want exclude any room to come in search
// Because in check game function we want to exclude it from there
const checkIfUserInGame = async (userId, roomId = '') => {
  try {
    let query = { 'players.userid': converMongoId(userId) };

    if (roomId) {
      query['_id'] = { $ne: converMongoId(roomId) };
    }

    console.log({ query });
    const checkRoom = await Game.findOne(query);

    if (checkRoom) {
      return true;
    }

    return false;
  } catch (error) {
    console.log(error);
    return true;
  }
};

const gameService = {
  getGameById,
  joinRoomByUserId,
  checkIfUserInGame,
};

export default gameService;
