import express from "express";
import CoreModel from "../services/CoreService";

const core = express.Router({ strict: true });
const coreModel = new CoreModel();
//.................User...............................

core.post("/find-user-by-number", coreModel.FindUserByNumber);
core.post("/register-user", coreModel.RegisterUser);
core.post("/check-user-active-job", coreModel.CheckUserActiveJob);
core.get("/job-list", coreModel.JobList);
core.post("/apply-for-job", coreModel.ApplyForJob);
core.post("/leave-job", coreModel.LeaveJob);

export default core;
