import mongoose from 'mongoose';
import User from '../landing-server/models/user.model.js';
import roomModel from '../models/room.js';

const admin = require('firebase-admin');
const { db, auth } = require('./firestoreClient');

const convertMongoId = (id) => mongoose.Types.ObjectId(id);

exports.getDoc = async (coll, u) => {
  if (coll === 'users') {
    const userData = await User.findOne({ _id: convertMongoId(u) });
    return userData;
  } else if (coll === 'poker') {
    const roomData = await roomModel.find({ _id: convertMongoId(u) });
    return roomData;
  }
};

exports.getUpdatedStats = async (u) => {
  let stats;
  const snapshot = await db.collection('users').doc(u).get();
  let baseStats = await db.collection('baseStats').doc(u).get();
  if (baseStats.data()) {
    stats = { ...baseStats.data(), countryCode: snapshot.data().countryCode };
  }
  return stats;
};

exports.removeInvToPlayers = async (tableId, u, gameType) => {
  try {
    const snapshot = await db
      .collection(gameType)
      .doc(tableId)
      .update({
        invPlayers: admin.firestore.FieldValue.arrayRemove(u),
        players: admin.firestore.FieldValue.arrayUnion(u),
      });
  } catch (err) {
    console.log('Error =>', err.message);
  }
};

exports.deductAmount = async (buyIn, u, gameType, minBet, media) => {
  const snapshot = await db.collection('baseStats').doc(u).get();
  let bet = minBet ? minBet : 0;
  console.log('Data =>', snapshot.data());
  if (snapshot.data()) {
    let amt;
    let isEnoughAmount;
    let extraCharge = media === 'video' ? 400 : media === 'audio' ? 100 : 0;
    if (gameType === 'pokerTournament_Tables') {
      isEnoughAmount = snapshot.data().total.coins >= buyIn + extraCharge;
      amt = buyIn + extraCharge;
    } else {
      isEnoughAmount = snapshot.data().total.coins >= Number(bet) + extraCharge;
      amt = snapshot.data().total.coins;
    }
    console.log('iiiiiii =>', isEnoughAmount, amt, bet, extraCharge);
    if (isEnoughAmount) {
      const deductBuyIn = await db
        .collection('baseStats')
        .doc(u)
        .update({
          'total.coins': admin.firestore.FieldValue.increment(-amt),
        });
      console.log('gameType =>', gameType, amt, deductBuyIn);
      if (deductBuyIn) {
        return amt;
      }
      return false;
    }
    return false;
  }
  return false;
};

exports.updateGamebyTableId = async (id, gameType, status) => {
  const updateTable = await db
    .collection(gameType)
    .doc(id)
    .update({
      'table.isGameStarted': status === 'inGame' ? true : false,
      'table.isGameFinished': status === 'finish' ? true : false,
      'table.status': status,
    });
};

exports.addPlayerInTable = async (id, player, gameType) => {
  const updateTable = await db
    .collection(gameType)
    .doc(id)
    .update({
      players: admin.firestore.FieldValue.arrayUnion(player),
    });
};

exports.finishHandUpdate = async (winner, loser, tableId, gameType) => {
  winner.forEach(async (ele) => {
    const snap = await db.collection('baseStats').doc(ele.id).get();
    const stats = snap.data();
    let lose = stats.total.loose === 0 ? 1 : stats.total.loose;
    const updateBaseStateWinner = await db
      .collection('baseStats')
      .doc(ele.id)
      .update({
        'total.win': admin.firestore.FieldValue.increment(1),
        'total.games': admin.firestore.FieldValue.increment(1),
        'total.wl_ratio': (stats.total.win + 1) / lose,
      });
  });
  loser.forEach(async (ele) => {
    const snap = await db.collection('baseStats').doc(ele.id).get();
    const stats = snap.data();
    const updateBaseStateLoser = await db
      .collection('baseStats')
      .doc(ele.id)
      .update({
        'total.loose': admin.firestore.FieldValue.increment(1),
        'total.games': admin.firestore.FieldValue.increment(1),
        'total.wl_ratio': stats.total.win / (stats.total.loose + 1),
      });
  });

  const updateTable = await db.collection(gameType).doc(tableId).update({
    'table.isGameStarted': false,
    'table.status': 'lobby',
  });
};

exports.addWatcher = async (uid, tableId, gameType) => {
  const updateTable = await db
    .collection(gameType)
    .doc(tableId)
    .update({
      watchers: admin.firestore.FieldValue.arrayUnion(uid),
    });
};

exports.changeAdmin = async (uid, tableId, gameType) => {
  const updateTable = await db.collection(gameType).doc(tableId).update({
    'table.admin': uid,
  });
};

exports.returnWatcherBetAmount = async (uid, amount) => {
  const addAmount = await db
    .collection('baseStats')
    .doc(uid)
    .update({
      'total.coins': admin.firestore.FieldValue.increment(amount),
    });
};

exports.finishedGame = async (players, table) => {
  try {
    for (let player of players) {
      let newMax, newTotal;
      let uid = player.id ? player.id : player.userid;
      const stats = await db.collection('baseStats').doc(uid).get();
      const { max, total } = stats.data();
      newMax = max;
      newTotal = total;
      if (max.coinsEver < total.coins + player.wallet) {
        newMax.coinsEver = total.coins + player.wallet;
      }
      if (max.looseCoins < table.buyIn - player.wallet) {
        newMax.looseCoins = table.buyIn - player.wallet;
      }
      if (max.winCoins < player.wallet - table.buyIn) {
        newMax.winCoins = player.wallet - table.buyIn;
      }
      if (max.wl_ratio < total.wl_ratio) {
        newMax.wl_ratio = total.wl_ratio;
      }
      const addAmount = await db.collection('baseStats').doc(uid).update({
        max: newMax,
      });
    }
  } catch (err) {
    console.log('Error n finishGame DbFetch Function =>', err.message);
  }
};

exports.getPurchasedItem = async (myId, level) => {
  try {
    let arr = [];
    let data = { level };
    const items = await db
      .collection('users')
      .doc(myId)
      .collection('items')
      .where('type', 'in', ['avatar-frame', 'win-animation', 'lose-defence'])
      .where('isActive', '==', true)
      .get();
    items.forEach((item) => {
      arr.push(item.data());
    });
    data.avatar = arr.find((el) => el.type === 'avatar-frame' && el.isActive)
      ? arr.find((el) => el.type === 'avatar-frame' && el.isActive).publicURL
      : '';
    let winAnimation = arr.find((el) => el.type === 'win-animation');
    data.activeWinAnimation = {
      type: winAnimation
        ? winAnimation.id.search(/^.*(Gas|Fart).*$/) !== -1
          ? 'fart'
          : winAnimation.id.search(/^.*(Dick|Shield).*$/) !== -1
          ? 'dick'
          : 'gun'
        : 'notFound',
      win: winAnimation ? winAnimation.publicURL : 'notFound',
    };
    data.defence = {
      gun: arr.find(
        (el) => el.type === 'lose-defence' && el.id.search('Shield') !== -1
      )
        ? arr.find(
            (el) => el.type === 'lose-defence' && el.id.search('Shield') !== -1
          ).publicURL
        : null,
      dick: arr.find(
        (el) => el.type === 'lose-defence' && el.id.search('Umbrella') !== -1
      )
        ? arr.find(
            (el) =>
              el.type === 'lose-defence' && el.id.search('Umbrella') !== -1
          ).publicURL
        : null,
      fart: arr.find(
        (el) => el.type === 'lose-defence' && el.id.search('Gas') !== -1
      )
        ? arr.find(
            (el) => el.type === 'lose-defence' && el.id.search('Gas') !== -1
          ).publicURL
        : null,
    };
    return data;
  } catch (error) {
    console.log('Error in getPurchased Item =>', error.message);
  }
};

exports.updateInGameStatus = async (uid) => {
  const openSession = await db
    .collection('users')
    .doc(uid)
    .collection('Sessions')
    .orderBy('date', 'asc')
    .limit(1)
    .get();
  let sessionId;
  openSession.forEach((doc) => {
    sessionId = doc.id;
  });
  console.log('sessop =>', sessionId);
  if (sessionId)
    await db
      .collection('users')
      .doc(uid)
      .collection('Sessions')
      .doc(sessionId)
      .update({
        'agent.status': 'online',
      });
  console.log('table close in game status change =>', sessionId);
};

export const getUserId = async (token) => {
  try {
    const user = await auth.verifyIdToken(token);
    console.log('user id token =>', user);
    return user.uid;
  } catch (error) {
    console.log('Error in getUserId', error);
  }
};
