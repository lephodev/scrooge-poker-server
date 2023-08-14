import mongoose from "mongoose";

mongoose.set("useFindAndModify", false);

export const mongoConnect = async () => {
  try {
    await mongoose.connect(process.env.MYURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useFindAndModify: false,
    });
    console.log("Connected to Mongo database");
  } catch (e) {
    console.log(`Error connecting to mongo database ${e}`);
  }
};
