const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 5000;

// Import the decoupled TVET router engine
const createTvetRouter = require('./routes/tvet');

// Middleware
app.use(cors());
app.use(express.json());

const user = process.env.DB_USER;
const pass = process.env.DB_PASS;

// -----------------MongoDB Connections Starts here --------------------------------------------------------------------------------------------
const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = `mongodb+srv://${user}:${pass}@cluster0.saudl8t.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server
    await client.connect();
    console.log("Connected to MongoDB Gateway successfully!");

    // =========================================================================
    //  1. TVET MANAGEMENT RESOURCE NODE & COLLECTIONS
    // =========================================================================
    const tvetDb = client.db("tvetDataBase");
    
    // Core Question Collections
    const tvetShortQuestions = tvetDb.collection("shortQuestionCollection");
    const tvetMCQQuestions = tvetDb.collection("multipleChoiceQuestionCollection");

    // Completely Split Student Submission Collections
    const mcqSubmissions = tvetDb.collection("mcqSubmissionCollection");
    const shortSubmissions = tvetDb.collection("shortSubmissionCollection");

    // =========================================================================
    //  2. CLIENT ROUTE ROUTING GATEWAYS (Passing all 4 collection references)
    // =========================================================================
    app.use('/api/tvet', createTvetRouter(tvetShortQuestions, tvetMCQQuestions, mcqSubmissions, shortSubmissions));

    // =========================================================================
    //  3. LIVE DIAGNOSTIC ROOT ROUTE 
    // =========================================================================
    app.get('/', async (req, res) => {
      try {
        const totalShortQuestions = await tvetShortQuestions.countDocuments({});
        const totalMCQs = await tvetMCQQuestions.countDocuments({});
        const totalMcqSubmissions = await mcqSubmissions.countDocuments({});
        const totalShortSubmissions = await shortSubmissions.countDocuments({});
        
        res.send({
          status: "Universal Engine Online",
          tvetDiagnostics: { 
            questions: {
              shortQuestionsCount: totalShortQuestions,
              multipleChoiceQuestionsCount: totalMCQs
            },
            submissions: {
              mcqSubmissionsCount: totalMcqSubmissions,
              writtenSubmissionsCount: totalShortSubmissions
            }
          }
        });
      } catch (error) {
        res.status(500).send({ status: "Engine Error", error: error.message });
      }
    });

    // Ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
  } catch (error) {
    console.error("Error connecting to MongoDB cluster matrix:", error);
  }
}
run().catch(console.dir);
// -----------------MongoDB Connections Ends here ---------------------------------------------------------------------------------------------

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});