import {
  checkForGameTable,
  socketDoFold,
  socketDoCall,
  socketDoBet,
  socketDoRaise,
  socketDoCheck,
  socketDoAllin,
  doPauseGame,
  doFinishGame,
  doResumeGame,
  doSitOut,
  doSitIn,
  doLeaveTable,
  joinRequest,
  joinWatcherRequest,
  approveJoinRequest,
  rejectJoinRequest,
  startPreflopRound,
  handleNewBet,
  acceptBet,
  addBuyIn,
  leaveAndJoinWatcher,
  InvitePlayers,
  doLeaveWatcher,
  playerTentativeAction,
  UpdateRoomChat,
  updateSeenBy,
  emitTyping,
  JoinTournament,
  checkAlreadyInGame,
  doCalculateCardPair,
  spectateMultiTable,
} from "../functions/functions";
import mongoose from "mongoose";
import { refillWallet } from "../controller/pokerController";
import { connetToLanding, landingSocket } from "./landing_Connection";

const convertMongoId = (id) => mongoose.Types.ObjectId(id);

let returnSocket = (io) => {
  const users = {};

  const socketToRoom = {};
  io.users = [];
  io.room = [];
  io.on("connection", async (socket) => {
    connetToLanding(socket);
    console.log("sockket connecteds");
    socket.on("room", (roomData) => {
      socket.join(roomData.roomid);
      socket.emit("welcome", { msg: "hello welcome to socket.io" });
    });
    socket.on("checkTable", async (data) => {
      try {
        await checkForGameTable(data, socket, io);
      } catch (err) {
        console.log("Error in checkTable =>", err.message);
      }
    });

    socket.on("joinGame", async (data) => {
      await joinRequest(data, socket, io);
    });

    socket.on("checkAlreadyInGame", async (data) => {
      try {
        await checkAlreadyInGame(data, socket, io);
      } catch (err) {
        console.log("error in checkAlreadyInGame", err);
      }
    });

    socket.on("leaveWatcherJoinPlayer", async (data) => {
      await doLeaveWatcher(data, io, socket);
      await joinRequest(data, socket, io);
    });

    socket.on("joinWatcher", async (data) => {
      await joinWatcherRequest(data, socket, io);
    });

    socket.on("newBet", async (data) => {
      process.nextTick(async () => {
        await handleNewBet(data, socket, io);
      });
    });

    socket.on("acceptBet", async (data) => {
      await acceptBet(data, socket, io);
    });

    socket.on("approveRequest", async (data) => {
      await approveJoinRequest(data, socket, io);
    });

    socket.on("cancelRequest", async (data) => {
      await rejectJoinRequest(data, socket, io);
    });

    socket.on("startPreflopRound", async (data) => {
      await startPreflopRound(data, socket, io);
    });

    socket.on("dofold", async (data) => {
      process.nextTick(async () => {
        await socketDoFold(data, io, socket);
      });
    });

    socket.on("docall", async (data) => {
      process.nextTick(async () => {
        await socketDoCall(data, io, socket);
      });
    });

    socket.on("dobet", async (data) => {
      process.nextTick(async () => {
        await socketDoBet(data, io, socket);
      });
    });

    socket.on("doraise", async (data) => {
      process.nextTick(async () => {
        await socketDoRaise(data, io, socket);
      });
    });

    socket.on("docheck", async (data) => {
      process.nextTick(async () => {
        await socketDoCheck(data, io, socket);
      });
    });

    socket.on("doallin", async (data) => {
      process.nextTick(async () => {
        await socketDoAllin(data, io, socket);
      });
    });

    socket.on("dopausegame", async (data) => {
      process.nextTick(async () => {
        await doPauseGame(data, io, socket);
      });
    });

    socket.on("refillWallet", async (data) => {
      await refillWallet(data, io, socket);
    });

    socket.on("dofinishgame", async (data) => {
      process.nextTick(async () => {
        await doFinishGame(data, io, socket);
      });
    });

    socket.on("doresumegame", async (data) => {
      process.nextTick(async () => {
        await doResumeGame(data, io, socket);
      });
    });

    socket.on("dositout", async (data) => {
      await doSitOut(data, io, socket);
    });

    socket.on("dositin", async (data) => {
      await doSitIn(data, io, socket);
    });

    socket.on("doleavetable", async (data) => {
      if (data.isWatcher) {
        await doLeaveWatcher(data, io, socket);
      } else {
        await doLeaveTable(data, io, socket);
      }
    });

    socket.on("leaveJoinWatcher", async (data) => {
      await leaveAndJoinWatcher(data, io, socket);
    });

    socket.on("typing", async (data) => {
      socket.to(data.roomid).emit("usrtyping", { usr: data.user });
    });

    socket.on("msg_send", async (data) => {
      socket.to(data.roomid).emit("user_message", {
        usr: data.user,
        msg: data.msg,
        name: data.name,
      });
    });

    socket.on("join room", (data) => {
      if (users[data.roomid]) {
        users[data.roomid].push({ userid: data.userid, socketid: socket.id });
      } else {
        users[data.roomid] = [{ userid: data.userid, socketid: socket.id }];
      }
      socketToRoom[socket.id] = data.roomid;
      const usersInThisRoom = users[data.roomid].filter(
        (el) => el.socketid !== socket.id
      );
      socket.emit("all users", usersInThisRoom);
    });

    // BuyIn socket
    socket.on("addCoins", async (data) => {
      await addBuyIn(
        data.amt,
        data.userId,
        data.usd,
        data.payMethod,
        data.cardNr,
        data.tableId,
        io,
        socket
      );
    });

    socket.on("sending signal", (payload) => {
      io.to(payload.userToSignal).emit("user joined", {
        signal: payload.signal,
        callerID: payload.callerID,
        userid: payload.userid,
      });
    });

    socket.on("returning signal", (payload) => {
      io.to(payload.callerID).emit("receiving returned signal", {
        signal: payload.signal,
        id: socket.id,
        userid: payload.userid,
      });
    });

    socket.on("showCard", (data) => {
      io.in(data.gameId).emit("showCard", data);
    });
    socket.on("hideCard", (data) => {
      io.in(data.gameId).emit("hideCard", data);
    });

    socket.on("disconnect", async () => {
      try {
        console.log(
          "disconnected",
          socket.id,
          socket.customId, // userid of player who leaves the game
          socket.customRoom // Room id on which user was playing game
        );

        if (!socket.custoumId && !socket.customRoom) {
          return;
        }

        const lastSockets = io.users;
        let filteredSockets = lastSockets.filter(
          (el) => el.toString() === socket.customId.toString()
        );
        const roomid = io.room;
        let filteredRoom = roomid.filter(
          (el) => el.room.toString() === socket.customRoom.toString()
        );
        if (filteredSockets.length > 0 && filteredRoom.length > 0) {
          let indexUser = lastSockets.indexOf(socket.customId);
          if (indexUser !== -1) lastSockets.splice(indexUser, 1);

          io.users = lastSockets;

          let data = {
            roomid: socket.customRoom,
            userId: socket.customId,
            tableId: socket.customRoom,
          };

          setTimeout(async () => {
            let dd = { ...data };
            if (
              io.users.find((ele) => ele?.toString() === dd?.userId?.toString())
            ) {
              return;
            } else {
              await doLeaveTable(dd, io, socket);
            }
          }, 120000);
        }
        const roomID = socketToRoom[socket.id];
        let room = users[roomID];
        if (room) {
          room = room.filter((el) => el.socketid !== socket.id);
          users[roomID] = room;
        }
      } catch (e) {
        console.log("error in disconnect block", e);
      }
      console.log("Player gone!");
    });

    socket.on("chatMessage", async (data) => {
      io.in(data.tableId.toString()).emit("newMessage", data);
      await UpdateRoomChat(data, socket, io);
    });

    socket.on("invPlayers", async (data) => {
      InvitePlayers(data, socket, io);
    });

    socket.on("giftItem", async (data) => {
      io.in(data.tableId).emit("newItem", data);
    });

    socket.on("clearData", async (data) => {
      if (data.tableId) doFinishGame(data, io, socket);
    });

    socket.on("playerTentativeAction", async (data) => {
      await playerTentativeAction(data, socket, io);
    });

    socket.on("updateChatIsRead", async (data) => {
      await updateSeenBy(data, socket, io);
    });

    socket.on("updateChatIsReadWhileChatHistoryOpen", async (data) => {
      if (data.openChatHistory) {
        await updateSeenBy(data, socket, io);
      }
    });

    socket.on("typingOnChat", async (data) => {
      await emitTyping(data, socket, io);
    });

    socket.on("startGame", async (data) => {
      const { tableId } = data;
      io.in(tableId).emit("roomGameStarted", { start: true });
    });

    socket.on("joinTournament", async (data) => {
      q.push({ data, io, socket, type: "joinTournament" });
      // await JoinTournament(data, io, socket);
    });
    socket.on("calCulateCardPair", async (data) => {
      await doCalculateCardPair(data, io, socket);
    });
    socket.on("spectateMultiTable", async (data) => {
      await spectateMultiTable(data, io, socket);
    });
  });
};
module.exports = returnSocket;
