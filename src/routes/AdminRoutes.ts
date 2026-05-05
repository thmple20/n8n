import express from "express";
import AdminModel from "../services/AdminService";
import { adminAuthentication } from "../middlewares/UserAuthentication";
import upload from "../utils/ImageUpload";

const admin = express.Router({ strict: true });
const adminModel = new AdminModel();

//...............Admin......................
admin.post("/signup", adminModel.AdminSignup);
admin.post("/login", adminModel.AdminLogin);
admin.get("/my-info", adminAuthentication, adminModel.GetAdminData);
admin.patch("/my-info", adminAuthentication, adminModel.UpdateAdminData);

// ========================= User Management =========================
admin.get("/users", adminAuthentication, adminModel.GetAdminUserList);
admin.get("/users/:userId", adminAuthentication, adminModel.GetAdminUserDetail);
admin.delete("/users/:userId", adminAuthentication, adminModel.DeleteAdminUser);
admin.patch("/users/:userId", adminAuthentication, adminModel.UpdateAdminUser);

// ========================= Crew Management =========================

admin.get("/crews", adminAuthentication, adminModel.GetAdminCrewList);
admin.get("/crews/:crewId", adminAuthentication, adminModel.GetAdminCrewDetail);
admin.delete("/crews/:crewId", adminAuthentication, adminModel.DeleteCrew);
admin.patch("/crews/:crewId", adminAuthentication, adminModel.UpdateCrew);

//...............App Files......................
admin.post(
  "/app-files",
  adminAuthentication,
  upload.single("file"),
  adminModel.UploadFile,
);

// ==================== Prefix ====================
admin.get("/prefix", adminAuthentication, adminModel.GetPrefixList);
admin.patch("/prefix/:prefixId", adminAuthentication, adminModel.UpdatePrefix);
admin.delete("/prefix/:prefixId", adminAuthentication, adminModel.DeletePrefix);
admin.get("/prefix/:prefixId", adminAuthentication, adminModel.GetPrefixDetail);
admin.post("/prefix", adminAuthentication, adminModel.CreatePrefix);

// ================== Stats Level ==================

admin.get("/ranks", adminAuthentication, adminModel.GetRankList);
admin.get("/ranks/:rank_id", adminAuthentication, adminModel.GetRankDetail);
admin.post("/ranks", adminAuthentication, adminModel.CreateRank);
admin.patch("/ranks/:rank_id", adminAuthentication, adminModel.UpdateRank);
admin.delete("/ranks/:rank_id", adminAuthentication, adminModel.DeleteRank);

// ================== Dashboard ==================
admin.get("/dashboard", adminAuthentication, adminModel.GetAdminDashboard);

export default admin;
