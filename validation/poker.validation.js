import CryptoJS from "crypto-js";

export const validateCreateTable = (req, res, next) => {
  const gameState = req.body;
  const userData = req.user;

  let valid = true;
  let err = {};
  const mimimumBet = 0;
  if (!gameState.gameName) {
    err.gameName = "Game name is required.";
    valid = false;
  }
  if (!userData?.wallet || gameState.minchips > userData?.wallet) {
    err.minchips = "You don't have enough balance in your wallet.";
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
  console.log("cardddddddddd", card);
  if (card) {
    let ciphercard = CryptoJS.AES.encrypt(
      process.env.PUBLICK_CRYTO_KEY
    ).toString();
    console.log("ciphercard", ciphercard);
    return ciphercard;
  }
};
export const decryptCard = (cipher) => {
  console.log("cipher", cipher);
  if (cipher) {
    let card = CryptoJS.AES.decrypt(
      cipher,
      process.env.PUBLICK_CRYTO_KEY
    ).toString();
    return card;
  }
};
