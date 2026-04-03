require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const rateLimit = require("express-rate-limit");
const routes = require("./routes/index");

const app = express();
const PORT = process.env.PORT || 3099;

const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: { error: "Too many requests", message: "Please try again after 1 minute." },
    standardHeaders: true,
    legacyHeaders: false
});

const downloadLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: "Too many download requests", message: "Download limit reached. Please try again after 1 minute." }
});

app.use(cors());
app.use(express.json());

app.use("/api", generalLimiter);
app.use("/api/download", downloadLimiter);

app.use(express.static(path.join(__dirname, "../public")));

app.get("/", (req, res) => {
    res.json({ message: "Welcome to the Unofficial Pornhub API!" });
});

app.use("/api", routes);

app.get("/api/docs", (req, res) => {
    res.sendFile(path.join(__dirname, "../public/docs.html"));
});

app.use((err, req, res, next) => {
    console.error("Error:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`API Documentation available at http://localhost:${PORT}/api/docs`);
});
