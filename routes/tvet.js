const express = require('express');
const { ObjectId } = require('mongodb');

/**
 * TVET Platform Router
 * @param {Collection} tvetShortQuestions - Collection for written/short questions
 * @param {Collection} multipleChoiceQuestions - Collection for MCQs
 * @param {Collection} coursesCollection - Collection for course catalog
 * @param {Collection} mcqSubmissionsCollection - Separate collection for MCQ logs
 * @param {Collection} shortSubmissionsCollection - Separate collection for Written/Short logs
 */
module.exports = function createTvetRouter(
  tvetShortQuestions, 
  multipleChoiceQuestions, 
  coursesCollection, // Added this collection
  mcqSubmissionsCollection, 
  shortSubmissionsCollection
) {
  const router = express.Router();

  // ========================================================
  // 0. FETCH COURSES
  // ========================================================
  router.get('/courses', async (req, res) => {
    try {
      const { category } = req.query;
      const query = category ? { category } : {};
      const result = await coursesCollection.find(query).toArray();
      res.send(result);
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  router.get('/courses/:id', async (req, res) => {
    try {
      const course = await coursesCollection.findOne({ _id: new ObjectId(req.params.id) });
      if (!course) return res.status(404).send({ message: "Course not found" });
      res.send(course);
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  // ========================================================
  // 1. FETCH SHORT / WRITTEN QUESTIONS
  // ========================================================
  router.get('/shortQuestions', async (req, res) => {
    try {
      const { category, unit } = req.query;
      let query = {};
      if (category) query.category = category;
      if (unit) query.unit = unit;

      const result = await tvetShortQuestions.find(query).toArray();
      res.send(result);
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  // ========================================================
  // 2. FETCH MULTIPLE CHOICE QUESTIONS
  // ========================================================
  router.get('/mcqQuestions', async (req, res) => {
    try {
      const { category, unit } = req.query;
      let query = {};
      if (category) query.category = category;
      if (unit) query.unit = unit;

      const result = await multipleChoiceQuestions.find(query).toArray();
      res.send(result);
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  // ========================================================
  // 3. SUBMIT ENGINE: MCQ ANSWERS
  // ========================================================
  router.post('/quiz/submit-mcq', async (req, res) => {
    try {
      const { username, email, category, unit, results } = req.body;

      if (!category || !results || !Array.isArray(results)) {
        return res.status(400).send({ message: "Invalid payload." });
      }

      let correctCount = 0;
      const gradedResults = [];

      for (const item of results) {
        const dbQuestion = await multipleChoiceQuestions.findOne({ _id: new ObjectId(item.questionId) });
        let isCorrect = dbQuestion ? dbQuestion.correctOptionIndex === item.selectedOptionIndex : false;
        if (isCorrect) correctCount++;

        gradedResults.push({
          questionId: item.questionId,
          selectedOptionIndex: item.selectedOptionIndex,
          correctOptionIndex: dbQuestion ? dbQuestion.correctOptionIndex : null,
          isCorrect: isCorrect
        });
      }

      const mcqDocument = {
        username: username || "Guest Student",
        email: email || "guest@test.local",
        category,
        unit,
        results: gradedResults,
        status: "evaluated", 
        score: correctCount,
        totalQuestions: results.length,
        percentage: parseFloat(((correctCount / results.length) * 100).toFixed(2)),
        submittedAt: new Date(),
        evaluatedAt: new Date()
      };

      const writeResult = await mcqSubmissionsCollection.insertOne(mcqDocument);
      res.status(201).send({ success: true, submissionId: writeResult.insertedId });

    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  // ========================================================
  // 4. SUBMIT ENGINE: SHORT ANSWERS
  // ========================================================
  router.post('/quiz/submit-written', async (req, res) => {
    try {
      const { username, email, category, unit, results } = req.body;
      const writtenDocument = {
        username: username || "Guest Student",
        email: email || "guest@test.local",
        category,
        unit,
        results,
        status: "pending", 
        submittedAt: new Date()
      };

      const writeResult = await shortSubmissionsCollection.insertOne(writtenDocument);
      res.status(201).send({ success: true, submissionId: writeResult.insertedId });
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  return router;
};