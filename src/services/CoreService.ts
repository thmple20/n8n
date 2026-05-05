import e, { Request, Response } from "express";
import logger from "../middlewares/Logger";
import { pool } from "../utils/Connection";
import {
  insertDataQuery,
  isValEmpty,
  isValEmptyArray,
  Time,
  updateDataSelectedFields,
} from "../utils/Higherorderfunction";
import "dotenv/config";

export interface RequestAuthType extends Request {
  auth?: { userId?: string };
}

export default class CoreModel {
  async FindUserByNumber(req: RequestAuthType, res: Response) {
    const findUserByNumberQuery = `SELECT * FROM usertable WHERE user_phone = $1`;
    try {
      const { phoneNumber } = req.body;
      const user = await pool.query(findUserByNumberQuery, [phoneNumber]);
      if (!user.rows[0]) {
        return res.status(200).json({
          status: 1,
          message: "User not found",
        });
      }
      return res.status(200).json({
        status: 1,
        message: "User found successfully",
        user: user.rows[0],
      });
    } catch (error) {
      logger.error("Error in FindUserByNumber: ", error);
      return res.status(500).json({
        status: 1,
        message: "Internal server error",
      });
    }
  }

  async RegisterUser(req: RequestAuthType, res: Response) {
    const { ...rest } = req.body;
    const payload = {
      ...rest,
      user_created_at: new Date().toISOString(),
    };
    try {
      const { insertQuery, insertParams } = insertDataQuery(
        "public.usertable",
        payload,
      );
      console.log("insertQuery: ", insertQuery);
      console.log("insertParams: ", insertParams);
      const newUser = await pool.query(insertQuery, insertParams);
      return res.status(201).json({
        status: 1,
        message: "User registered successfully",
        user: isValEmpty(newUser.rows[0]),
      });
    } catch (error) {
      logger.error("Error in RegisterUser: ", error);
      return res.status(500).json({
        status: 1,
        message: "Internal server error",
      });
    }
  }

  async CheckUserActiveJob(req: RequestAuthType, res: Response) {
    const { phoneNumber } = req.body;
    const findUserQuery = `SELECT * FROM usertable WHERE user_phone = $1`;
    const checkUserActiveJobQuery = `SELECT * FROM public.user_jobs WHERE user_id = $1 AND status = 'active'`;
    try {
      const userResult = await pool.query(findUserQuery, [phoneNumber]);
      if (userResult.rows.length === 0) {
        return res.status(200).json({
          status: 1,
          message: "User not found",
        });
      }
      const userId = userResult.rows[0].user_id;
      const activeJob = await pool.query(checkUserActiveJobQuery, [userId]);
      if (activeJob.rows.length === 0) {
        return res.status(200).json({
          status: 1,
          message: "No active job found for the user",
        });
      }
      return res.status(200).json({
        status: 1,
        message: "Active job found successfully",
        job: isValEmpty(activeJob.rows[0]),
      });
    } catch (error) {
      logger.error("Error in CheckUserActiveJob: ", error);
      return res.status(500).json({
        status: 1,
        message: "Internal server error",
      });
    }
  }

  async JobList(req: RequestAuthType, res: Response) {
    const jobListQuery = `SELECT * FROM public.jobs`;
    try {
      const jobs = await pool.query(jobListQuery);
      if (jobs.rows.length === 0) {
        return res.status(200).json({
          status: 1,
          message: "No jobs found",
        });
      }
      return res.status(200).json({
        status: 1,
        message: "Jobs found successfully",
        jobs: isValEmptyArray(jobs.rows),
      });
    } catch (error) {
      logger.error("Error in JobList: ", error);
      return res.status(500).json({
        status: 1,
        message: "Internal server error",
      });
    }
  }

  async ApplyForJob(req: RequestAuthType, res: Response) {
    const { phoneNumber, jobId } = req.body;
    const findUserQuery = `SELECT * FROM usertable WHERE user_phone = $1`;

    try {
      const userResult = await pool.query(findUserQuery, [phoneNumber]);
      if (userResult.rows.length === 0) {
        return res.status(200).json({
          status: 1,
          message: "User not found",
        });
      }
      const userId = userResult.rows[0].user_id;
      const payload = {
        user_id: userId,
        job_id: jobId,
        status: "active",
        start_time: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      const { insertQuery, insertParams } = insertDataQuery(
        "public.user_jobs",
        payload,
      );
      const newApplication = await pool.query(insertQuery, insertParams);
      return res.status(201).json({
        status: 1,
        message: "Applied for job successfully",
        application: isValEmpty(newApplication.rows[0]),
      });
    } catch (error) {
      logger.error("Error in ApplyForJob: ", error);
      return res.status(500).json({
        status: 1,
        message: "Internal server error",
      });
    }
  }

  async LeaveJob(req: RequestAuthType, res: Response) {
    const { phoneNumber, jobId } = req.body;
    const findUserQuery = `SELECT * FROM usertable WHERE user_phone = $1`;
    const updateJobStatusQuery = `UPDATE public.user_jobs SET status = 'completed', end_time = $1 WHERE user_id = $2 AND status = 'active' RETURNING *`;
    try {
      const userResult = await pool.query(findUserQuery, [phoneNumber]);
      if (userResult.rows.length === 0) {
        return res.status(200).json({
          status: 1,
          message: "User not found",
        });
      }
      const userId = userResult.rows[0].user_id;
      const updatedJob = await pool.query(updateJobStatusQuery, [
        new Date().toISOString(),
        userId,
      ]);
      if (updatedJob.rows.length === 0) {
        return res.status(200).json({
          status: 1,
          message: "Active job not found for the user",
        });
      }
      return res.status(200).json({
        status: 1,
        message: "Left job successfully",
        job: isValEmpty(updatedJob.rows[0]),
      });
    } catch (error) {
      logger.error("Error in LeaveJob: ", error);
      return res.status(500).json({
        status: 1,
        message: "Internal server error",
      });
    }
  }
}
