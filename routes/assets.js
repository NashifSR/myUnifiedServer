const express = require("express");
const { randomUUID } = require("crypto");
const { ObjectId } = require("mongodb");
const multer = require("multer");

const createAssetsRouter = (assetsCollection, cloudinary) => {
    const router = express.Router();

    // ============================================================
    // MULTER CONFIGURATION
    // ============================================================

    const upload = multer({
        storage: multer.memoryStorage(),
        limits: {
            fileSize: 10 * 1024 * 1024, // 10 MB
        },
    });

    // ============================================================
    // HELPERS
    // ============================================================

    const buildIdQuery = (assetId) => {
        if (ObjectId.isValid(assetId)) {
            return {
                $or: [
                    { id: assetId },
                    { _id: new ObjectId(assetId) },
                ],
            };
        }

        return { id: assetId };
    };

    const normalizeEmail = (email) => {
        if (typeof email !== "string") return null;
        return email.toLowerCase().trim() || null;
    };

    /**
     * Parse JSON safely without throwing runtime syntax errors.
     */
    const parseJSON = (value, fallback = null) => {
        if (typeof value !== "string") return value;
        try {
            return JSON.parse(value);
        } catch {
            return fallback;
        }
    };

    /**
     * Parse and structure incoming request payload.
     */
    const parseAssetPayload = (value) => {
        let payload = parseJSON(value, null);

        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
            return null;
        }

        return payload;
    };

    /**
     * Normalize access rules array.
     */
    const normalizeAccess = (access) => {
        access = parseJSON(access, access);

        if (!Array.isArray(access)) return [];

        return access
            .map((item) => ({
                email: normalizeEmail(item?.email),
                role: (item?.role || "viewer").trim().toLowerCase(),
            }))
            .filter((item) => item.email);
    };

    // ============================================================
    // CLOUDINARY STORAGE
    // ============================================================

    /**
     * Upload buffer stream to Cloudinary using promise wrapper.
     */
    const uploadFile = async (file, assetId) => {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: `universalAssets/${assetId}`,
                    resource_type: "auto",
                },
                (error, result) => {
                    if (error) return reject(error);

                    resolve({
                        provider: "cloudinary",
                        url: result.secure_url,
                        publicId: result.public_id,
                        resourceType: result.resource_type,
                        format: result.format || null,
                        width: result.width || null,
                        height: result.height || null,
                    });
                }
            );

            uploadStream.end(file.buffer);
        });
    };

    /**
     * Recursively extract stored Cloudinary references from payload.
     */
    const getCloudinaryFiles = (value, results = []) => {
        if (!value || typeof value !== "object") return results;

        if (Array.isArray(value)) {
            value.forEach((item) => getCloudinaryFiles(item, results));
            return results;
        }

        if (value.provider === "cloudinary" && value.publicId) {
            results.push(value);
        }

        Object.values(value).forEach((child) => {
            if (child && typeof child === "object") {
                getCloudinaryFiles(child, results);
            }
        });

        return results;
    };

    /**
     * Single Cloudinary resource deletion wrapper.
     */
    const deleteCloudinaryFile = async (file) => {
        if (!file?.publicId) return;

        try {
            await cloudinary.uploader.destroy(file.publicId, {
                resource_type: file.resourceType || "image",
            });
        } catch (error) {
            console.error(
                "Cloudinary deletion failure:",
                file.publicId,
                error.message
            );
        }
    };

    /**
     * Delete all extracted Cloudinary references in payload.
     */
    const deleteCloudinaryFiles = async (data) => {
        const files = getCloudinaryFiles(data);
        await Promise.all(files.map(deleteCloudinaryFile));
    };

    // ============================================================
    // PROCESS UPLOADED FILES
    // ============================================================

    /**
     * Deep clones target object and assigns processed upload payload without mutation.
     */
    const processFiles = async (data, files, assetId) => {
        const result = JSON.parse(JSON.stringify(data || {}));

        if (!files?.length) return result;

        const groupedFiles = {};

        for (const file of files) {
            if (!groupedFiles[file.fieldname]) {
                groupedFiles[file.fieldname] = [];
            }
            groupedFiles[file.fieldname].push(file);
        }

        for (const [fieldName, fieldFiles] of Object.entries(groupedFiles)) {
            const uploadedFiles = await Promise.all(
                fieldFiles.map((file) => uploadFile(file, assetId))
            );

            result[fieldName] =
                uploadedFiles.length === 1 ? uploadedFiles[0] : uploadedFiles;
        }

        return result;
    };

    // ============================================================
    // ROUTE: GET ALL DEV DATA
    // ============================================================

    router.get("/devdata", async (req, res) => {
        try {
            const data = await assetsCollection.find({}).toArray();
            res.json(data);
        } catch (error) {
            console.error("Get dev data failed:", error);
            res.status(500).json({ error: "Failed to fetch dev data." });
        }
    });

    // ============================================================
    // ROUTE: GET ALL ACCESSIBLE ASSETS (DATABASE-LEVEL FILTERING)
    // ============================================================

    router.get("/data", async (req, res) => {
        try {
            const email = normalizeEmail(req.query.email);
            const type = req.query.type?.trim() || null;

            const queryConditions = [];

            // Public access condition
            queryConditions.push({
                access: {
                    $elemMatch: { email: "anyone", role: "anyone" },
                },
            });

            if (email) {
                // Logged-in baseline access condition
                queryConditions.push({
                    access: {
                        $elemMatch: { email: "user", role: "user" },
                    },
                });

                // Direct email specific authorization condition
                queryConditions.push({
                    access: {
                        $elemMatch: { email: email },
                    },
                });
            }

            const query = { $or: queryConditions };

            if (type && type !== "all") {
                query.type = type;
            }

            const assets = await assetsCollection.find(query).toArray();
            res.json(assets);
        } catch (error) {
            console.error("Get assets failed:", error);
            res.status(500).json({ error: "Failed to fetch assets." });
        }
    });

    // ============================================================
    // ROUTE: GET SINGLE ASSET
    // ============================================================

    router.get("/data/:id", async (req, res) => {
        try {
            const asset = await assetsCollection.findOne(
                buildIdQuery(req.params.id)
            );

            if (!asset) {
                return res.status(404).json({ error: "Asset not found." });
            }

            const email = normalizeEmail(req.query.email);

            const hasAccess =
                Array.isArray(asset.access) &&
                asset.access.some((item) => {
                    const accessEmail = normalizeEmail(item?.email);
                    const role = item?.role?.trim().toLowerCase();

                    if (accessEmail === "anyone" && role === "anyone") return true;
                    if (accessEmail === "user" && role === "user") return !!email;
                    return email && accessEmail === email;
                });

            if (!hasAccess) {
                return res.status(403).json({
                    error: "You do not have access to this asset.",
                });
            }

            res.json(asset);
        } catch (error) {
            console.error("Get asset failed:", error);
            res.status(500).json({ error: "Failed to fetch asset." });
        }
    });

    // ============================================================
    // ROUTE: CREATE ASSET
    // ============================================================

    router.post("/data", upload.any(), async (req, res) => {
        try {
            const payload = parseAssetPayload(req.body.data);

            if (!payload) {
                return res.status(400).json({
                    error: "Valid data payload is required.",
                });
            }

            const type = payload.type;
            const ownerId = payload.ownerId;
            const ownerEmail = normalizeEmail(payload.ownerEmail);
            const businessType = payload.businessType || null;

            if (!type) {
                return res.status(400).json({ error: "Asset type is required." });
            }

            if (!ownerId) {
                return res.status(400).json({ error: "ownerId is required." });
            }

            const access = normalizeAccess(payload.access);

            let assetData = payload.data;
            if (!assetData || typeof assetData !== "object" || Array.isArray(assetData)) {
                assetData = {};
            }

            const assetId = `asset_${randomUUID()}`;

            const processedData = await processFiles(
                assetData,
                req.files || [],
                assetId
            );

            const now = new Date().toISOString();

            const asset = {
                id: assetId,
                type,
                ownerId,
                ownerEmail,
                businessType,
                access,
                data: processedData,
                createdAt: payload.createdAt || now,
                updatedAt: payload.updatedAt || now,
            };

            await assetsCollection.insertOne(asset);

            res.status(201).json(asset);
        } catch (error) {
            console.error("Create asset failed:", error);
            res.status(500).json({ error: "Failed to create asset." });
        }
    });

    // ============================================================
    // ROUTE: UPDATE ASSET
    // ============================================================

    router.patch("/data/:id", upload.any(), async (req, res) => {
        try {
            const query = buildIdQuery(req.params.id);

            const asset = await assetsCollection.findOne(query);

            if (!asset) {
                return res.status(404).json({ error: "Asset not found." });
            }

            const payload = parseAssetPayload(req.body.data);

            if (!payload) {
                return res.status(400).json({
                    error: "Valid data payload is required.",
                });
            }

            const type = payload.type ?? asset.type;
            const ownerId = payload.ownerId ?? asset.ownerId;
            const ownerEmail =
                payload.ownerEmail !== undefined
                    ? normalizeEmail(payload.ownerEmail)
                    : asset.ownerEmail;

            const businessType =
                payload.businessType ?? asset.businessType ?? null;

            const access =
                payload.access !== undefined
                    ? normalizeAccess(payload.access)
                    : asset.access || [];

            if (!type) {
                return res.status(400).json({ error: "Asset type is required." });
            }

            if (!ownerId) {
                return res.status(400).json({ error: "ownerId is required." });
            }

            let assetData = payload.data;

            if (!assetData || typeof assetData !== "object" || Array.isArray(assetData)) {
                return res.status(400).json({ error: "data object is required." });
            }

            const assetId = asset.id || req.params.id;

            const processedData = await processFiles(
                assetData,
                req.files || [],
                assetId
            );

            const oldFiles = getCloudinaryFiles(asset.data);
            const newFiles = getCloudinaryFiles(processedData);

            const newPublicIds = new Set(
                newFiles.map((file) => file.publicId).filter(Boolean)
            );

            const filesToDelete = oldFiles.filter(
                (file) => file.publicId && !newPublicIds.has(file.publicId)
            );

            await Promise.all(filesToDelete.map(deleteCloudinaryFile));

            const now = new Date().toISOString();

            await assetsCollection.updateOne(query, {
                $set: {
                    type,
                    ownerId,
                    ownerEmail,
                    businessType,
                    access,
                    data: processedData,
                    updatedAt: now,
                },
            });

            const updatedAsset = await assetsCollection.findOne(query);

            res.json(updatedAsset);
        } catch (error) {
            console.error("Update asset failed:", error);
            res.status(500).json({ error: "Failed to update asset." });
        }
    });

    // ============================================================
    // ROUTE: DELETE ASSET
    // ============================================================

    router.delete("/data/:id", async (req, res) => {
        try {
            const query = buildIdQuery(req.params.id);

            const asset = await assetsCollection.findOne(query);

            if (!asset) {
                return res.status(404).json({ error: "Asset not found." });
            }

            // Cleanup associated Cloudinary assets stored in asset.data
            if (asset.data) {
                await deleteCloudinaryFiles(asset.data);
            }

            await assetsCollection.deleteOne(query);

            res.json({
                message: "Asset and associated files deleted successfully.",
                id: req.params.id,
            });
        } catch (error) {
            console.error("Delete asset failed:", error);
            res.status(500).json({ error: "Failed to delete asset." });
        }
    });

    return router;
};

module.exports = createAssetsRouter;