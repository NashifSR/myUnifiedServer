const express = require("express");
const SSLCommerzPayment = require("sslcommerz-lts");

const createPaymentRouter = (paymentsCollection, assetsCollection) => {
  const router = express.Router();

  const store_id = process.env.SSL_STORE_ID;
  const store_passwd = process.env.SSL_STORE_PASSWORD;

  // false = sandbox
  // true = live
  const is_live = false;

  // ============================================================
  // INIT PAYMENT
  // POST /api/payment/init
  // ============================================================

  router.post("/init", async (req, res) => {
    try {
      console.log("\n========================================");
      console.log("💳 SSLCommerz Payment Initialization");
      console.log("========================================");

      console.log("📥 Frontend request:", req.body);

      const {
        tran_id,
        total_amount,
        cus_name,
        cus_email,
        cus_phone,
      } = req.body;

      // --------------------------------------------------------
      // Basic validation
      // --------------------------------------------------------

      if (!tran_id) {
        return res.status(400).json({
          success: false,
          error: "Transaction ID is required.",
        });
      }

      if (!total_amount) {
        return res.status(400).json({
          success: false,
          error: "Payment amount is required.",
        });
      }

      if (!cus_name) {
        return res.status(400).json({
          success: false,
          error: "Customer name is required.",
        });
      }

      if (!cus_email) {
        return res.status(400).json({
          success: false,
          error: "Customer email is required.",
        });
      }

      if (!cus_phone) {
        return res.status(400).json({
          success: false,
          error: "Customer phone is required.",
        });
      }

      // SSLCommerz requires BDT amount between 10 and 500,000.
      const amount = Number(total_amount);

      if (!Number.isFinite(amount)) {
        return res.status(400).json({
          success: false,
          error: "Invalid payment amount.",
        });
      }

      if (amount < 10) {
        return res.status(400).json({
          success: false,
          error: "Minimum SSLCommerz payment amount is BDT 10.",
        });
      }

      if (amount > 500000) {
        return res.status(400).json({
          success: false,
          error: "Maximum SSLCommerz payment amount is BDT 500,000.",
        });
      }

      // --------------------------------------------------------
      // Check credentials
      // --------------------------------------------------------

      if (!store_id || !store_passwd) {
        console.error("❌ SSLCommerz credentials are missing.");

        return res.status(500).json({
          success: false,
          error: "SSLCommerz credentials are not configured on the server.",
        });
      }

      console.log("🏪 Store ID:", store_id);
      console.log("🌐 Environment:", is_live ? "LIVE" : "SANDBOX");
      console.log("💰 Amount:", amount);
      console.log("🧾 Transaction ID:", tran_id);

      // --------------------------------------------------------
      // SSLCommerz request
      // --------------------------------------------------------

      const data = {
        total_amount: amount.toFixed(2),
        currency: "BDT",

        tran_id,

        // IMPORTANT:
        // These URLs must eventually be publicly accessible.
        success_url: `http://localhost:5000/api/payment/success/${tran_id}`,
        fail_url: `http://localhost:5000/api/payment/fail/${tran_id}`,
        cancel_url: `http://localhost:5000/api/payment/cancel/${tran_id}`,

        // IPN must eventually be publicly accessible to SSLCommerz.
        ipn_url: `http://localhost:5000/api/payment/ipn`,

        // ------------------------------------------------------
        // Shipping
        // ------------------------------------------------------

        shipping_method: "NO",

        // ------------------------------------------------------
        // Product
        // ------------------------------------------------------

        product_name: "Asset Plan Upgrade",
        product_category: "Subscription",
        product_profile: "general",

        // ------------------------------------------------------
        // Customer
        // ------------------------------------------------------

        cus_name,
        cus_email,
        cus_add1: "Dhaka",
        cus_add2: "Dhaka",
        cus_city: "Dhaka",
        cus_state: "Dhaka",
        cus_postcode: "1000",
        cus_country: "Bangladesh",
        cus_phone,
        cus_fax: "",
      };

      console.log("📤 Sending request to SSLCommerz...");

      const sslcz = new SSLCommerzPayment(
        store_id,
        store_passwd,
        is_live
      );

      // IMPORTANT:
      // Use await so SSLCommerz errors are caught by try/catch.
      const apiResponse = await sslcz.init(data);

      console.log("📥 SSLCommerz response:");
      console.log(apiResponse);

      // --------------------------------------------------------
      // SSLCommerz rejected the request
      // --------------------------------------------------------

      if (!apiResponse) {
        console.error("❌ SSLCommerz returned an empty response.");

        return res.status(502).json({
          success: false,
          error: "Empty response received from SSLCommerz.",
        });
      }

      if (apiResponse.status !== "SUCCESS") {
        console.error("❌ SSLCommerz rejected payment initialization.");

        console.error(
          "SSLCommerz status:",
          apiResponse.status
        );

        console.error(
          "SSLCommerz failed reason:",
          apiResponse.failedreason
        );

        return res.status(400).json({
          success: false,
          error:
            apiResponse.failedreason ||
            "SSLCommerz rejected the payment request.",
          status: apiResponse.status,
        });
      }

      // --------------------------------------------------------
      // Gateway URL
      // --------------------------------------------------------

      const gatewayUrl =
        apiResponse.GatewayPageURL ||
        apiResponse.redirectGatewayURL;

      if (!gatewayUrl) {
        console.error(
          "❌ SSLCommerz did not return GatewayPageURL."
        );

        return res.status(502).json({
          success: false,
          error: "SSLCommerz did not return a payment gateway URL.",
          sslcommerz_response: apiResponse,
        });
      }

      // --------------------------------------------------------
      // Save pending payment
      // --------------------------------------------------------

      try {
        await paymentsCollection.insertOne({
          tran_id,
          amount,
          currency: "BDT",

          customer: {
            name: cus_name,
            email: cus_email,
            phone: cus_phone,
          },

          status: "PENDING",

          sessionkey: apiResponse.sessionkey || null,

          createdAt: new Date(),
          updatedAt: new Date(),
        });

        console.log("💾 Payment saved as PENDING.");
      } catch (dbError) {
        console.error(
          "⚠️ Payment database save failed:",
          dbError
        );

        // We don't necessarily stop the payment here.
        // SSLCommerz session was successfully created.
      }

      // --------------------------------------------------------
      // Return gateway URL to frontend
      // --------------------------------------------------------

      console.log("✅ Payment initialized successfully.");
      console.log("🔗 Gateway:", gatewayUrl);

      return res.status(200).json({
        success: true,
        url: gatewayUrl,
        GatewayPageURL: gatewayUrl,
        tran_id,
        sessionkey: apiResponse.sessionkey || null,
      });
    } catch (error) {
      console.error("\n❌ PAYMENT INIT ERROR");
      console.error("========================================");
      console.error("Message:", error.message);
      console.error("Stack:", error.stack);

      if (error.response) {
        console.error("HTTP status:", error.response.status);
        console.error("Response data:", error.response.data);
      }

      return res.status(500).json({
        success: false,
        error:
          error.message ||
          "Internal server error during payment initialization.",
      });
    }
  });

  // ============================================================
  // SUCCESS
  // POST /api/payment/success/:tran_id
  // ============================================================

  router.post("/success/:tran_id", async (req, res) => {
    try {
      const { tran_id } = req.params;

      console.log("✅ SUCCESS CALLBACK:", tran_id);
      console.log("SSLCommerz response:", req.body);

      const validationPayload = req.body;

      const sslcz = new SSLCommerzPayment(
        store_id,
        store_passwd,
        is_live
      );

      const validationResponse =
        await sslcz.validate(validationPayload);

      console.log(
        "🔍 Validation response:",
        validationResponse
      );

      if (
        validationResponse.status === "VALID" ||
        validationResponse.status === "VALIDATED"
      ) {
        console.log(
          `✅ Payment validated: ${tran_id}`
        );

        await paymentsCollection.updateOne(
          { tran_id },
          {
            $set: {
              status: "SUCCESS",
              val_id: validationPayload.val_id || null,
              amount: validationResponse.amount || null,
              customerEmail:
                validationResponse.cus_email || null,
              validationResponse,
              paidAt: new Date(),
              updatedAt: new Date(),
            },
          }
        );

        return res.redirect(
          `http://localhost:5173/dashboard?payment=success&tran_id=${tran_id}`
        );
      }

      console.error(
        "❌ Payment validation failed:",
        validationResponse
      );

      return res.redirect(
        `http://localhost:5173/dashboard?payment=fail&tran_id=${tran_id}`
      );
    } catch (error) {
      console.error(
        "❌ SUCCESS CALLBACK ERROR:",
        error
      );

      return res.redirect(
        `http://localhost:5173/dashboard?payment=error`
      );
    }
  });

  // ============================================================
  // FAIL
  // POST /api/payment/fail/:tran_id
  // ============================================================

  router.post("/fail/:tran_id", async (req, res) => {
    try {
      const { tran_id } = req.params;

      console.log(
        `⚠️ Payment failed: ${tran_id}`
      );

      await paymentsCollection.updateOne(
        { tran_id },
        {
          $set: {
            status: "FAILED",
            updatedAt: new Date(),
          },
        }
      );

      return res.redirect(
        `http://localhost:5173/dashboard?payment=fail&tran_id=${tran_id}`
      );
    } catch (error) {
      console.error(
        "❌ FAIL CALLBACK ERROR:",
        error
      );

      return res.redirect(
        `http://localhost:5173/dashboard?payment=error`
      );
    }
  });

  // ============================================================
  // CANCEL
  // POST /api/payment/cancel/:tran_id
  // ============================================================

  router.post("/cancel/:tran_id", async (req, res) => {
    try {
      const { tran_id } = req.params;

      console.log(
        `⚠️ Payment cancelled: ${tran_id}`
      );

      await paymentsCollection.updateOne(
        { tran_id },
        {
          $set: {
            status: "CANCELLED",
            updatedAt: new Date(),
          },
        }
      );

      return res.redirect(
        `http://localhost:5173/dashboard?payment=cancel&tran_id=${tran_id}`
      );
    } catch (error) {
      console.error(
        "❌ CANCEL CALLBACK ERROR:",
        error
      );

      return res.redirect(
        `http://localhost:5173/dashboard?payment=error`
      );
    }
  });

  // ============================================================
  // IPN
  // POST /api/payment/ipn
  // ============================================================

  router.post("/ipn", async (req, res) => {
    try {
      console.log("\n========================================");
      console.log("📡 SSLCommerz IPN RECEIVED");
      console.log("========================================");

      console.log(req.body);

      const {
        tran_id,
        val_id,
        status,
        amount,
        currency,
      } = req.body;

      if (!tran_id) {
        return res.status(400).json({
          success: false,
          error: "Transaction ID missing.",
        });
      }

      // Validate IPN payment with SSLCommerz
      const sslcz = new SSLCommerzPayment(
        store_id,
        store_passwd,
        is_live
      );

      const validationResponse =
        await sslcz.validate(req.body);

      console.log(
        "🔍 IPN validation:",
        validationResponse
      );

      if (
        validationResponse.status === "VALID" ||
        validationResponse.status === "VALIDATED"
      ) {
        await paymentsCollection.updateOne(
          { tran_id },
          {
            $set: {
              status: "SUCCESS",
              val_id: val_id || null,
              amount:
                validationResponse.amount ||
                amount ||
                null,
              currency:
                validationResponse.currency ||
                currency ||
                "BDT",
              ipnResponse: req.body,
              validationResponse,
              paidAt: new Date(),
              updatedAt: new Date(),
            },
          },
          {
            upsert: true,
          }
        );

        console.log(
          `✅ IPN payment validated: ${tran_id}`
        );
      } else {
        console.log(
          `⚠️ IPN payment not validated: ${tran_id}`
        );
      }

      return res.status(200).json({
        success: true,
      });
    } catch (error) {
      console.error(
        "❌ IPN ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  return router;
};

module.exports = createPaymentRouter;