const admin = require("firebase-admin");
const { v4: uuidv4 } = require("uuid");

class FirestoreClient {
  constructor() {
    admin.initializeApp({
      projectId: "mycool-net-app",
      credential: admin.credential.applicationDefault(),
    });
    this.db = admin.firestore();
    this.auth = admin.auth();
  }
  async save(collection, data) {
    const documentId = uuidv4();
    const docRef = this.db.collection(collection).doc(documentId);
    await docRef.set(data);
    return documentId;
  }

  async saveSubCollection(rootCol, rootdocName, subCol, subColData) {
    const docRef = this.db
      .collection(rootCol)
      .doc(rootdocName)
      .collection(subCol)
      .doc(subColData.docName);
    await docRef.set(subColData);
  }

  async saveByPath(path, data) {
    const docRef = this.db.doc(path);
    await docRef.set(data);
  }
}
module.exports = new FirestoreClient();
