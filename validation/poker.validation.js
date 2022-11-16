export const validateCreateTable = (req, res, next) => {
  const gameState = req.body;
  const userData = req.user;

  let valid = true;
  let err = {};
  const mimimumBet = 0;
  if (!gameState.gameName) {
    err.gameName = 'Game name is required.';
    valid = false;
  }
  if (!userData?.wallet || gameState.minchips > userData?.wallet) {
    err.minchips = "You don't have enough balance in your wallet.";
    valid = false;
  } else if (gameState.minchips <= mimimumBet) {
    err.minchips =
      'Minimum bet cant be less then or equal to ' + mimimumBet + '.';
    valid = false;
  }
  if (!valid) {
    return res.status(403).send({ ...err });
  }
  next();
};
