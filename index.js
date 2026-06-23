const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { MongoClient, ServerApiVersion } = require('mongodb');
const createTvetRouter = require('./routes/tvet');

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

const user = process.env.DB_USER;
const pass = process.env.DB_PASS;

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

    console.log("Connected to MongoDB successfully!");

    const tvetDb = client.db("tvetDataBase");

    const tvetShortQuestions =
      tvetDb.collection("shortQuestionCollection");

    const tvetMCQQuestions =
      tvetDb.collection("multipleChoiceQuestionCollection");

    const mcqSubmissions =
      tvetDb.collection("mcqSubmissionCollection");

    const shortSubmissions =
      tvetDb.collection("shortSubmissionCollection");


    // Routes
    app.use(
      "/api/tvet",
      createTvetRouter(
        tvetShortQuestions,
        tvetMCQQuestions,
        mcqSubmissions,
        shortSubmissions
      )
    );


    // Health check
    app.get("/", async (req, res) => {
      try {

        const [
          totalShort,
          totalMCQs,
          totalMcqSub,
          totalShortSub
        ] = await Promise.all([
          tvetShortQuestions.countDocuments(),
          tvetMCQQuestions.countDocuments(),
          mcqSubmissions.countDocuments(),
          shortSubmissions.countDocuments()
        ]);


        res.json({
          status: "Universal Engine Online",

          tvetDiagnostics: {
            questions: {
              shortQuestionsCount: totalShort,
              multipleChoiceQuestionsCount: totalMCQs
            },

            submissions: {
              mcqSubmissionsCount: totalMcqSub,
              writtenSubmissionsCount: totalShortSub
            }
          }
        });


      } catch (err) {

        res.status(500).json({
          status: "Engine Error",
          error: err.message
        });

      }
    });


    await client.db("admin").command({ ping: 1 });

    console.log("MongoDB ping successful");


    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });


  } catch (error) {

    console.error(
      "MongoDB connection failed:",
      error
    );

    process.exit(1);
  }
}


run();


// graceful shutdown
process.on("SIGINT", async () => {

  await client.close();

  console.log("MongoDB connection closed");

  process.exit(0);
});