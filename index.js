const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// -----------------MongoDB Connections Starts here --------------------------------------------------------------------------------------------
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.c1krwnm.mongodb.net/?retryWrites=true&w=majority`;

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

    const mainCollection = client.db("ucepComputerTrade");

    // References to your established data collections
    const usersCollection = mainCollection.collection("users");
    const resultCollection = mainCollection.collection("answer");
    const questionCollection = mainCollection.collection("questionCollection");
    const answerCollection = mainCollection.collection("answerSheet");
    const motdCollection = mainCollection.collection("motd");

    // =========================================================================
    //  CLIENT ROUTE MATRIX GOES HERE 
    //  (Your decoupled routers can be mounted right here)
    // =========================================================================

    // Ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB successfully!");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}
run().catch(console.dir);
// -----------------MongoDB Connections Ends here ---------------------------------------------------------------------------------------------

// Core System Health Node
app.get('/', (req, res) => {
  res.send('Universal Engine Online');
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});