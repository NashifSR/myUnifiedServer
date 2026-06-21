const express = require('express');
const { ObjectId } = require('mongodb');

/**
 * TVET Platform Router
 * @param {Collection} tvetShortQuestions - Collection for written/short questions
 * @param {Collection} multipleChoiceQuestions - Collection for MCQs
 * @param {Collection} mcqSubmissionsCollection - Separate collection for MCQ logs
 * @param {Collection} shortSubmissionsCollection - Separate collection for Written/Short logs
 */
module.exports = function createTvetRouter(
  tvetShortQuestions, 
  multipleChoiceQuestions, 
  mcqSubmissionsCollection, 
  shortSubmissionsCollection
) {
  const router = express.Router();

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
  // 3. SUBMIT ENGINE: MCQ ANSWERS (Saves to mcqSubmissionCollection)
  // ========================================================
  router.post('/quiz/submit-mcq', async (req, res) => {
    try {
      const { username, email, category, unit, results } = req.body;

      if (!category || !results || !Array.isArray(results)) {
        return res.status(400).send({ message: "Invalid payload. Missing category or results array." });
      }

      let correctCount = 0;
      const gradedResults = [];

      for (const item of results) {
        const dbQuestion = await multipleChoiceQuestions.findOne({ _id: new ObjectId(item.questionId) });
        
        let isCorrect = false;
        if (dbQuestion) {
          isCorrect = dbQuestion.correctOptionIndex === item.selectedOptionIndex;
          if (isCorrect) correctCount++;
        }

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

      res.status(201).send({
        success: true,
        message: "MCQ performance calculated and archived successfully.",
        submissionId: writeResult.insertedId,
        scoreData: {
          score: mcqDocument.score,
          totalQuestions: mcqDocument.totalQuestions,
          percentage: mcqDocument.percentage
        }
      });

    } catch (error) {
      console.error("MCQ Submissions error:", error);
      res.status(500).send({ message: error.message });
    }
  });

  // ========================================================
  // 4. SUBMIT ENGINE: SHORT ANSWERS (Saves to shortSubmissionCollection)
  // ========================================================
  router.post('/quiz/submit-written', async (req, res) => {
    try {
      const { username, email, category, unit, results } = req.body;

      if (!category || !results || !Array.isArray(results)) {
        return res.status(400).send({ message: "Invalid payload. Missing category or results array." });
      }

      const writtenDocument = {
        username: username || "Guest Student",
        email: email || "guest@test.local",
        category,
        unit,
        results, // Contains the plain text area string answers written by the student
        status: "pending", 
        totalScore: null,
        evaluatedAt: null,
        submittedAt: new Date()
      };

      const writeResult = await shortSubmissionsCollection.insertOne(writtenDocument);

      res.status(201).send({
        success: true,
        message: "Written answers saved to evaluation queue.",
        submissionId: writeResult.insertedId
      });

    } catch (error) {
      console.error("Written Submissions error:", error);
      res.status(500).send({ message: error.message });
    }
  });

  return router;
};