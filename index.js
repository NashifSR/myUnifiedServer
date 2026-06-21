const express = require('express');
const app = express();
const cors = require('cors');
const serverless = require('serverless-http');
require('dotenv').config();

// Import the decoupled TVET router engine
const createTvetRouter = require('./routes/tvet');

// Middleware
app.use(cors());
app.use(express.json());

const user = process.env.DB_USER;
const pass = process.env.DB_PASS;

// ----------------- MongoDB Connection Logic ------------------
const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = `mongodb+srv://${user}:${pass}@cluster0.saudl8t.mongodb.net/?appName=Cluster0`;

// Keep the client outside the handler to reuse connection across warm functions
let cachedClient = null;

async function getDbClient() {
  if (cachedClient) return cachedClient;
  
  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });
  
  cachedClient = await client.connect();
  console.log("MongoDB connection established/reused.");
  return cachedClient;
}

// Wrapper to initialize routes only after DB is ready
async function setupApp() {
  const client = await getDbClient();
  const tvetDb = client.db("tvetDataBase");

  const tvetShortQuestions = tvetDb.collection("shortQuestionCollection");
  const tvetMCQQuestions = tvetDb.collection("multipleChoiceQuestionCollection");
  const mcqSubmissions = tvetDb.collection("mcqSubmissionCollection");
  const shortSubmissions = tvetDb.collection("shortSubmissionCollection");

  // Route Gateways
  app.use('/api/tvet', createTvetRouter(tvetShortQuestions, tvetMCQQuestions, mcqSubmissions, shortSubmissions));

  // Diagnostics
  app.get('/', async (req, res) => {
    try {
      const [totalShort, totalMCQs, totalMcqSub, totalShortSub] = await Promise.all([
        tvetShortQuestions.countDocuments({}),
        tvetMCQQuestions.countDocuments({}),
        mcqSubmissions.countDocuments({}),
        shortSubmissions.countDocuments({})
      ]);
      
      res.send({
        status: "Universal Engine Online",
        diagnostics: { questions: { short: totalShort, mcq: totalMCQs }, submissions: { mcq: totalMcqSub, written: totalShortSub } }
      });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });
}

// Initialize routes
setupApp().catch(console.error);

// Export for Vercel
module.exports = serverless(app);