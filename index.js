const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();

const createTvetRouter = require('./routes/tvet');

app.use(cors());
app.use(express.json());

const user = process.env.DB_USER;
const pass = process.env.DB_PASS;

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
    await client.connect();
    console.log("Connected to MongoDB Gateway successfully!");

    const tvetDb = client.db("tvetDataBase");
    const tvetShortQuestions = tvetDb.collection("shortQuestionCollection");
    const tvetMCQQuestions = tvetDb.collection("multipleChoiceQuestionCollection");
    const mcqSubmissions = tvetDb.collection("mcqSubmissionCollection");
    const shortSubmissions = tvetDb.collection("shortSubmissionCollection");

    app.use('/api/tvet', createTvetRouter(tvetShortQuestions, tvetMCQQuestions, mcqSubmissions, shortSubmissions));

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
          tvetDiagnostics: { 
            questions: { shortQuestionsCount: totalShort, multipleChoiceQuestionsCount: totalMCQs }, 
            submissions: { mcqSubmissionsCount: totalMcqSub, writtenSubmissionsCount: totalShortSub } 
          }
        });
      } catch (error) {
        res.status(500).send({ status: "Engine Error", error: error.message });
      }
    });

    await client.db("admin").command({ ping: 1 });

    // Dynamic Port Logic: Passing 0 tells the OS to assign an available port.
    const server = app.listen(0, () => {
      const actualPort = server.address().port;
      console.log(`Server is running live on dynamic port: ${actualPort}`);
    });

  } catch (error) {
    console.error("Error connecting to MongoDB cluster matrix:", error);
  }
}

run().catch(console.dir);