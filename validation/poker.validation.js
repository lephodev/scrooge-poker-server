import CryptoJS from "crypto-js";
import dotenv from "dotenv";

dotenv.config();

export const validateCreateTable = (req, res, next) => {
  const gameState = req.body;
  const userData = req.user;

  let valid = true;
  let err = {};
  console.log("gameState-->",gameState)
  const mimimumBet = 0;
  if (!gameState.gameName) {
    err.gameName = "Game name is required.";
    valid = false;
  }
  if ((!userData?.wallet && gameState?.gameMode === 'token')|| (gameState.minchips > userData?.wallet && gameState.gameMode === 'token')) {
    err.minchips = "You don't have enough token in your account.";
    valid = false;
  }else if ((!userData?.goldCoin && gameState?.gameMode === 'goldCoin')|| (gameState.minchips > userData?.goldCoin && gameState?.gameMode === 'goldCoin')) {
    err.minchips = "You don't have enough gold coin in your account.";
    valid = false;
  } else if (gameState.minchips <= mimimumBet) {
    err.minchips =
      "Minimum bet cant be less then or equal to " + mimimumBet + ".";
    valid = false;
  }
  if (!valid) {
    return res.status(403).send({ ...err });
  }
  next();
};

export const EncryptCard = (card) => {
  if (card) {
    let ciphercard = CryptoJS.AES.encrypt(card,
      process.env.PUBLICK_CRYTO_KEY
    ).toString();
    return ciphercard;
  }
};
export const decryptCard = (cipher) => {
  if (cipher) {
    var bytes  = CryptoJS.AES.decrypt(cipher, process.env.PUBLICK_CRYTO_KEY);
var originalText = bytes.toString(CryptoJS.enc.Utf8);
   
    return originalText;
  }
};
