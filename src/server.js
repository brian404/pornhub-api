require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const routes = require("./routes/index");

const app = express();
const PORT = process.env.PORT || 3099;

app.use(cors());
app.use(express.json());

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
