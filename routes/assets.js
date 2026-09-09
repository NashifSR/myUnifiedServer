const express = require("express");
const { randomUUID } = require("crypto");
const { ObjectId } = require("mongodb");
const multer = require("multer");

const createAssetsRouter = (
    assetsCollection,
    cloudinary
) => {
    const router = express.Router();

    // ============================================================
    // MULTER
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

        return {
            id: assetId,
        };
    };

    const normalizeEmail = (email) => {
        if (typeof email !== "string") {
            return null;
        }

        return email.toLowerCase().trim() || null;
    };

    /**
     * Parse JSON safely.
     */
    const parseJSON = (value, fallback = null) => {
        if (typeof value !== "string") {
            return value;
        }

        try {
            return JSON.parse(value);
        } catch {
            return fallback;
        }
    };

    /**
     * Parse the frontend's complete payload.
     *
     * Expected:
     *
     * {
     *     ownerEmail,
     *     ownerId,
     *     type,
     *     businessType,
     *     access,
     *     createdAt,
     *     updatedAt,
     *     data: {
     *         ...
     *     }
     * }
     */
    const parseAssetPayload = (value) => {
        let payload = parseJSON(value, null);

        if (
            !payload ||
            typeof payload !== "object" ||
            Array.isArray(payload)
        ) {
            return null;
        }

        return payload;
    };

    /**
     * Normalize access array.
     */
    const normalizeAccess = (access) => {
        access = parseJSON(access, access);

        if (!Array.isArray(access)) {
            return [];
        }

        return access
            .map((item) => ({
                email: normalizeEmail(
                    item?.email
                ),
                role:
                    item?.role ||
                    "viewer",
            }))
            .filter(
                (item) => item.email
            );
    };

    // ============================================================
    // CLOUDINARY
    // ============================================================

    /**
     * Upload one file to Cloudinary.
     *
     * The returned object is stored directly inside asset.data.
     */
    const uploadFile = async (
        file,
        assetId
    ) => {
        const base64 =
            file.buffer.toString("base64");

        const dataUri =
            `data:${file.mimetype};base64,${base64}`;

        const result =
            await cloudinary.uploader.upload(
                dataUri,
                {
                    folder:
                        `universalAssets/${assetId}`,
                    resource_type: "auto",
                }
            );

        return {
            provider: "cloudinary",
            url: result.secure_url,
            publicId: result.public_id,
            resourceType:
                result.resource_type,
            format:
                result.format || null,
            width:
                result.width || null,
            height:
                result.height || null,
        };
    };

    /**
     * Recursively find Cloudinary files.
     */
    const getCloudinaryFiles = (
        value,
        results = []
    ) => {
        if (
            !value ||
            typeof value !== "object"
        ) {
            return results;
        }

        // Array
        if (Array.isArray(value)) {
            value.forEach((item) => {
                getCloudinaryFiles(
                    item,
                    results
                );
            });

            return results;
        }

        // Cloudinary object
        if (
            value.provider === "cloudinary" &&
            value.publicId
        ) {
            results.push(value);
        }

        // Nested objects
        Object.values(value).forEach(
            (child) => {
                if (
                    child &&
                    typeof child === "object"
                ) {
                    getCloudinaryFiles(
                        child,
                        results
                    );
                }
            }
        );

        return results;
    };

    /**
     * Delete one Cloudinary file.
     */
    const deleteCloudinaryFile =
        async (file) => {
            if (!file?.publicId) {
                return;
            }

            try {
                await cloudinary.uploader.destroy(
                    file.publicId,
                    {
                        resource_type:
                            file.resourceType ||
                            "image",
                    }
                );
            } catch (error) {
                console.error(
                    "Cloudinary delete failed:",
                    file.publicId,
                    error.message
                );
            }
        };

    /**
     * Delete every Cloudinary file
     * referenced inside a value.
     */
    const deleteCloudinaryFiles =
        async (data) => {
            const files =
                getCloudinaryFiles(data);

            await Promise.all(
                files.map(
                    deleteCloudinaryFile
                )
            );
        };

    // ============================================================
    // PROCESS UPLOADED FILES
    // ============================================================

    /**
     * Upload all multipart files and place
     * their Cloudinary information into asset.data.
     *
     * One file:
     *
     * profileImage: {
     *     provider: "cloudinary",
     *     ...
     * }
     *
     * Multiple files:
     *
     * images: [
     *     {...},
     *     {...}
     * ]
     */
    const processFiles = async (
        data,
        files,
        assetId
    ) => {
        const result = {
            ...data,
        };

        if (!files?.length) {
            return result;
        }

        const groupedFiles = {};

        // --------------------------------------------------------
        // Group files by field name
        // --------------------------------------------------------

        for (const file of files) {
            if (
                !groupedFiles[
                file.fieldname
                ]
            ) {
                groupedFiles[
                    file.fieldname
                ] = [];
            }

            groupedFiles[
                file.fieldname
            ].push(file);
        }

        // --------------------------------------------------------
        // Upload every group
        // --------------------------------------------------------

        for (const [
            fieldName,
            fieldFiles,
        ] of Object.entries(
            groupedFiles
        )) {
            const uploadedFiles =
                await Promise.all(
                    fieldFiles.map(
                        (file) =>
                            uploadFile(
                                file,
                                assetId
                            )
                    )
                );

            result[fieldName] =
                uploadedFiles.length === 1
                    ? uploadedFiles[0]
                    : uploadedFiles;
        }

        return result;
    };

    // ============================================================
    // GET ALL - DEV
    // ============================================================

    router.get(
        "/devdata",
        async (req, res) => {
            try {
                const data =
                    await assetsCollection
                        .find({})
                        .toArray();

                res.json(data);
            } catch (error) {
                console.error(
                    "Get dev data failed:",
                    error
                );

                res.status(500).json({
                    error:
                        "Failed to fetch dev data.",
                });
            }
        }
    );

    // ============================================================
    // GET ALL ACCESSIBLE ASSETS
    // ============================================================

    router.get(
        "/data",
        async (req, res) => {
            try {
                const email =
                    normalizeEmail(
                        req.query.email
                    );

                const type =
                    req.query.type
                        ?.trim() || null;

                if (!email) {
                    return res.json([]);
                }

                const query = {
                    "access.email": email,
                };

                if (type) {
                    query.type = type;
                }

                const data =
                    await assetsCollection
                        .find(query)
                        .toArray();

                res.json(data);
            } catch (error) {
                console.error(
                    "Get assets failed:",
                    error
                );

                res.status(500).json({
                    error:
                        "Failed to fetch assets.",
                });
            }
        }
    );

    // ============================================================
    // GET ONE
    // ============================================================

    router.get(
        "/data/:id",
        async (req, res) => {
            try {
                const asset =
                    await assetsCollection.findOne(
                        buildIdQuery(
                            req.params.id
                        )
                    );

                if (!asset) {
                    return res.status(404).json({
                        error:
                            "Asset not found.",
                    });
                }

                const email =
                    normalizeEmail(
                        req.query.email
                    );

                if (!email) {
                    return res.status(403).json({
                        error:
                            "Email is required.",
                    });
                }

                const hasAccess =
                    Array.isArray(
                        asset.access
                    ) &&
                    asset.access.some(
                        (item) =>
                            normalizeEmail(
                                item?.email
                            ) === email
                    );

                if (!hasAccess) {
                    return res.status(403).json({
                        error:
                            "You do not have access to this asset.",
                    });
                }

                res.json(asset);
            } catch (error) {
                console.error(
                    "Get asset failed:",
                    error
                );

                res.status(500).json({
                    error:
                        "Failed to fetch asset.",
                });
            }
        }
    );

    // ============================================================
    // CREATE
    // ============================================================

    /**
     * Frontend sends:
     *
     * FormData
     *
     * data = {
     *     ownerEmail,
     *     ownerId,
     *     type,
     *     businessType,
     *     access,
     *     createdAt,
     *     updatedAt,
     *     data: {
     *         name,
     *         profileImage,
     *         ...
     *     }
     * }
     *
     * Plus actual uploaded files.
     */
    router.post(
        "/data",
        upload.any(),
        async (req, res) => {
            try {
                // ------------------------------------------------
                // Parse complete frontend payload
                // ------------------------------------------------

                const payload =
                    parseAssetPayload(
                        req.body.data
                    );

                if (!payload) {
                    return res.status(400).json({
                        error:
                            "Valid data payload is required.",
                    });
                }

                // ------------------------------------------------
                // Extract metadata
                // ------------------------------------------------

                const type =
                    payload.type;

                const ownerId =
                    payload.ownerId;

                const ownerEmail =
                    normalizeEmail(
                        payload.ownerEmail
                    );

                const businessType =
                    payload.businessType ||
                    null;

                // ------------------------------------------------
                // Validate required fields
                // ------------------------------------------------

                if (!type) {
                    return res.status(400).json({
                        error:
                            "Asset type is required.",
                    });
                }

                if (!ownerId) {
                    return res.status(400).json({
                        error:
                            "ownerId is required.",
                    });
                }

                // ------------------------------------------------
                // Parse access
                // ------------------------------------------------

                const access =
                    normalizeAccess(
                        payload.access
                    );

                // ------------------------------------------------
                // Extract actual asset data
                // ------------------------------------------------

                let assetData =
                    payload.data;

                if (
                    !assetData ||
                    typeof assetData !==
                    "object" ||
                    Array.isArray(assetData)
                ) {
                    assetData = {};
                }

                // ------------------------------------------------
                // Generate asset ID
                // ------------------------------------------------

                const assetId =
                    `asset_${randomUUID()}`;

                // ------------------------------------------------
                // Upload files
                // ------------------------------------------------

                const processedData =
                    await processFiles(
                        assetData,
                        req.files || [],
                        assetId
                    );

                // ------------------------------------------------
                // Create asset
                // ------------------------------------------------

                const now =
                    new Date().toISOString();

                const asset = {
                    id: assetId,

                    type,

                    ownerId,

                    ownerEmail,

                    businessType,

                    access,

                    data: processedData,

                    createdAt:
                        payload.createdAt ||
                        now,

                    updatedAt:
                        payload.updatedAt ||
                        now,
                };

                // ------------------------------------------------
                // Save
                // ------------------------------------------------

                await assetsCollection.insertOne(
                    asset
                );

                // ------------------------------------------------
                // Response
                // ------------------------------------------------

                res.status(201).json(
                    asset
                );
            } catch (error) {
                console.error(
                    "Create asset failed:",
                    error
                );

                res.status(500).json({
                    error:
                        "Failed to create asset.",
                });
            }
        }
    );

    // ============================================================
    // UPDATE
    // ============================================================

    /**
     * Update an asset.
     *
     * The frontend sends the same payload structure
     * as CREATE.
     *
     * Metadata is updated.
     * New files are uploaded.
     * Removed Cloudinary files are deleted.
     */
    router.patch(
        "/data/:id",
        upload.any(),
        async (req, res) => {
            try {
                const query =
                    buildIdQuery(
                        req.params.id
                    );

                // ------------------------------------------------
                // Find existing asset
                // ------------------------------------------------

                const asset =
                    await assetsCollection.findOne(
                        query
                    );

                if (!asset) {
                    return res.status(404).json({
                        error:
                            "Asset not found.",
                    });
                }

                // ------------------------------------------------
                // Parse complete frontend payload
                // ------------------------------------------------

                const payload =
                    parseAssetPayload(
                        req.body.data
                    );

                if (!payload) {
                    return res.status(400).json({
                        error:
                            "Valid data payload is required.",
                    });
                }

                // ------------------------------------------------
                // Extract metadata
                // ------------------------------------------------

                const type =
                    payload.type ??
                    asset.type;

                const ownerId =
                    payload.ownerId ??
                    asset.ownerId;

                const ownerEmail =
                    payload.ownerEmail !==
                        undefined
                        ? normalizeEmail(
                            payload.ownerEmail
                        )
                        : asset.ownerEmail;

                const businessType =
                    payload.businessType ??
                    asset.businessType ??
                    null;

                const access =
                    payload.access !==
                        undefined
                        ? normalizeAccess(
                            payload.access
                        )
                        : asset.access || [];

                // ------------------------------------------------
                // Validate required fields
                // ------------------------------------------------

                if (!type) {
                    return res.status(400).json({
                        error:
                            "Asset type is required.",
                    });
                }

                if (!ownerId) {
                    return res.status(400).json({
                        error:
                            "ownerId is required.",
                    });
                }

                // ------------------------------------------------
                // Extract actual asset data
                // ------------------------------------------------

                let assetData =
                    payload.data;

                if (
                    !assetData ||
                    typeof assetData !==
                    "object" ||
                    Array.isArray(assetData)
                ) {
                    return res.status(400).json({
                        error:
                            "data object is required.",
                    });
                }

                // ------------------------------------------------
                // Process new files
                // ------------------------------------------------

                const assetId =
                    asset.id ||
                    req.params.id;

                const processedData =
                    await processFiles(
                        assetData,
                        req.files || [],
                        assetId
                    );

                // ------------------------------------------------
                // Find old Cloudinary files
                // ------------------------------------------------

                const oldFiles =
                    getCloudinaryFiles(
                        asset.data
                    );

                // ------------------------------------------------
                // Find Cloudinary files that
                // remain in new data
                // ------------------------------------------------

                const newFiles =
                    getCloudinaryFiles(
                        processedData
                    );

                const newPublicIds =
                    new Set(
                        newFiles
                            .map(
                                (file) =>
                                    file.publicId
                            )
                            .filter(Boolean)
                    );

                // ------------------------------------------------
                // Delete removed Cloudinary files
                // ------------------------------------------------

                const filesToDelete =
                    oldFiles.filter(
                        (file) =>
                            file.publicId &&
                            !newPublicIds.has(
                                file.publicId
                            )
                    );

                await Promise.all(
                    filesToDelete.map(
                        deleteCloudinaryFile
                    )
                );

                // ------------------------------------------------
                // Update MongoDB
                // ------------------------------------------------

                const now =
                    new Date().toISOString();

                await assetsCollection.updateOne(
                    query,
                    {
                        $set: {
                            type,
                            ownerId,
                            ownerEmail,
                            businessType,
                            access,
                            data:
                                processedData,
                            updatedAt: now,
                        },
                    }
                );

                // ------------------------------------------------
                // Return updated asset
                // ------------------------------------------------

                const updatedAsset =
                    await assetsCollection.findOne(
                        query
                    );

                res.json(
                    updatedAsset
                );
            } catch (error) {
                console.error(
                    "Update asset failed:",
                    error
                );

                res.status(500).json({
                    error:
                        "Failed to update asset.",
                });
            }
        }
    );

    // ============================================================
    // DELETE
    // ============================================================

    /**
     * Delete an asset.
     *
     * 1. Find MongoDB asset
     * 2. Find Cloudinary files inside asset.data
     * 3. Delete Cloudinary files
     * 4. Delete MongoDB document
     */
    router.delete(
        "/data/:id",
        async (req, res) => {
            try {
                const query =
                    buildIdQuery(
                        req.params.id
                    );

                // ------------------------------------------------
                // Find asset
                // ------------------------------------------------

                const asset =
                    await assetsCollection.findOne(
                        query
                    );

                if (!asset) {
                    return res.status(404).json({
                        error:
                            "Asset not found.",
                    });
                }

                // ------------------------------------------------
                // Delete Cloudinary files
                // ------------------------------------------------

                await deleteCloudinaryFiles(
                    asset.data
                );

                // ------------------------------------------------
                // Delete MongoDB document
                // ------------------------------------------------

                await assetsCollection.deleteOne(
                    query
                );

                // ------------------------------------------------
                // Response
                // ------------------------------------------------

                res.json({
                    success: true,
                    id:
                        asset.id ||
                        req.params.id,
                });
            } catch (error) {
                console.error(
                    "Delete asset failed:",
                    error
                );

                res.status(500).json({
                    error:
                        "Failed to delete asset.",
                });
            }
        }
    );

    // ============================================================
    // RETURN ROUTER
    // ============================================================

    return router;
};

module.exports = createAssetsRouter;