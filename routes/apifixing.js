const express = require('express');
const { ObjectId } = require('mongodb');

module.exports = function createApiFixingRouter(db) {
  const router = express.Router();

  // Middleware to get collection dynamically
  const getCollection = (req, res, next) => {
    const { collectionName } = req.params;
    req.collection = db.collection(collectionName);
    next();
  };

  // GET: Fetch all documents (or filtered)
  router.get('/:collectionName', getCollection, async (req, res) => {
    try {
      const result = await req.collection.find({}).toArray();
      res.send(result);
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  // POST: Add new entry
  router.post('/:collectionName', getCollection, async (req, res) => {
    try {
      const result = await req.collection.insertOne(req.body);
      res.status(201).send(result);
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  // PATCH: Update specific entry
  router.patch('/:collectionName/:id', getCollection, async (req, res) => {
    try {
      const { id } = req.params;
      const result = await req.collection.updateOne(
        { _id: new ObjectId(id) },
        { $set: req.body }
      );
      res.send(result);
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  // DELETE: Remove an entry
  router.delete('/:collectionName/:id', getCollection, async (req, res) => {
    try {
      const { id } = req.params;
      const result = await req.collection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  return router;
};