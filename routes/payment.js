const express = require("express");

const SSLCommerzPayment = require("sslcommerz-lts");

const { ObjectId } = require("mongodb");

const createPaymentRouter = (
    paymentsCollection,
    assetsCollection
) => {

    const router = express.Router();

    // ============================================================
    // SSLCommerz callbacks use application/x-www-form-urlencoded
    // ============================================================

    router.use(
        express.urlencoded({
            extended: true,
        })
    );

    // ============================================================
    // SSLCommerz Configuration
    // ============================================================

    const store_id =
        process.env.SSL_STORE_ID?.trim();

    const store_passwd =
        process.env.SSL_STORE_PASSWORD?.trim();

    // false = sandbox
    // true = live

    const is_live = false;

    // ============================================================
    // URLs
    // ============================================================

    const FRONTEND_URL =
        process.env.FRONTEND_URL?.replace(
            /\/$/,
            ""
        ) ||
        "http://localhost:5173";

    const BACKEND_URL =
        process.env.BACKEND_URL?.replace(
            /\/$/,
            ""
        ) ||
        "http://localhost:5000";

    // ============================================================
    // Configuration Log
    // ============================================================

    console.log(
        "\n========================================"
    );

    console.log(
        "🔐 SSLCommerz Configuration"
    );

    console.log(
        "========================================"
    );

    console.log(
        "🏪 Store ID:",
        store_id || "MISSING"
    );

    console.log(
        "🔑 Password configured:",
        !!store_passwd
    );

    console.log(
        "🌐 Environment:",
        is_live
            ? "LIVE"
            : "SANDBOX"
    );

    console.log(
        "🖥️ Frontend URL:",
        FRONTEND_URL
    );

    console.log(
        "⚙️ Backend URL:",
        BACKEND_URL
    );

    // ============================================================
    // Helper
    // Validate payment with SSLCommerz
    // ============================================================

    const validatePayment = async (
        payment,
        gatewayData
    ) => {

        if (
            !store_id ||
            !store_passwd
        ) {
            throw new Error(
                "SSLCommerz credentials are not configured."
            );
        }

        const sslcz =
            new SSLCommerzPayment(
                store_id,
                store_passwd,
                is_live
            );

        const validationResponse =
            await sslcz.validate(
                gatewayData
            );

        console.log(
            "🔍 SSLCommerz validation response:",
            validationResponse
        );

        const validationStatus =
            validationResponse?.status;

        const validatedAmount =
            Number(
                validationResponse?.amount
            );

        const storedAmount =
            Number(
                payment.amount
            );

        const amountMatches =
            Number.isFinite(
                validatedAmount
            ) &&
            Number.isFinite(
                storedAmount
            ) &&
            validatedAmount ===
                storedAmount;

        const statusValid =
            validationStatus === "VALID" ||
            validationStatus === "VALIDATED";

        // --------------------------------------------------------
        // Validate transaction ID
        // --------------------------------------------------------

        const gatewayTranId =
            gatewayData?.tran_id ||
            validationResponse?.tran_id ||
            null;

        const transactionMatches =
            gatewayTranId ===
            payment.tran_id;

        // --------------------------------------------------------
        // Validate currency
        // --------------------------------------------------------

        const gatewayCurrency = (
            validationResponse?.currency ||
            gatewayData?.currency ||
            ""
        )
            .toString()
            .trim()
            .toUpperCase();

        const storedCurrency = (
            payment.currency ||
            "BDT"
        )
            .toString()
            .trim()
            .toUpperCase();

        const currencyMatches =
            gatewayCurrency ===
            storedCurrency;

        return {
            valid:
                statusValid &&
                amountMatches &&
                transactionMatches &&
                currencyMatches,

            validationResponse,

            validationStatus,

            validatedAmount,

            storedAmount,

            amountMatches,

            gatewayTranId,

            transactionMatches,

            gatewayCurrency,

            storedCurrency,

            currencyMatches,
        };
    };

    // ============================================================
    // Helper
    // Mark payment as successful
    // ============================================================

    const markPaymentSuccessful = async (
        payment,
        gatewayData,
        validationResponse
    ) => {

        // ----------------------------------------------------------
        // Already completed
        // ----------------------------------------------------------

        if (
            payment.status === "SUCCESS" &&
            payment.purchaseStatus === "PURCHASED"
        ) {

            console.log(
                `ℹ️ Payment already completed: ${payment.tran_id}`
            );

            return;
        }

        const now =
            new Date();

        await paymentsCollection.updateOne(
            {
                tran_id:
                    payment.tran_id,
            },
            {
                $set: {
                    status:
                        "SUCCESS",

                    purchaseStatus:
                        "PURCHASED",

                    val_id:
                        gatewayData?.val_id ||
                        validationResponse?.val_id ||
                        null,

                    customerEmail:
                        validationResponse?.cus_email ||
                        payment.customer?.email ||
                        null,

                    currency:
                        validationResponse?.currency ||
                        payment.currency ||
                        "BDT",

                    validationResponse,

                    gatewayResponse:
                        gatewayData,

                    paidAt:
                        payment.paidAt ||
                        now,

                    purchasedAt:
                        payment.purchasedAt ||
                        now,

                    updatedAt:
                        now,
                },
            }
        );

        console.log(
            `🛒 Purchase recorded: ${payment.tran_id}`
        );

        console.log(
            "📦 Purchased items:",
            payment.items
        );
    };

    // ============================================================
    // Purchase History
    //
    // GET /api/payment/my-purchases
    // ============================================================

    router.get(
        "/my-purchases",
        async (req, res) => {

            try {

                const email =
                    req.query.email
                        ?.trim()
                        .toLowerCase();

                if (!email) {

                    return res.status(400).json({
                        success: false,
                        error:
                            "Customer email is required.",
                    });
                }

                const payments =
                    await paymentsCollection
                        .find({
                            customerEmail:
                                email,

                            status:
                                "SUCCESS",

                            purchaseStatus:
                                "PURCHASED",
                        })
                        .sort({
                            purchasedAt:
                                -1,
                        })
                        .toArray();

                return res.status(200).json({

                    success: true,

                    purchases:
                        payments.map(
                            (payment) => ({
                                tran_id:
                                    payment.tran_id,

                                amount:
                                    payment.amount,

                                currency:
                                    payment.currency,

                                items:
                                    payment.items ||
                                    [],

                                customer:
                                    payment.customer ||
                                    null,

                                paidAt:
                                    payment.paidAt,

                                purchasedAt:
                                    payment.purchasedAt,

                                createdAt:
                                    payment.createdAt,
                            })
                        ),
                });

            } catch (error) {

                console.error(
                    "GET PURCHASES ERROR:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    error:
                        "Failed to fetch purchases.",
                });
            }
        }
    );

    // ============================================================
    // INIT PAYMENT
    //
    // POST /api/payment/init
    // ============================================================

    router.post(
        "/init",
        async (req, res) => {

            try {

                console.log(
                    "\n========================================"
                );

                console.log(
                    "💳 SSLCommerz Payment Initialization"
                );

                console.log(
                    "========================================"
                );

                console.log(
                    "📥 Frontend request:",
                    req.body
                );

                const {
                    items,
                    customer,
                } = req.body;

                // --------------------------------------------------------
                // Validate items
                // --------------------------------------------------------

                if (
                    !Array.isArray(items) ||
                    items.length === 0
                ) {

                    return res.status(400).json({
                        success: false,
                        error:
                            "Payment items are required.",
                    });
                }

                // --------------------------------------------------------
                // Validate credentials
                // --------------------------------------------------------

                if (
                    !store_id ||
                    !store_passwd
                ) {

                    console.error(
                        "❌ SSLCommerz credentials are missing."
                    );

                    return res.status(500).json({
                        success: false,
                        error:
                            "SSLCommerz credentials are not configured on the server.",
                    });
                }

                // --------------------------------------------------------
                // Resolve items from MongoDB
                //
                // NEVER trust prices from the frontend.
                // --------------------------------------------------------

                const resolvedItems = [];

                for (
                    const cartItem of items
                ) {

                    const {
                        itemId,
                        quantity,
                    } = cartItem;

                    // ------------------------------------------------------
                    // Validate item ID
                    // ------------------------------------------------------

                    if (!itemId) {

                        return res.status(400).json({
                            success: false,
                            error:
                                "Each payment item requires an itemId.",
                        });
                    }

                    // ------------------------------------------------------
                    // Validate quantity
                    // ------------------------------------------------------

                    const itemQuantity =
                        Number(
                            quantity || 1
                        );

                    if (
                        !Number.isInteger(
                            itemQuantity
                        ) ||
                        itemQuantity <= 0
                    ) {

                        return res.status(400).json({
                            success: false,
                            error:
                                `Invalid quantity for item: ${itemId}`,
                        });
                    }

                    // ------------------------------------------------------
                    // Find by custom asset ID
                    // ------------------------------------------------------

                    let asset =
                        await assetsCollection.findOne({
                            id:
                                itemId,
                        });

                    // ------------------------------------------------------
                    // Find by MongoDB ObjectId
                    // ------------------------------------------------------

                    if (
                        !asset &&
                        ObjectId.isValid(
                            itemId
                        )
                    ) {

                        asset =
                            await assetsCollection.findOne({
                                _id:
                                    new ObjectId(
                                        itemId
                                    ),
                            });
                    }

                    // ------------------------------------------------------
                    // Item not found
                    // ------------------------------------------------------

                    if (!asset) {

                        return res.status(404).json({
                            success: false,
                            error:
                                `Item not found: ${itemId}`,
                        });
                    }

                    // ------------------------------------------------------
                    // Only packages can be purchased
                    // ------------------------------------------------------

                    if (
                        asset.type !==
                        "package"
                    ) {

                        return res.status(400).json({
                            success: false,
                            error:
                                `Item is not a purchasable package: ${itemId}`,
                        });
                    }

                    // ------------------------------------------------------
                    // Authoritative price
                    // ------------------------------------------------------

                    const amount =
                        Number(
                            asset.data?.amount ||
                            0
                        );

                    if (
                        !Number.isFinite(
                            amount
                        ) ||
                        amount <= 0
                    ) {

                        return res.status(400).json({
                            success: false,
                            error:
                                `Item has an invalid price: ${itemId}`,
                        });
                    }

                    // ------------------------------------------------------
                    // Item snapshot
                    // ------------------------------------------------------

                    const resolvedItemId =
                        asset.id ||
                        asset._id?.toString();

                    resolvedItems.push({

                        itemId:
                            resolvedItemId,

                        assetId:
                            resolvedItemId,

                        type:
                            asset.type ||
                            null,

                        name:
                            asset.data?.name ||
                            "Unnamed Item",

                        unitAmount:
                            amount,

                        quantity:
                            itemQuantity,

                        total:
                            amount *
                            itemQuantity,
                    });
                }

                // --------------------------------------------------------
                // Calculate authoritative total
                // --------------------------------------------------------

                const totalAmount =
                    resolvedItems.reduce(
                        (
                            total,
                            item
                        ) =>
                            total +
                            item.total,
                        0
                    );

                console.log(
                    "💰 Calculated total:",
                    totalAmount
                );

                // --------------------------------------------------------
                // Amount limits
                // --------------------------------------------------------

                if (
                    totalAmount < 10
                ) {

                    return res.status(400).json({
                        success: false,
                        error:
                            "Minimum SSLCommerz payment amount is BDT 10.",
                    });
                }

                if (
                    totalAmount > 500000
                ) {

                    return res.status(400).json({
                        success: false,
                        error:
                            "Maximum SSLCommerz payment amount is BDT 500,000.",
                    });
                }

                // --------------------------------------------------------
                // Generate transaction ID
                // --------------------------------------------------------

                const tran_id =
                    `TXN_${Date.now()}_${Math.random()
                        .toString(36)
                        .substring(
                            2,
                            8
                        )
                        .toUpperCase()}`;

                // --------------------------------------------------------
                // Customer
                // --------------------------------------------------------

                const cus_name =
                    customer?.name ||
                    "Customer";

                const cus_email =
                    customer?.email ||
                    "customer@example.com";

                const cus_phone =
                    customer?.phone ||
                    "01700000000";

                // --------------------------------------------------------
                // SSLCommerz request
                // --------------------------------------------------------

                const data = {

                    total_amount:
                        totalAmount.toFixed(
                            2
                        ),

                    currency:
                        "BDT",

                    tran_id,

                    success_url:
                        `${BACKEND_URL}/api/payment/success/${tran_id}`,

                    fail_url:
                        `${BACKEND_URL}/api/payment/fail/${tran_id}`,

                    cancel_url:
                        `${BACKEND_URL}/api/payment/cancel/${tran_id}`,

                    ipn_url:
                        `${BACKEND_URL}/api/payment/ipn`,

                    shipping_method:
                        "NO",

                    product_name:
                        resolvedItems
                            .map(
                                (item) =>
                                    item.name
                            )
                            .join(", ")
                            .substring(
                                0,
                                255
                            ),

                    product_category:
                        "Website Package",

                    product_profile:
                        "general",

                    cus_name,

                    cus_email,

                    cus_add1:
                        "Dhaka",

                    cus_add2:
                        "Dhaka",

                    cus_city:
                        "Dhaka",

                    cus_state:
                        "Dhaka",

                    cus_postcode:
                        "1000",

                    cus_country:
                        "Bangladesh",

                    cus_phone,

                    cus_fax:
                        "",
                };

                console.log(
                    "📤 Sending request to SSLCommerz..."
                );

                // --------------------------------------------------------
                // Initialize SSLCommerz
                // --------------------------------------------------------

                const sslcz =
                    new SSLCommerzPayment(
                        store_id,
                        store_passwd,
                        is_live
                    );

                const apiResponse =
                    await sslcz.init(
                        data
                    );

                console.log(
                    "📥 SSLCommerz response:",
                    apiResponse
                );

                // --------------------------------------------------------
                // Empty response
                // --------------------------------------------------------

                if (!apiResponse) {

                    return res.status(502).json({
                        success: false,
                        error:
                            "Empty response received from SSLCommerz.",
                    });
                }

                // --------------------------------------------------------
                // SSLCommerz rejected
                // --------------------------------------------------------

                if (
                    apiResponse.status !==
                    "SUCCESS"
                ) {

                    console.error(
                        "❌ SSLCommerz rejected payment initialization."
                    );

                    console.error(
                        "Status:",
                        apiResponse.status
                    );

                    console.error(
                        "Reason:",
                        apiResponse.failedreason
                    );

                    return res.status(400).json({
                        success: false,
                        error:
                            apiResponse.failedreason ||
                            "SSLCommerz rejected the payment request.",

                        status:
                            apiResponse.status,
                    });
                }

                // --------------------------------------------------------
                // Gateway URL
                // --------------------------------------------------------

                const gatewayUrl =
                    apiResponse.GatewayPageURL ||
                    apiResponse.redirectGatewayURL;

                if (!gatewayUrl) {

                    return res.status(502).json({
                        success: false,
                        error:
                            "SSLCommerz did not return a payment gateway URL.",
                    });
                }

                // --------------------------------------------------------
                // Save pending payment
                // --------------------------------------------------------

                const now =
                    new Date();

                await paymentsCollection.insertOne({

                    tran_id,

                    amount:
                        totalAmount,

                    currency:
                        "BDT",

                    items:
                        resolvedItems,

                    customer: {

                        name:
                            cus_name,

                        email:
                            cus_email,

                        phone:
                            cus_phone,
                    },

                    status:
                        "PENDING",

                    purchaseStatus:
                        "PENDING",

                    sessionkey:
                        apiResponse.sessionkey ||
                        null,

                    createdAt:
                        now,

                    updatedAt:
                        now,
                });

                console.log(
                    "💾 Payment saved as PENDING."
                );

                // --------------------------------------------------------
                // Return gateway URL
                // --------------------------------------------------------

                return res.status(200).json({

                    success:
                        true,

                    url:
                        gatewayUrl,

                    tran_id,

                    amount:
                        totalAmount,

                    items:
                        resolvedItems,
                });

            } catch (error) {

                console.error(
                    "\n❌ PAYMENT INIT ERROR"
                );

                console.error(
                    "Message:",
                    error.message
                );

                console.error(
                    "Stack:",
                    error.stack
                );

                return res.status(500).json({
                    success:
                        false,

                    error:
                        error.message ||
                        "Internal server error during payment initialization.",
                });
            }
        }
    );

    // ============================================================
    // SUCCESS
    //
    // POST /api/payment/success/:tran_id
    // ============================================================

    router.post(
        "/success/:tran_id",
        async (req, res) => {

            const {
                tran_id,
            } = req.params;

            try {

                console.log(
                    "\n========================================"
                );

                console.log(
                    "✅ SUCCESS CALLBACK:",
                    tran_id
                );

                console.log(
                    "📥 SSLCommerz response:",
                    req.body
                );

                // --------------------------------------------------------
                // Find payment
                // --------------------------------------------------------

                const payment =
                    await paymentsCollection.findOne({
                        tran_id,
                    });

                if (!payment) {

                    console.error(
                        "❌ Payment record not found:",
                        tran_id
                    );

                    return res.redirect(
                        `${FRONTEND_URL}/payment/success?payment=error&tran_id=${encodeURIComponent(
                            tran_id
                        )}`
                    );
                }

                // --------------------------------------------------------
                // Validate with SSLCommerz
                // --------------------------------------------------------

                const result =
                    await validatePayment(
                        payment,
                        req.body
                    );

                // --------------------------------------------------------
                // Invalid payment
                // --------------------------------------------------------

                if (!result.valid) {

                    console.error(
                        "❌ Payment validation failed:",
                        {
                            tran_id,

                            validationStatus:
                                result.validationStatus,

                            storedAmount:
                                result.storedAmount,

                            validatedAmount:
                                result.validatedAmount,

                            amountMatches:
                                result.amountMatches,

                            gatewayTranId:
                                result.gatewayTranId,

                            transactionMatches:
                                result.transactionMatches,

                            gatewayCurrency:
                                result.gatewayCurrency,

                            storedCurrency:
                                result.storedCurrency,

                            currencyMatches:
                                result.currencyMatches,
                        }
                    );

                    // Do not overwrite an already successful payment.
                    if (
                        !(
                            payment.status ===
                                "SUCCESS" &&
                            payment.purchaseStatus ===
                                "PURCHASED"
                        )
                    ) {

                        await paymentsCollection.updateOne(
                            {
                                tran_id,
                            },
                            {
                                $set: {

                                    status:
                                        "FAILED",

                                    purchaseStatus:
                                        "NOT_PURCHASED",

                                    validationResponse:
                                        result.validationResponse,

                                    updatedAt:
                                        new Date(),
                                },
                            }
                        );
                    }

                    return res.redirect(
                        `${FRONTEND_URL}/payment/failed?tran_id=${encodeURIComponent(
                            tran_id
                        )}`
                    );
                }

                // --------------------------------------------------------
                // Mark successful
                // --------------------------------------------------------

                await markPaymentSuccessful(
                    payment,
                    req.body,
                    result.validationResponse
                );

                // --------------------------------------------------------
                // Redirect to frontend success page
                // --------------------------------------------------------

                return res.redirect(
                    `${FRONTEND_URL}/payment/success?tran_id=${encodeURIComponent(
                        tran_id
                    )}`
                );

            } catch (error) {

                console.error(
                    "❌ SUCCESS CALLBACK ERROR:",
                    error
                );

                return res.redirect(
                    `${FRONTEND_URL}/payment/failed?payment=error&tran_id=${encodeURIComponent(
                        tran_id
                    )}`
                );
            }
        }
    );

    // ============================================================
    // FAIL
    //
    // POST /api/payment/fail/:tran_id
    // ============================================================

    router.post(
        "/fail/:tran_id",
        async (req, res) => {

            const {
                tran_id,
            } = req.params;

            try {

                console.log(
                    `⚠️ Payment failed: ${tran_id}`
                );

                const payment =
                    await paymentsCollection.findOne({
                        tran_id,
                    });

                // --------------------------------------------------------
                // Never overwrite an already successful payment
                // --------------------------------------------------------

                if (
                    payment &&
                    !(
                        payment.status ===
                            "SUCCESS" &&
                        payment.purchaseStatus ===
                            "PURCHASED"
                    )
                ) {

                    await paymentsCollection.updateOne(
                        {
                            tran_id,
                        },
                        {
                            $set: {

                                status:
                                    "FAILED",

                                purchaseStatus:
                                    "NOT_PURCHASED",

                                gatewayResponse:
                                    req.body,

                                updatedAt:
                                    new Date(),
                            },
                        }
                    );
                }

                // --------------------------------------------------------
                // If already successful, send user to success page
                // --------------------------------------------------------

                if (
                    payment &&
                    payment.status ===
                        "SUCCESS" &&
                    payment.purchaseStatus ===
                        "PURCHASED"
                ) {

                    return res.redirect(
                        `${FRONTEND_URL}/payment/success?tran_id=${encodeURIComponent(
                            tran_id
                        )}`
                    );
                }

                return res.redirect(
                    `${FRONTEND_URL}/payment/failed?tran_id=${encodeURIComponent(
                        tran_id
                    )}`
                );

            } catch (error) {

                console.error(
                    "❌ FAIL CALLBACK ERROR:",
                    error
                );

                return res.redirect(
                    `${FRONTEND_URL}/payment/failed?payment=error&tran_id=${encodeURIComponent(
                        tran_id
                    )}`
                );
            }
        }
    );

    // ============================================================
    // CANCEL
    //
    // POST /api/payment/cancel/:tran_id
    // ============================================================

    router.post(
        "/cancel/:tran_id",
        async (req, res) => {

            const {
                tran_id,
            } = req.params;

            try {

                console.log(
                    `⚠️ Payment cancelled: ${tran_id}`
                );

                const payment =
                    await paymentsCollection.findOne({
                        tran_id,
                    });

                // --------------------------------------------------------
                // Never overwrite an already successful payment
                // --------------------------------------------------------

                if (
                    payment &&
                    !(
                        payment.status ===
                            "SUCCESS" &&
                        payment.purchaseStatus ===
                            "PURCHASED"
                    )
                ) {

                    await paymentsCollection.updateOne(
                        {
                            tran_id,
                        },
                        {
                            $set: {

                                status:
                                    "CANCELLED",

                                purchaseStatus:
                                    "NOT_PURCHASED",

                                gatewayResponse:
                                    req.body,

                                updatedAt:
                                    new Date(),
                            },
                        }
                    );
                }

                // --------------------------------------------------------
                // If already successful, send user to success page
                // --------------------------------------------------------

                if (
                    payment &&
                    payment.status ===
                        "SUCCESS" &&
                    payment.purchaseStatus ===
                        "PURCHASED"
                ) {

                    return res.redirect(
                        `${FRONTEND_URL}/payment/success?tran_id=${encodeURIComponent(
                            tran_id
                        )}`
                    );
                }

                return res.redirect(
                    `${FRONTEND_URL}/payment/cancelled?tran_id=${encodeURIComponent(
                        tran_id
                    )}`
                );

            } catch (error) {

                console.error(
                    "❌ CANCEL CALLBACK ERROR:",
                    error
                );

                return res.redirect(
                    `${FRONTEND_URL}/payment/cancelled?payment=error&tran_id=${encodeURIComponent(
                        tran_id
                    )}`
                );
            }
        }
    );

    // ============================================================
    // IPN
    //
    // POST /api/payment/ipn
    // ============================================================

    router.post(
        "/ipn",
        async (req, res) => {

            try {

                console.log(
                    "\n========================================"
                );

                console.log(
                    "📡 SSLCommerz IPN RECEIVED"
                );

                console.log(
                    "========================================"
                );

                console.log(
                    req.body
                );

                const {
                    tran_id,
                } = req.body;

                if (!tran_id) {

                    return res.status(400).json({
                        success: false,
                        error:
                            "Transaction ID missing.",
                    });
                }

                // --------------------------------------------------------
                // Find payment
                // --------------------------------------------------------

                const payment =
                    await paymentsCollection.findOne({
                        tran_id,
                    });

                if (!payment) {

                    console.error(
                        "❌ Payment record not found:",
                        tran_id
                    );

                    return res.status(404).json({
                        success: false,
                        error:
                            "Payment record not found.",
                    });
                }

                // --------------------------------------------------------
                // Validate
                // --------------------------------------------------------

                const result =
                    await validatePayment(
                        payment,
                        req.body
                    );

                if (result.valid) {

                    await markPaymentSuccessful(
                        payment,
                        req.body,
                        result.validationResponse
                    );

                    console.log(
                        `✅ IPN payment validated: ${tran_id}`
                    );

                } else {

                    console.log(
                        `⚠️ IPN payment not validated: ${tran_id}`
                    );

                    console.log({
                        validationStatus:
                            result.validationStatus,

                        storedAmount:
                            result.storedAmount,

                        validatedAmount:
                            result.validatedAmount,

                        amountMatches:
                            result.amountMatches,

                        gatewayTranId:
                            result.gatewayTranId,

                        transactionMatches:
                            result.transactionMatches,

                        gatewayCurrency:
                            result.gatewayCurrency,

                        storedCurrency:
                            result.storedCurrency,

                        currencyMatches:
                            result.currencyMatches,
                    });
                }

                // --------------------------------------------------------
                // Acknowledge IPN
                // --------------------------------------------------------

                return res.status(200).json({
                    success:
                        true,
                });

            } catch (error) {

                console.error(
                    "❌ IPN ERROR:",
                    error
                );

                return res.status(500).json({
                    success:
                        false,

                    error:
                        error.message ||
                        "IPN processing failed.",
                });
            }
        }
    );

    // ============================================================
    // PAYMENT STATUS
    //
    // GET /api/payment/status/:tran_id
    //
    // Used by the frontend payment result page.
    // ============================================================

    router.get(
        "/status/:tran_id",
        async (req, res) => {

            try {

                const {
                    tran_id,
                } = req.params;

                const payment =
                    await paymentsCollection.findOne(
                        {
                            tran_id,
                        },
                        {
                            projection: {

                                _id:
                                    0,

                                tran_id:
                                    1,

                                amount:
                                    1,

                                currency:
                                    1,

                                items:
                                    1,

                                customer:
                                    1,

                                status:
                                    1,

                                purchaseStatus:
                                    1,

                                paidAt:
                                    1,

                                purchasedAt:
                                    1,

                                createdAt:
                                    1,
                            },
                        }
                    );

                if (!payment) {

                    return res.status(404).json({
                        success:
                            false,

                        error:
                            "Payment not found.",
                    });
                }

                return res.status(200).json({

                    success:
                        true,

                    payment,
                });

            } catch (error) {

                console.error(
                    "❌ PAYMENT STATUS ERROR:",
                    error
                );

                return res.status(500).json({
                    success:
                        false,

                    error:
                        "Unable to retrieve payment status.",
                });
            }
        }
    );

    return router;
};

module.exports =
    createPaymentRouter;