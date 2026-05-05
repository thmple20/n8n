import express from "express";
import cors from "cors";
// import admin from "./src/routes/AdminRoutes";
import auth from "./src/routes/CoreRoutes";
import status from "express-status-monitor";
import logger from "./src/middlewares/Logger";
import admin from "./src/routes/AdminRoutes";
import project from "./src/routes/ProjectRoutes";
import { getGoogleAuthUrl, googleCallback } from "./src/utils/googleLogin";

export interface RequestAuthType extends Request {
  auth?: { userId?: string };
}
const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("build"));
// app.use(status());

app.use((req, res, next) => {
  logger.info(`API hit: ${req.method} ${req.originalUrl}`);
  next();
});

app.use("/privacypolicy", express.static("./index.html"));
app.use("/disclaimer", express.static("./disclaimer.html"));
app.use("/privacy-policy", express.static("./privacy.html"));
app.use("/terms", express.static("./terms.html"));

app.use(cors()), app.use("/api", auth);
// app.use("/api", user);

app.use("/api/admin", admin);
app.use("/api/getGoogleAuthUrl", getGoogleAuthUrl);
app.use("/auth/google/callback", googleCallback);
app.use("/api", project);
app.use("/", (req, res) => {
  res.send("welcome");
});

export default app;
