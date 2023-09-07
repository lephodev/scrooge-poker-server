import { CONFLICT } from "http-status";
import { redisClient } from "../app";

export const getCachedGame = async (id) => {
    const isCachedGame = await redisClient.get(id.toString());
    if (isCachedGame) {
      const g = JSON.parse(isCachedGame);
      return { ...g };
    }
}

export const setCachedGame = async (updatedValues) => {
    const updatedGame = await getCachedGame(updatedValues._id);
    await redisClient.set(updatedValues._id.toString(), JSON.stringify(updatedGame ? {...updatedGame, ...updatedValues} : updatedValues));
}
  
export const deleteCachedGame = async (id) => {
    await redisClient.del(id.toString());
};


export async function getAllKeysAndValues() {
  let cursor = '0';
    const {cursor:newCursor, keys} = await redisClient.scan(cursor, 'MATCH', '*');
     console.log("new Key", keys);
    cursor = newCursor
  if (keys.length > 0) {
    const values = await redisClient.mGet(keys);
    console.log("dd", values)
    
    const keyValuePairs = keys.map((key, index) => ({
       ...JSON.parse(values[index])
    }));

    return keyValuePairs;
  } else {
    return [];
  }
}
