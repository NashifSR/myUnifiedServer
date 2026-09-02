const express = require("express");
const { randomUUID } = require("crypto");
const { ObjectId } = require("mongodb");

const createAssetsRouter = (assetsCollection) => {
    const router = express.Router();

    // Helper function to build a flexible query for either string 'id' or native '_id'
    const buildIdQuery = (assetId) => {
        if (ObjectId.isValid(assetId)) {
            return {
                $or: [
                    { id: assetId },
                    { _id: new ObjectId(assetId) }
                ]
            };
        }
        return { id: assetId };
    };

    // ============================================================
    // GET ALL ASSETS (DEV)
    // ============================================================

    router.get("/devdata", async (req, res) => {
        console.group("🔥 [GET /api/assets/devdata] HIT");
        try {
            const assets = await assetsCollection.find({}).toArray();
            console.log("Total assets fetched:", assets.length);
            console.groupEnd();
            res.json(assets);
        } catch (error) {
            console.error("Error fetching devdata:", error);
            console.groupEnd();
            res.json([]);
        }
    });

    // ============================================================
    // GET ALL ASSETS (BY EMAIL)
    // ============================================================

    router.get("/data", async (req, res) => {
        const { email } = req.query;
        console.group("🔥 [GET /api/assets/data] HIT");
        console.log("Query Email Received:", email);

        try {
            if (!email) {
                console.log("⚠️ No email provided, returning empty array.");
                console.groupEnd();
                return res.json([]);
            }

            const query = { ownerEmail: email };
            const assets = await assetsCollection.find(query).toArray();
            
            console.log(`✅ Found ${assets.length} assets for email: ${email}`);
            console.groupEnd();

            res.json(assets);
        } catch (error) {
            console.error("❌ Error in GET /api/assets/data:", error);
            console.groupEnd();
            res.json([]);
        }
    });

    // ============================================================
    // GET SINGLE ASSET
    // ============================================================

    router.get("/data/:id", async (req, res) => {
        const assetId = req.params.id;
        console.group(`🔥 [GET /api/assets/data/${assetId}] HIT`);

        try {
            const query = buildIdQuery(assetId);
            const asset = await assetsCollection.findOne(query);

            if (!asset) {
                console.log("⚠️ Asset not found with ID:", assetId);
                console.groupEnd();
                return res.status(404).json({ error: "Asset not found." });
            }

            console.log("✅ Asset found:", asset.type);
            console.groupEnd();
            res.json(asset);
        } catch (error) {
            console.error("❌ Error in GET /api/assets/data/:id:", error);
            console.groupEnd();
            res.status(500).json({ error: "Failed to fetch asset." });
        }
    });

    // ============================================================
    // CREATE ASSET (POST)
    // ============================================================

    router.post("/data", async (req, res) => {
        console.group("🔥 [POST /api/assets/data] HIT");
        console.log("Request Body Received:", req.body);

        try {
            const asset = req.body;

            if (!asset.type) {
                console.log("⚠️ Validation failed: Missing type.");
                console.groupEnd();
                return res.status(400).json({ error: "Asset type is required." });
            }

            if (!asset.ownerId) {
                console.log("⚠️ Validation failed: Missing ownerId.");
                console.groupEnd();
                return res.status(400).json({ error: "ownerId is required." });
            }

            const now = new Date().toISOString();

            const newAsset = {
                id: asset.id || `asset_${randomUUID()}`,
                type: asset.type,
                ownerId: asset.ownerId,
                ownerEmail: asset.ownerEmail || null,
                businessType: asset.businessType || null,
                access: asset.access || [],
                data: asset.data || {},
                createdAt: now,
                updatedAt: now,
            };

            await assetsCollection.insertOne(newAsset);
            console.log("✅ Asset successfully created with ID:", newAsset.id);
            console.groupEnd();

            res.status(201).json(newAsset);
        } catch (error) {
            console.error("❌ Error in POST /api/assets/data:", error);
            console.groupEnd();
            res.status(500).json({ error: "Failed to create asset." });
        }
    });

    // ============================================================
    // UPDATE ASSET (PATCH)
    // ============================================================

    router.patch("/data/:id", async (req, res) => {
        const assetId = req.params.id;
        console.group(`🔥 [PATCH /api/assets/data/${assetId}] HIT`);
        console.log("Update Payload Received:", req.body);

        try {
            const updates = { ...req.body };

            // Protect immutable fields
            delete updates._id;
            delete updates.id;
            delete updates.createdAt;

            updates.updatedAt = new Date().toISOString();

            const query = buildIdQuery(assetId);

            const result = await assetsCollection.updateOne(
                query,
                { $set: updates }
            );

            if (result.matchedCount === 0) {
                console.log("⚠️ Asset not found for update with ID:", assetId);
                console.groupEnd();
                return res.status(404).json({ error: "Asset not found." });
            }

            const updatedAsset = await assetsCollection.findOne(query);
            console.log("✅ Asset successfully updated:", assetId);
            console.groupEnd();

            res.json(updatedAsset);
        } catch (error) {
            console.error(`❌ Error in PATCH /api/assets/data/${assetId}:`, error);
            console.groupEnd();
            res.status(500).json({ error: "Failed to update asset." });
        }
    });

    // ============================================================
    // DELETE ASSET
    // ============================================================

    router.delete("/data/:id", async (req, res) => {
        const assetId = req.params.id;
        console.group(`🔥 [DELETE /api/assets/data/${assetId}] HIT`);

        try {
            const query = buildIdQuery(assetId);
            const result = await assetsCollection.deleteOne(query);

            if (result.deletedCount === 0) {
                console.log("⚠️ Asset not found for deletion with ID:", assetId);
                console.groupEnd();
                return res.status(404).json({ error: "Asset not found." });
            }

            console.log("✅ Asset successfully deleted:", assetId);
            console.groupEnd();

            res.json({
                success: true,
                id: assetId,
            });
        } catch (error) {
            console.error(`❌ Error in DELETE /api/assets/data/${assetId}:`, error);
            console.groupEnd();
            res.status(500).json({ error: "Failed to delete asset." });
        }
    });

    return router;
};

module.exports = createAssetsRouter;