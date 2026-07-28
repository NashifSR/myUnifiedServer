const express = require("express");
const { ObjectId } = require("mongodb");

module.exports = function createBikeRouter(db, cloudinary) {
  const router = express.Router();

  // ==========================================================
  // Collections
  // ==========================================================

  const galleryCollection = db.collection("gallery");

  // ==========================================================
  // GET ALL IMAGES FROM CLOUDINARY (Testing)
  // GET /api/bike/cloudinary
  // ==========================================================

router.get("/gallery", async (req, res) => {
  try {
    const folder = req.query.folder || "gallery";

    const result = await cloudinary.search
      .expression(`folder:premiumBikeService/${folder}`)
    //   .expression(`folder:folder:${folder}`)
      .sort_by("created_at", "desc")
      .max_results(100)
      .execute();

    res.json({
      success: true,
      folder,
      total: result.total_count,
      images: result.resources,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
});

  // ==========================================================
  // GET ALL GALLERY IMAGES
  // GET /api/bike/gallery
  // ==========================================================

  router.get("/gallery", async (req, res) => {
    try {
      const images = await galleryCollection
        .find({})
        .sort({ createdAt: -1 })
        .toArray();

      res.status(200).json(images);
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  });

  // ==========================================================
  // GET SINGLE IMAGE
  // GET /api/bike/gallery/:id
  // ==========================================================

  router.get("/gallery/:id", async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid image ID.",
        });
      }

      const image = await galleryCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!image) {
        return res.status(404).json({
          success: false,
          message: "Image not found.",
        });
      }

      res.status(200).json(image);
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  });

  // ==========================================================
  // CREATE IMAGE
  // POST /api/bike/gallery
  // ==========================================================

  router.post("/gallery", async (req, res) => {
    try {
      const {
        title = "",
        description = "",
        image,
        featured = false,
      } = req.body;

      if (!image) {
        return res.status(400).json({
          success: false,
          message: "Image URL is required.",
        });
      }

      const document = {
        title,
        description,
        image,
        featured,
        createdAt: new Date(),
        updatedAt: null,
      };

      const result = await galleryCollection.insertOne(document);

      res.status(201).json({
        success: true,
        insertedId: result.insertedId,
        message: "Image created successfully.",
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  });

  // ==========================================================
  // UPDATE IMAGE
  // PATCH /api/bike/gallery/:id
  // ==========================================================

  router.patch("/gallery/:id", async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid image ID.",
        });
      }

      const result = await galleryCollection.updateOne(
        {
          _id: new ObjectId(id),
        },
        {
          $set: {
            ...req.body,
            updatedAt: new Date(),
          },
        }
      );

      if (!result.matchedCount) {
        return res.status(404).json({
          success: false,
          message: "Image not found.",
        });
      }

      res.status(200).json({
        success: true,
        modifiedCount: result.modifiedCount,
        message: "Image updated successfully.",
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  });

  // ==========================================================
  // DELETE IMAGE
  // DELETE /api/bike/gallery/:id
  // ==========================================================

  router.delete("/gallery/:id", async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid image ID.",
        });
      }

      const result = await galleryCollection.deleteOne({
        _id: new ObjectId(id),
      });

      if (!result.deletedCount) {
        return res.status(404).json({
          success: false,
          message: "Image not found.",
        });
      }

      res.status(200).json({
        success: true,
        deletedCount: result.deletedCount,
        message: "Image deleted successfully.",
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  });

  return router;
}