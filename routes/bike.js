const express = require("express");
const { ObjectId } = require("mongodb");
const multer = require("multer");

module.exports = function createBikeRouter(db, cloudinary) {
  const router = express.Router();

  const galleryCollection = db.collection("gallery");

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
    },
  });

  // ==========================================================
  // GET GALLERY
  // GET /api/bike/gallery?folder=gallery
  // ==========================================================

  router.get("/gallery", async (req, res) => {
    try {
      const folder = req.query.folder || "gallery";

      const result = await cloudinary.search
        .expression(`folder:premiumBikeService/${folder}`)
        .sort_by("created_at", "desc")
        .max_results(500)
        .execute();

      res.json({
        success: true,
        folder,
        total: result.resources.length,
        images: result.resources,
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  });

  // ==========================================================
  // UPLOAD IMAGE
  // POST /api/bike/gallery/upload
  // ==========================================================

router.post(
  "/gallery/upload",
  upload.array("images", 10),
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No images uploaded.",
        });
      }

      const folder = req.body.folder || "gallery";
      const title = req.body.title || "";
      const description = req.body.description || "";

      const uploadResults = await Promise.all(
        req.files.map((file) =>
          cloudinary.uploader.upload(
            `data:${file.mimetype};base64,${file.buffer.toString("base64")}`,
            {
              folder: `premiumBikeService/${folder}`,

              // 👇 Set the Cloudinary display name
              display_name: title || undefined,

              // 👇 Optional: save description in Cloudinary
              context: description
                ? {
                    caption: description,
                  }
                : undefined,
            }
          )
        )
      );

      const documents = uploadResults.map((image) => ({
        title,
        description,
        folder,
        public_id: image.public_id,
        secure_url: image.secure_url,
        asset_id: image.asset_id,
        display_name: image.display_name,
        featured: false,
        order: 0,
        createdAt: new Date(),
      }));

      await galleryCollection.insertMany(documents);

      res.status(201).json({
        success: true,
        message: `${documents.length} image(s) uploaded successfully.`,
        images: uploadResults,
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }
);

  // ==========================================================
  // BULK DELETE
  // DELETE /api/bike/gallery
  // ==========================================================

  router.delete("/gallery", async (req, res) => {
    try {
      const { publicIds = [] } = req.body;

      if (!Array.isArray(publicIds) || !publicIds.length) {
        return res.status(400).json({
          success: false,
          message: "No images selected.",
        });
      }

      await cloudinary.api.delete_resources(publicIds);

      await galleryCollection.deleteMany({
        public_id: {
          $in: publicIds,
        },
      });

      res.json({
        success: true,
        deleted: publicIds.length,
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  });

  // ==========================================================
  // SINGLE DELETE
  // DELETE /api/bike/gallery/:id
  // ==========================================================

  router.delete("/gallery/:id", async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid ID.",
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

      await cloudinary.uploader.destroy(image.public_id);

      await galleryCollection.deleteOne({
        _id: image._id,
      });

      res.json({
        success: true,
        message: "Image deleted.",
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  });

  // ==========================================================
  // UPDATE METADATA
  // PATCH /api/bike/gallery/:id
  // ==========================================================

  router.patch("/gallery/:id", async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid ID.",
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

      res.json({
        success: true,
        modifiedCount: result.modifiedCount,
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  });

  return router;
};