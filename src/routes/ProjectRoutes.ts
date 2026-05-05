import express from "express";
import { userAuthentication } from "../middlewares/UserAuthentication";
import ProjectModel from "../services/ProjectService";
import upload from "../utils/ImageUpload";

const project = express.Router({ strict: true });

const projectModel = new ProjectModel();

project.post("/create-crew", userAuthentication, projectModel.CreateCrew);
project.patch(
  "/update-crew/:crew_id",
  userAuthentication,
  projectModel.UpdateCrew,
);
project.delete(
  "/delete-crew/:crew_id",
  userAuthentication,
  projectModel.DeleteCrew,
);
project.get(
  "/crew-details/:crew_id",
  userAuthentication,
  projectModel.GetCrewDetails,
);
project.post(
  "/upload-crew-logo",
  userAuthentication,
  upload.single("file"),
  projectModel.UploadFile,
);

project.post("/join-crew", userAuthentication, projectModel.JoinCrew);
project.post("/leave-crew", userAuthentication, projectModel.LeaveCrew);

project.get("/my-crews", userAuthentication, projectModel.GetMyCrews);

// --------------------- Mission Routes ---------------------

project.get("/start-mission", userAuthentication, projectModel.StartMission);
project.post("/end-mission", userAuthentication, projectModel.EndMission);
project.get(
  "/active-mission",
  userAuthentication,
  projectModel.GetActiveMission,
);
project.get(
  "/mission-history",
  userAuthentication,
  projectModel.GetMissionHistory,
);

// --------------------- Leaderboard Routes ---------------------

project.get(
  "/crew-vs-crew-leaderboard",
  userAuthentication,
  projectModel.GetCrewVsCrewLeaderboard,
);
project.get(
  "/crew-user-leaderboard",
  userAuthentication,
  projectModel.GetCrewUserLeaderboard,
);
project.get(
  "/global-user-leaderboard",
  userAuthentication,
  projectModel.GetGlobalUserLeaderboard,
);
export default project;
