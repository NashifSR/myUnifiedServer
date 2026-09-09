const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { MongoClient, ServerApiVersion } = require("mongodb");
const { v2: cloudinary } = require("cloudinary");
const createPaymentRouter = require("./routes/payment");

const createTvetRouter = require("./routes/tvet");
const createApiFixingRouter = require("./routes/apifixing");
const createBikeRouter = require("./routes/bike");
const createAssetsRouter = require("./routes/assets");

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

// ============================================================
// Cloudinary Configuration
// ============================================================

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

if (
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
) {
  console.log(
    `☁️ Cloudinary configured successfully (${process.env.CLOUDINARY_CLOUD_NAME})`
  );
} else {
  console.warn("⚠️ Cloudinary environment variables are missing.");
}

async function run() {
  try {
    await client.connect();
    console.log("Connected to MongoDB successfully!");

    // ============================================================
    // Databases
    // ============================================================

    const tvetDb = client.db("tvetDataBase");
    const premiumBikeServiceDb = client.db("premiumBikeWorkshop");
    const assetsDb = client.db("universalAssets"); // 👈 Moved up so it exists first!

    // ============================================================
    // Collections
    // ============================================================

    const paymentsCollection = assetsDb.collection("payments"); // 👈 Now safe to declare
    const assets = assetsDb.collection("assets");

    const tvetShortQuestions = tvetDb.collection("shortQuestionCollection");
    const tvetMCQQuestions = tvetDb.collection("multipleChoiceQuestionCollection");
    const tvetCourses = tvetDb.collection("courses");
    const mcqSubmissions = tvetDb.collection("mcqSubmissionCollection");
    const shortSubmissions = tvetDb.collection("shortSubmissionCollection");

    // ============================================================
    // Routes
    // ============================================================

    app.use(
      "/api/payment",
      createPaymentRouter(paymentsCollection, assets)
    );

    app.use(
      "/api/tvet",
      createTvetRouter(
        tvetShortQuestions,
        tvetMCQQuestions,
        tvetCourses,
        mcqSubmissions,
        shortSubmissions
      )
    );

    app.use(
      "/api/fix",
      createApiFixingRouter(tvetDb)
    );

    app.use(
      "/api/bike",
      createBikeRouter(
        premiumBikeServiceDb,
        cloudinary
      )
    );

    app.use(
      "/api/assets",
      createAssetsRouter(
        assets,
        cloudinary
      )
    );

    // ============================================================
    // Health Check
    // ============================================================

    app.get("/", async (req, res) => {
      try {
        const [
          totalShort,
          totalMCQs,
          totalCourses,
          totalMcqSub,
          totalShortSub,
          totalGallery,
          totalAssets,
          totalPayments,
        ] = await Promise.all([
          tvetShortQuestions.countDocuments(),
          tvetMCQQuestions.countDocuments(),
          tvetCourses.countDocuments(),
          mcqSubmissions.countDocuments(),
          shortSubmissions.countDocuments(),
          premiumBikeServiceDb
            .collection("gallery")
            .countDocuments(),
          assets.countDocuments(),
          paymentsCollection.countDocuments(),
        ]);

        res.json({
          status: "Universal Engine Online",

          databases: {
            tvet: "Connected",
            premiumBikeWorkshop: "Connected",
            universalAssets: "Connected",
            cloudinary: "Configured",
          },

          tvetDiagnostics: {
            questions: {
              shortQuestionsCount: totalShort,
              multipleChoiceQuestionsCount: totalMCQs,
              coursesCount: totalCourses,
            },

            submissions: {
              mcqSubmissionsCount: totalMcqSub,
              writtenSubmissionsCount: totalShortSub,
            },
          },

          bikeWorkshop: {
            galleryImages: totalGallery,
          },

          universalAssets: {
            assetsCount: totalAssets,
            paymentsCount: totalPayments,
          },
        });
      } catch (err) {
        res.status(500).json({
          status: "Engine Error",
          error: err.message,
        });
      }
    });

    await client.db("admin").command({ ping: 1 });

    console.log("MongoDB ping successful");

    app.listen(PORT, () => {
      console.log(
        `🚀 Server running on port ${PORT}`
      );
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

process.on("SIGINT", async () => {
  await client.close();

  console.log(
    "MongoDB connection closed"
  );

  process.exit(0);
});