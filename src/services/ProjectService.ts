import { query, Request, Response } from "express";
import logger from "../middlewares/Logger";
import { pool } from "../utils/Connection";
import {
  insertDataQuery,
  isValEmpty,
  isValEmptyArray,
  Time,
  updateDataSelectedFields,
} from "../utils/Higherorderfunction";
import { exclude, excludeArray } from "../utils/Excludefied";
import { database } from "firebase-admin";
import PushNotification from "../utils/PushNotification";
import { generateReferralCode } from "../utils/generateReferralCode";
import { uploadFile } from "../utils/file-upload";

export interface RequestAuthType extends Request {
  auth?: { userId?: string };
}

export default class ProjectModel {
  async CreateCrew(req: RequestAuthType, res: Response) {
    const userId = req["auth"]?.userId;
    const { ...rest } = req.body;

    const INSERT_MEMBER_QUERY = `
    INSERT INTO production.crew_members 
    (crew_member_user_id, crew_id, crew_member_role, crew_member_joined_at)
    VALUES ($1, $2, 'admin', $3)
  `;

    try {
      const inviteCode = generateReferralCode(8);
      const currentTime = Math.floor(Date.now() / 1000);

      const payload = {
        ...rest,
        crew_invite_code: inviteCode,
        crew_created_by: userId,
        crew_created_at: currentTime,
        crew_updated_at: currentTime,
      };

      const { insertQuery, insertParams } = insertDataQuery(
        "production.crews",
        payload,
      );

      const result = await pool.query(insertQuery, insertParams);
      const crew = result.rows[0];

      // 🔥 add creator as admin in crew_members
      await pool.query(INSERT_MEMBER_QUERY, [
        userId,
        crew.crew_id,
        currentTime,
      ]);

      return res.status(200).json({
        message: "Crew created successfully",
        data: crew,
        status: 1,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  async UpdateCrew(req: RequestAuthType, res: Response) {
    const userId = req["auth"]?.userId;
    const { crew_id } = req.params;
    const { crew_name, crew_avtar, crew_bio } = req.body;

    const CHECK_ADMIN_QUERY = `
    SELECT * FROM production.crew_members 
    WHERE crew_id = $1 
      AND crew_member_user_id = $2 
      AND crew_member_role = 'admin'
  `;

    try {
      // 🔥 check admin permission
      const check = await pool.query(CHECK_ADMIN_QUERY, [crew_id, userId]);

      if (check.rows.length === 0) {
        return res.status(200).json({
          message: "Not allowed to update this crew",
          status: 0,
        });
      }

      const currentTime = Math.floor(Date.now() / 1000);

      // 🔥 only update provided fields
      const payload: any = {
        crew_updated_at: currentTime,
      };

      if (crew_name !== undefined) payload.crew_name = crew_name;
      if (crew_avtar !== undefined) payload.crew_avtar = crew_avtar;
      if (crew_bio !== undefined) payload.crew_bio = crew_bio;

      const { updateQuery, updateParams } = updateDataSelectedFields(
        payload,
        crew_id,
        "crew_id",
        "production.crews",
      );

      await pool.query(updateQuery, updateParams);

      return res.status(200).json({
        message: "Crew updated successfully",
        status: 1,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }

  async DeleteCrew(req: RequestAuthType, res: Response) {
    const userId = req["auth"]?.userId;
    const { crew_id } = req.params;

    const CHECK_QUERY = `
    SELECT * FROM production.crews 
    WHERE crew_id = $1 AND crew_created_by = $2
  `;

    const DELETE_CREW_QUERY = `
    DELETE FROM production.crews WHERE crew_id = $1
  `;

    try {
      const check = await pool.query(CHECK_QUERY, [crew_id, userId]);

      if (check.rows.length === 0) {
        return res.status(200).json({
          message: "Not allowed",
          status: 0,
        });
      }

      await pool.query(DELETE_CREW_QUERY, [crew_id]);

      return res.status(200).json({
        message: "Crew deleted successfully",
        status: 1,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  async GetCrewDetails(req: RequestAuthType, res: Response) {
    const { crew_id } = req.params;
    const type = req.query.type as string; // today / all-time

    const CREW_QUERY = `
    SELECT 
      c.*,
      u.user_name AS created_by_name
    FROM production.crews c
    JOIN production.usertable u 
      ON c.crew_created_by = u.user_id
    WHERE c.crew_id = $1
  `;

    // 🔥 MEMBERS + TODAY TIME
    const MEMBERS_QUERY = `
    SELECT 
      u.user_id,
      u.user_name,
      u.user_avatar,
      u.user_total_time_points,
      u.user_current_streak,
      u.user_longest_streak,
      u.user_is_online,
      cm.crew_member_role AS role,

      COALESCE(SUM(
        CASE 
          WHEN DATE(to_timestamp(m.mission_start_time)) = CURRENT_DATE 
          THEN m.mission_time_points 
          ELSE 0 
        END
      ), 0) AS today_points

    FROM production.crew_members cm
    JOIN production.usertable u 
      ON u.user_id = cm.crew_member_user_id

    LEFT JOIN production.missions m
      ON m.mission_user_id = u.user_id

    WHERE cm.crew_id = $1
    GROUP BY u.user_id, cm.crew_member_role
  `;

    // 🔥 RANK QUERY
    const GET_RANK_QUERY = `
    SELECT rank_name, rank_image_url
    FROM production.rank_master
    WHERE $1 >= min_time
      AND ($1 <= max_time OR max_time IS NULL)
    ORDER BY min_time DESC
    LIMIT 1
  `;

    try {
      const crewRes = await pool.query(CREW_QUERY, [crew_id]);

      if (crewRes.rows.length === 0) {
        return res.status(200).json({
          message: "Crew not found",
          status: 0,
        });
      }

      const membersRes = await pool.query(MEMBERS_QUERY, [crew_id]);

      // 🔥 sorting
      const sortedMembers = membersRes.rows.sort((a: any, b: any) => {
        if (type === "today") {
          return Number(b.today_points) - Number(a.today_points);
        }
        return (
          Number(b.user_total_time_points) - Number(a.user_total_time_points)
        );
      });

      // 🔥 MAP WITH RANK
      const members = await Promise.all(
        sortedMembers.map(async (m: any, index: number) => {
          // 🔥 get rank per user
          const rankRes = await pool.query(GET_RANK_QUERY, [
            m.user_total_time_points || 0,
          ]);

          const rank = rankRes.rows[0] || {};

          return {
            rank: index + 1,

            user_id: m.user_id,
            user_name: m.user_name,

            // ✅ avatar override
            user_avatar: rank.rank_image_url || m.user_avatar,

            total_time:
              type === "today"
                ? Number(m.today_points) || 0
                : Number(m.user_total_time_points) || 0,

            current_streak: Number(m.user_current_streak) || 0,
            longest_streak: Number(m.user_longest_streak) || 0,

            role: m.role,

            status: Number(m.user_is_online) === 1 ? "active" : "docked",

            // ✅ new key
            status_level: rank.rank_name || "New Recruit",
          };
        }),
      );

      return res.status(200).json({
        message: "Crew detail fetched",
        data: {
          ...crewRes.rows[0],
          total_members: members.length,
          leaderboard_type: type || "all-time",
          members,
        },
        status: 1,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  async UploadFile(req: RequestAuthType, res: Response) {
    const userId = req["auth"]?.userId;

    const { image_type } = req.body;

    try {
      const uploadedFile = await uploadFile(req);

      if (!uploadedFile) {
        return res.status(400).json({
          status: 0,
          message: "Something went wrong while uploading the image",
          error: "Something went wrong while uploading the image",
        });
      }

      if (image_type === "crew-logo") {
        return res.status(200).json({
          status: 1,
          data: uploadedFile.url,
          message: "Success",
        });
      }
    } catch (error) {
      logger.error(`${error}`);
      return res.status(400).json({
        status: 0,
        message: "Something went wrong",
        error: "Something went wrong",
      });
    }
  }

  async JoinCrew(req: RequestAuthType, res: Response) {
    const { user_unique_id, crew_id } = req.body;

    const FIND_USER_QUERY = `SELECT user_id FROM production.usertable WHERE user_unique_id = $1`;

    const FIND_CREW_QUERY = `SELECT * FROM production.crews WHERE crew_id = $1`;

    const CHECK_ALREADY_JOINED = `SELECT * FROM production.crew_members WHERE crew_member_user_id = $1 AND crew_id = $2`;

    const INSERT_MEMBER_QUERY = `
    INSERT INTO production.crew_members 
    (crew_member_user_id, crew_id, crew_member_role, crew_member_joined_at)
    VALUES ($1, $2, 'member', $3)
  `;

    const CHECK_USER_LOCK = `SELECT * FROM production.usertable WHERE user_unique_id = $1 AND user_lock = 1`;

    try {
      // ❌ check if user is locked
      const lockRes = await pool.query(CHECK_USER_LOCK, [user_unique_id]);
      if (lockRes.rows.length > 0) {
        return res.status(201).json({
          message: "User is locked. Cannot join group.",
          status: 1,
        });
      }
      // 🔹 1. find user by unique id
      const userRes = await pool.query(FIND_USER_QUERY, [user_unique_id]);

      if (userRes.rows.length === 0) {
        return res.status(200).json({
          message: "Invalid user unique id",
          status: 0,
        });
      }

      const userId = userRes.rows[0].user_id;

      // 🔹 2. find crew
      const crewRes = await pool.query(FIND_CREW_QUERY, [crew_id]);

      if (crewRes.rows.length === 0) {
        return res.status(200).json({
          message: "Crew not found",
          status: 0,
        });
      }

      // 🔹 3. check already joined
      const check = await pool.query(CHECK_ALREADY_JOINED, [userId, crew_id]);

      if (check.rows.length > 0) {
        return res.status(200).json({
          message: "User already in this crew",
          status: 0,
        });
      }

      const currentTime = Math.floor(Date.now() / 1000);

      // 🔹 4. insert member
      await pool.query(INSERT_MEMBER_QUERY, [userId, crew_id, currentTime]);

      return res.status(200).json({
        message: "User added to crew successfully",
        status: 1,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }

  async LeaveCrew(req: RequestAuthType, res: Response) {
    const userId = req["auth"]?.userId;
    const { crew_id } = req.body;

    const CHECK_ADMIN_QUERY = `
    SELECT * FROM production.crews 
    WHERE crew_id = $1 AND crew_created_by = $2
  `;

    const DELETE_MEMBER_QUERY = `
    DELETE FROM production.crew_members
    WHERE crew_member_user_id = $1 AND crew_id = $2
  `;

    try {
      // ❌ admin cannot leave
      const checkAdmin = await pool.query(CHECK_ADMIN_QUERY, [crew_id, userId]);

      if (checkAdmin.rows.length > 0) {
        return res.status(400).json({
          message: "Admin cannot leave crew",
          status: 0,
        });
      }

      await pool.query(DELETE_MEMBER_QUERY, [userId, crew_id]);

      return res.status(200).json({
        message: "Left crew successfully",
        status: 1,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  async GetMyCrews(req: RequestAuthType, res: Response) {
    const userId = req["auth"]?.userId;

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.pageSize as string) || 10;
    const offset = (page - 1) * limit;

    const DATA_QUERY = `
    SELECT 
      c.crew_id,
      c.crew_name,
      c.crew_avtar,
      c.crew_bio,
      c.crew_created_by,
      c.crew_created_at,
      cm.crew_member_role AS role,
      COUNT(cm2.crew_member_user_id) AS total_members,
      COALESCE(SUM(u.user_total_time_points), 0) AS total_points
    FROM production.crew_members cm
    JOIN production.crews c 
      ON c.crew_id = cm.crew_id
    LEFT JOIN production.crew_members cm2 
      ON cm2.crew_id = c.crew_id
    LEFT JOIN production.usertable u 
      ON u.user_id = cm2.crew_member_user_id
    WHERE cm.crew_member_user_id = $1
    GROUP BY c.crew_id, cm.crew_member_role
    ORDER BY c.crew_created_at DESC
    LIMIT $2 OFFSET $3
  `;

    const COUNT_QUERY = `
    SELECT COUNT(*) 
    FROM production.crew_members
    WHERE crew_member_user_id = $1
  `;

    try {
      const [dataRes, countRes] = await Promise.all([
        pool.query(DATA_QUERY, [userId, limit, offset]),
        pool.query(COUNT_QUERY, [userId]),
      ]);

      const total = Number(countRes.rows[0].count);

      return res.status(200).json({
        message: "Crew list fetched successfully",
        page,
        limit,
        total,
        count: dataRes.rows.length,
        data: dataRes.rows,
        status: 1,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }

  // ----------------- MISSION ---------------------------

  async StartMission(req: RequestAuthType, res: Response) {
    const userId = req["auth"]?.userId;

    const CHECK_ACTIVE_QUERY = `
    SELECT * FROM production.missions 
    WHERE mission_user_id = $1 AND mission_status = 'active'
  `;

    // 🔥 NEW QUERY (crew_members se)
    const GET_CREW_QUERY = `
    SELECT crew_id 
    FROM production.crew_members 
    WHERE crew_member_user_id = $1
    ORDER BY crew_member_joined_at DESC
    LIMIT 1
  `;

    try {
      const active = await pool.query(CHECK_ACTIVE_QUERY, [userId]);

      if (active.rows.length > 0) {
        return res.status(200).json({
          message: "Mission already active",
          status: 0,
        });
      }

      const crewRes = await pool.query(GET_CREW_QUERY, [userId]);

      const crewId = crewRes.rows[0]?.crew_id || null;

      const currentTime = Math.floor(Date.now() / 1000);

      const payload = {
        mission_user_id: userId,
        mission_crew_id: crewId,
        mission_start_time: currentTime,
        mission_status: "active",
        mission_created_at: currentTime,
        mission_updated_at: currentTime,
      };

      const { insertQuery, insertParams } = insertDataQuery(
        "production.missions",
        payload,
      );

      await pool.query(insertQuery, insertParams);

      return res.status(200).json({
        message: "Mission started",
        status: 1,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  // async EndMission(req: RequestAuthType, res: Response) {
  //   const userId = req["auth"]?.userId;
  //   const { activity_tag } = req.body;

  //   const FIND_ACTIVE_QUERY = `
  //   SELECT * FROM production.missions
  //   WHERE mission_user_id = $1 AND mission_status = 'active'
  //   ORDER BY mission_id DESC LIMIT 1
  // `;

  //   const UPDATE_MISSION_QUERY = `
  //   UPDATE production.missions
  //   SET
  //     mission_end_time = $1,
  //     mission_duration = $2,
  //     mission_time_points = $3,
  //     mission_status = $4,
  //     mission_activity_tag = $5,
  //     mission_updated_at = $6
  //   WHERE mission_id = $7
  //   RETURNING *;
  // `;

  //   const GET_USER_QUERY = `
  //   SELECT user_current_streak, user_last_mission_date, user_longest_streak
  //   FROM production.usertable
  //   WHERE user_id = $1
  // `;

  //   const UPDATE_USER_QUERY = `
  //   UPDATE production.usertable
  //   SET
  //     user_total_time_points = user_total_time_points + $1,
  //     user_current_streak = $2,
  //     user_longest_streak = $3,
  //     user_last_mission_date = $4
  //   WHERE user_id = $5
  // `;

  //   try {
  //     // 🔹 1. active mission check
  //     const activeRes = await pool.query(FIND_ACTIVE_QUERY, [userId]);

  //     if (activeRes.rows.length === 0) {
  //       return res.status(200).json({
  //         message: "No active mission found",
  //         status: 0,
  //       });
  //     }

  //     const mission = activeRes.rows[0];
  //     const endTime = Math.floor(Date.now() / 1000);

  //     // 🔹 2. duration (minutes)
  //     const duration = Math.floor((endTime - mission.mission_start_time) / 60);

  //     let points = 0;
  //     let status = "short";

  //     if (duration >= 5) {
  //       points = duration;
  //       status = "completed";
  //     }

  //     // 🔹 3. update mission
  //     await pool.query(UPDATE_MISSION_QUERY, [
  //       endTime,
  //       duration,
  //       points,
  //       status,
  //       activity_tag || null,
  //       endTime,
  //       mission.mission_id,
  //     ]);

  //     // ❗ short mission → no streak
  //     if (status === "short") {
  //       return res.status(200).json({
  //         message: "Mission too short, no points awarded",
  //         status: 1,
  //       });
  //     }

  //     // 🔹 4. get user
  //     const userRes = await pool.query(GET_USER_QUERY, [userId]);
  //     const userData = userRes.rows[0];

  //     // 🔹 5. streak logic (SAFE)
  //     const today = new Date();
  //     today.setHours(0, 0, 0, 0);

  //     let newStreak = 1;
  //     let longestStreak = userData?.user_longest_streak || 0;

  //     if (userData?.user_last_mission_date) {
  //       const last = new Date(userData.user_last_mission_date);
  //       last.setHours(0, 0, 0, 0);

  //       const diff = (today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);

  //       if (diff === 1) {
  //         newStreak = (userData.user_current_streak || 0) + 1;
  //       } else if (diff === 0) {
  //         newStreak = userData.user_current_streak || 1;
  //       } else {
  //         newStreak = 1; // reset
  //       }
  //     }

  //     // 🔹 6. longest streak
  //     if (newStreak > longestStreak) {
  //       longestStreak = newStreak;
  //     }

  //     const todayStr = today.toISOString().split("T")[0];

  //     // 🔹 7. update user
  //     await pool.query(UPDATE_USER_QUERY, [
  //       points,
  //       newStreak,
  //       longestStreak,
  //       todayStr,
  //       userId,
  //     ]);

  //     return res.status(200).json({
  //       message: "Mission completed",
  //       status: 1,
  //     });
  //   } catch (error) {
  //     logger.error(error);
  //     return res.status(500).json({
  //       message: "Internal server error",
  //     });
  //   }
  // }

  // async EndMission(req: RequestAuthType, res: Response) {
  //   const userId = req["auth"]?.userId;
  //   const { activity_tag } = req.body;

  //   const FIND_ACTIVE_QUERY = `
  //   SELECT * FROM production.missions
  //   WHERE mission_user_id = $1 AND mission_status = 'active'
  //   ORDER BY mission_id DESC LIMIT 1
  // `;

  //   const GET_USER_QUERY = `
  //   SELECT
  //     user_current_streak,
  //     user_last_mission_date,
  //     user_longest_streak,
  //     user_total_time_points,
  //     user_total_missions
  //   FROM production.usertable
  //   WHERE user_id = $1
  // `;

  //   const UPDATE_MISSION_QUERY = `
  //   UPDATE production.missions
  //   SET
  //     mission_end_time = $1,
  //     mission_duration = $2,
  //     mission_time_points = $3,
  //     mission_status = $4,
  //     mission_activity_tag = $5,
  //     mission_updated_at = $6
  //   WHERE mission_id = $7
  // `;

  //   const UPDATE_USER_QUERY = `
  //   UPDATE production.usertable
  //   SET
  //     user_total_time_points = $1,
  //     user_total_missions = $2,
  //     user_current_streak = $3,
  //     user_longest_streak = $4,
  //     user_last_mission_date = $5
  //   WHERE user_id = $6
  // `;

  //   try {
  //     const activeRes = await pool.query(FIND_ACTIVE_QUERY, [userId]);

  //     if (activeRes.rows.length === 0) {
  //       return res.status(200).json({
  //         message: "No active mission found",
  //         status: 0,
  //       });
  //     }

  //     const mission = activeRes.rows[0];
  //     const now = Math.floor(Date.now() / 1000);

  //     // 🔥 duration (minutes)
  //     let duration = Math.floor((now - mission.mission_start_time) / 60);

  //     // 🔥 max 8 hours cap
  //     let isAutoEnd = false;
  //     if (duration >= 480) {
  //       duration = 480;
  //       isAutoEnd = true;
  //     }

  //     // ❌ invalid mission (<20 min)
  //     if (duration < 20) {
  //       await pool.query(UPDATE_MISSION_QUERY, [
  //         now,
  //         duration,
  //         duration,
  //         "short",
  //         activity_tag || null,
  //         now,
  //         mission.mission_id,
  //       ]);

  //       return res.status(200).json({
  //         message: "Mission invalid (<20 min)",
  //         status: 1,
  //       });
  //     }

  //     // 🔥 TIME formula
  //     let points = Math.round(10 * Math.sqrt(duration));

  //     // 🔥 auto-end penalty
  //     if (isAutoEnd) {
  //       points = Math.floor(points * 0.5);
  //     }

  //     // 🔹 update mission
  //     await pool.query(UPDATE_MISSION_QUERY, [
  //       now,
  //       duration,
  //       points,
  //       "completed",
  //       activity_tag || null,
  //       now,
  //       mission.mission_id,
  //     ]);

  //     // 🔹 get user
  //     const userRes = await pool.query(GET_USER_QUERY, [userId]);
  //     const user = userRes.rows[0];

  //     // 🔥 streak logic
  //     const today = new Date();
  //     today.setHours(0, 0, 0, 0);

  //     let newStreak = 1;
  //     let longest = user.user_longest_streak || 0;

  //     if (user.user_last_mission_date) {
  //       const last = new Date(user.user_last_mission_date);
  //       last.setHours(0, 0, 0, 0);

  //       const diff = (today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);

  //       if (diff === 1) {
  //         newStreak = (user.user_current_streak || 0) + 1;
  //       } else if (diff === 0) {
  //         newStreak = user.user_current_streak;
  //       } else {
  //         newStreak = 1;

  //         // 🔥 penalty (missed day)
  //         user.user_total_time_points = Math.max(
  //           0,
  //           user.user_total_time_points - 200,
  //         );
  //       }
  //     }

  //     if (newStreak > longest) longest = newStreak;

  //     const todayStr = today.toISOString().split("T")[0];

  //     // 🔥 lifetime update
  //     const updatedPoints = user.user_total_time_points + points;
  //     const updatedMissions = (user.user_total_missions || 0) + 1;

  //     await pool.query(UPDATE_USER_QUERY, [
  //       updatedPoints,
  //       updatedMissions,
  //       newStreak,
  //       longest,
  //       todayStr,
  //       userId,
  //     ]);

  //     return res.status(200).json({
  //       message: "Mission completed",
  //       status: 1,
  //       data: {
  //         duration,
  //         points,
  //         auto_end: isAutoEnd,
  //       },
  //     });
  //   } catch (error) {
  //     logger.error(error);
  //     return res.status(500).json({
  //       message: "Internal server error",
  //     });
  //   }
  // }
  // async EndMission(req: RequestAuthType, res: Response) {
  //   const userId = req["auth"]?.userId;
  //   const { activity_tag } = req.body;

  //   const FIND_ACTIVE_QUERY = `
  //   SELECT * FROM production.missions
  //   WHERE mission_user_id = $1 AND mission_status = 'active'
  //   ORDER BY mission_id DESC LIMIT 1
  // `;

  //   // ❌ removed user_total_missions
  //   const GET_USER_QUERY = `
  //   SELECT
  //     user_current_streak,
  //     user_last_mission_date,
  //     user_longest_streak,
  //     user_total_time_points
  //   FROM production.usertable
  //   WHERE user_id = $1
  // `;

  //   const UPDATE_MISSION_QUERY = `
  //   UPDATE production.missions
  //   SET
  //     mission_end_time = $1,
  //     mission_duration = $2,
  //     mission_time_points = $3,
  //     mission_status = $4,
  //     mission_activity_tag = $5,
  //     mission_updated_at = $6
  //   WHERE mission_id = $7
  // `;

  //   // ❌ removed user_total_missions
  //   const UPDATE_USER_QUERY = `
  //   UPDATE production.usertable
  //   SET
  //     user_total_time_points = $1,
  //     user_current_streak = $2,
  //     user_longest_streak = $3,
  //     user_last_mission_date = $4
  //   WHERE user_id = $5
  // `;

  //   try {
  //     const activeRes = await pool.query(FIND_ACTIVE_QUERY, [userId]);

  //     if (activeRes.rows.length === 0) {
  //       return res.status(200).json({
  //         message: "No active mission found",
  //         status: 0,
  //       });
  //     }

  //     const mission = activeRes.rows[0];
  //     const now = Math.floor(Date.now() / 1000);

  //     let duration = Math.floor((now - mission.mission_start_time) / 60);

  //     let isAutoEnd = false;
  //     if (duration >= 480) {
  //       duration = 480;
  //       isAutoEnd = true;
  //     }

  //     // 🔥 IST DATE FIX
  //     const today = new Date(
  //       new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
  //     );
  //     today.setHours(0, 0, 0, 0);
  //     const todayStr = today.toISOString().split("T")[0];

  //     const userRes = await pool.query(GET_USER_QUERY, [userId]);
  //     const user = userRes.rows[0];

  //     let updatedPoints = user.user_total_time_points || 0;
  //     let newStreak = user.user_current_streak || 0;
  //     let longest = user.user_longest_streak || 0;

  //     // =========================
  //     // ❌ SHORT (<20)
  //     // =========================
  //     if (duration < 20) {
  //       await pool.query(UPDATE_MISSION_QUERY, [
  //         now,
  //         duration,
  //         duration, // short = duration points
  //         "short",
  //         activity_tag || null,
  //         now,
  //         mission.mission_id,
  //       ]);

  //       updatedPoints += duration;

  //       await pool.query(UPDATE_USER_QUERY, [
  //         updatedPoints,
  //         newStreak,
  //         longest,
  //         todayStr,
  //         userId,
  //       ]);

  //       return res.status(200).json({
  //         message: "Mission invalid (<20 min)",
  //         status: 1,
  //       });
  //     }

  //     // =========================
  //     // ✅ COMPLETED
  //     // =========================
  //     let points = Math.round(10 * Math.sqrt(duration));

  //     if (isAutoEnd) {
  //       points = Math.floor(points * 0.5);
  //     }

  //     await pool.query(UPDATE_MISSION_QUERY, [
  //       now,
  //       duration,
  //       points,
  //       "completed",
  //       activity_tag || null,
  //       now,
  //       mission.mission_id,
  //     ]);

  //     // 🔥 STREAK LOGIC
  //     if (user.user_last_mission_date) {
  //       const last = new Date(user.user_last_mission_date);
  //       last.setHours(0, 0, 0, 0);

  //       const diff = (today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);

  //       if (diff === 1) {
  //         newStreak = newStreak + 1;
  //       } else if (diff === 0) {
  //         newStreak = newStreak;
  //       } else if (diff > 1) {
  //         newStreak = 0;

  //         // 🔥 penalty once
  //         updatedPoints = Math.max(0, updatedPoints - 200);
  //       }
  //     } else {
  //       newStreak = 1;
  //     }

  //     if (newStreak > longest) longest = newStreak;

  //     updatedPoints += points;

  //     await pool.query(UPDATE_USER_QUERY, [
  //       updatedPoints,
  //       newStreak,
  //       longest,
  //       todayStr,
  //       userId,
  //     ]);

  //     return res.status(200).json({
  //       message: "Mission completed",
  //       status: 1,
  //       data: {
  //         duration,
  //         points,
  //         auto_end: isAutoEnd,
  //       },
  //     });
  //   } catch (error) {
  //     logger.error(error);
  //     return res.status(500).json({
  //       message: "Internal server error",
  //     });
  //   }
  // }
  // async EndMission(req: RequestAuthType, res: Response) {
  //   const userId = req["auth"]?.userId;
  //   const { activity_tag } = req.body;

  //   const FIND_ACTIVE_QUERY = `
  //   SELECT * FROM production.missions
  //   WHERE mission_user_id = $1 AND mission_status = 'active'
  //   ORDER BY mission_id DESC LIMIT 1
  // `;

  //   const GET_USER_QUERY = `
  //   SELECT
  //     user_current_streak,
  //     user_last_mission_date,
  //     user_longest_streak,
  //     user_total_time_points
  //   FROM production.usertable
  //   WHERE user_id = $1
  // `;

  //   const UPDATE_MISSION_QUERY = `
  //   UPDATE production.missions
  //   SET
  //     mission_end_time = $1,
  //     mission_duration = $2,
  //     mission_time_points = $3,
  //     mission_status = $4,
  //     mission_activity_tag = $5,
  //     mission_updated_at = $6
  //   WHERE mission_id = $7
  // `;

  //   const UPDATE_USER_QUERY = `
  //   UPDATE production.usertable
  //   SET
  //     user_total_time_points = $1,
  //     user_current_streak = $2,
  //     user_longest_streak = $3,
  //     user_last_mission_date = $4
  //   WHERE user_id = $5
  // `;

  //   try {
  //     const activeRes = await pool.query(FIND_ACTIVE_QUERY, [userId]);

  //     if (activeRes.rows.length === 0) {
  //       return res.status(200).json({
  //         message: "No active mission found",
  //         status: 1,
  //       });
  //     }

  //     const mission = activeRes.rows[0];
  //     const now = Math.floor(Date.now() / 1000);

  //     let duration = Math.floor((now - mission.mission_start_time) / 60);

  //     let isAutoEnd = false;
  //     if (duration >= 480) {
  //       duration = 480;
  //       isAutoEnd = true;
  //     }

  //     // 🔥 IST DATE
  //     const today = new Date(
  //       new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
  //     );
  //     today.setHours(0, 0, 0, 0);
  //     const todayStr = today.toISOString().split("T")[0];

  //     const userRes = await pool.query(GET_USER_QUERY, [userId]);
  //     const user = userRes.rows[0];

  //     let updatedPoints = user.user_total_time_points || 0;
  //     let newStreak = user.user_current_streak || 0;
  //     let longest = user.user_longest_streak || 0;

  //     // 🔥 FLAG (most important)
  //     let shouldUpdateStreak = true;

  //     if (user.user_last_mission_date) {
  //       const last = new Date(user.user_last_mission_date);
  //       last.setHours(0, 0, 0, 0);

  //       const diff = (today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);

  //       if (diff === 0) {
  //         // ✅ SAME DAY → kuch bhi update nahi karna
  //         shouldUpdateStreak = false;
  //       } else if (diff === 1) {
  //         newStreak = newStreak + 1;
  //       } else if (diff > 1) {
  //         newStreak = 1;
  //         updatedPoints = Math.max(0, updatedPoints - 200);
  //       }
  //     } else {
  //       newStreak = 1;
  //     }

  //     if (shouldUpdateStreak && newStreak > longest) {
  //       longest = newStreak;
  //     }

  //     // =========================
  //     // ❌ SHORT
  //     // =========================
  //     if (duration < 20) {
  //       await pool.query(UPDATE_MISSION_QUERY, [
  //         now,
  //         duration,
  //         duration,
  //         "short",
  //         activity_tag || null,
  //         now,
  //         mission.mission_id,
  //       ]);

  //       updatedPoints += duration;

  //       await pool.query(UPDATE_USER_QUERY, [
  //         updatedPoints,
  //         shouldUpdateStreak ? newStreak : user.user_current_streak,
  //         shouldUpdateStreak ? longest : user.user_longest_streak,
  //         shouldUpdateStreak ? todayStr : user.user_last_mission_date,
  //         userId,
  //       ]);

  //       return res.status(200).json({
  //         message: "Mission invalid (<20 min)",
  //         status: 1,
  //       });
  //     }

  //     // =========================
  //     // ✅ COMPLETED
  //     // =========================
  //     let points = Math.round(10 * Math.sqrt(duration));

  //     if (isAutoEnd) {
  //       points = Math.floor(points * 0.5);
  //     }

  //     await pool.query(UPDATE_MISSION_QUERY, [
  //       now,
  //       duration,
  //       points,
  //       "completed",
  //       activity_tag || null,
  //       now,
  //       mission.mission_id,
  //     ]);

  //     updatedPoints += points;

  //     await pool.query(UPDATE_USER_QUERY, [
  //       updatedPoints,
  //       shouldUpdateStreak ? newStreak : user.user_current_streak,
  //       shouldUpdateStreak ? longest : user.user_longest_streak,
  //       shouldUpdateStreak ? todayStr : user.user_last_mission_date,
  //       userId,
  //     ]);

  //     return res.status(200).json({
  //       message: "Mission completed",
  //       status: 1,
  //       data: {
  //         duration,
  //         points,
  //         auto_end: isAutoEnd,
  //       },
  //     });
  //   } catch (error) {
  //     logger.error(error);
  //     return res.status(500).json({
  //       message: "Internal server error",
  //     });
  //   }
  // }

  async EndMission(req: RequestAuthType, res: Response) {
    const userId = req["auth"]?.userId;
    const { activity_tag } = req.body;

    const FIND_ACTIVE_QUERY = `
    SELECT * FROM production.missions
    WHERE mission_user_id = $1 AND mission_status = 'active'
    ORDER BY mission_id DESC LIMIT 1
  `;

    const GET_USER_QUERY = `
    SELECT
      user_current_streak,
      user_last_mission_date,
      user_longest_streak,
      user_total_time_points
    FROM production.usertable
    WHERE user_id = $1
  `;

    const UPDATE_MISSION_QUERY = `
    UPDATE production.missions
    SET
      mission_end_time = $1,
      mission_duration = $2,
      mission_time_points = $3,
      mission_status = $4,
      mission_activity_tag = $5,
      mission_updated_at = $6
    WHERE mission_id = $7
  `;

    const UPDATE_USER_QUERY = `
    UPDATE production.usertable
    SET
      user_total_time_points = $1,
      user_current_streak = $2,
      user_longest_streak = $3,
      user_last_mission_date = $4
    WHERE user_id = $5
  `;

    try {
      const activeRes = await pool.query(FIND_ACTIVE_QUERY, [userId]);

      if (activeRes.rows.length === 0) {
        return res.status(200).json({
          message: "No active mission found",
          status: 1,
        });
      }

      const mission = activeRes.rows[0];
      const now = Math.floor(Date.now() / 1000);

      let duration = Math.floor((now - mission.mission_start_time) / 60);

      let isAutoEnd = false;
      if (duration >= 480) {
        duration = 480;
        isAutoEnd = true;
      }

      // =========================
      // 🔥 IST TODAY (CORRECT)
      // =========================
      const todayStr = new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Kolkata",
      });

      const today = new Date(
        new Date().toLocaleString("en-US", {
          timeZone: "Asia/Kolkata",
        }),
      );
      today.setHours(0, 0, 0, 0);

      const userRes = await pool.query(GET_USER_QUERY, [userId]);
      const user = userRes.rows[0];

      let updatedPoints = user.user_total_time_points || 0;
      let newStreak = user.user_current_streak || 0;
      let longest = user.user_longest_streak || 0;

      // =========================
      // 🔥 LAST DATE (FIXED IST)
      // =========================
      let isSameDay = false;

      if (user.user_last_mission_date) {
        const last = new Date(
          new Date(user.user_last_mission_date).toLocaleString("en-US", {
            timeZone: "Asia/Kolkata",
          }),
        );

        last.setHours(0, 0, 0, 0);

        const diff = (today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);

        if (diff === 0) {
          isSameDay = true;
        } else if (diff === 1) {
          newStreak = newStreak + 1;
        } else if (diff > 1) {
          newStreak = 1;
          updatedPoints = Math.max(0, updatedPoints - 200);
        }
      } else {
        newStreak = 1;
      }

      if (!isSameDay && newStreak > longest) {
        longest = newStreak;
      }

      // =========================
      // ❌ SHORT
      // =========================
      if (duration < 20) {
        await pool.query(UPDATE_MISSION_QUERY, [
          now,
          duration,
          duration,
          "short",
          activity_tag || null,
          now,
          mission.mission_id,
        ]);

        updatedPoints += duration;

        await pool.query(UPDATE_USER_QUERY, [
          updatedPoints,
          isSameDay ? user.user_current_streak : newStreak,
          isSameDay ? user.user_longest_streak : longest,
          isSameDay ? user.user_last_mission_date : todayStr,
          userId,
        ]);

        return res.status(200).json({
          message: "Mission invalid (<20 min)",
          status: 1,
        });
      }

      // =========================
      // ✅ COMPLETED
      // =========================
      // let points = Math.round(10 * Math.sqrt(duration));

      // if (isAutoEnd) {
      //   points = Math.floor(points * 0.5);
      // }

      await pool.query(UPDATE_MISSION_QUERY, [
        now,
        duration,
        duration,
        "completed",
        activity_tag || null,
        now,
        mission.mission_id,
      ]);

      updatedPoints += duration;

      await pool.query(UPDATE_USER_QUERY, [
        updatedPoints,
        isSameDay ? user.user_current_streak : newStreak,
        isSameDay ? user.user_longest_streak : longest,
        isSameDay ? user.user_last_mission_date : todayStr,
        userId,
      ]);

      return res.status(200).json({
        message: "Mission completed",
        status: 1,
        data: {
          duration,
          points: duration,
          auto_end: isAutoEnd,
        },
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }

  async GetActiveMission(req: RequestAuthType, res: Response) {
    const userId = req["auth"]?.userId;

    const QUERY = `
    SELECT 
      m.*,
      c.*
    FROM production.missions m
    LEFT JOIN production.crews c 
      ON m.mission_crew_id = c.crew_id
    WHERE m.mission_user_id = $1 
      AND m.mission_status = 'active'
    ORDER BY m.mission_id DESC 
    LIMIT 1
  `;

    try {
      const result = await pool.query(QUERY, [userId]);

      if (result.rows.length === 0) {
        return res.status(200).json({
          message: "No active mission found",
          data: [],
          status: 1,
        });
      }

      const mission = result.rows[0];

      // 🔥 elapsed time (seconds + minutes)
      const currentTime = Math.floor(Date.now() / 1000);
      const elapsedSeconds = currentTime - mission.mission_start_time;

      // 🔥 breakdown
      const hours = Math.floor(elapsedSeconds / 3600);
      const minutes = Math.floor((elapsedSeconds % 3600) / 60);
      const seconds = elapsedSeconds % 60;

      const response = {
        ...mission,
        elapsed_hours: hours,
        elapsed_mm: minutes,
        elapsed_ss: seconds,
      };

      return res.status(200).json({
        message: "Active Mission retrieved successfully",
        data: isValEmpty(response),
        status: 1,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }

  // async GetMissionHistory(req: RequestAuthType, res: Response) {
  //   const userId = req["auth"]?.userId;

  //   const page = parseInt(req.query.page as string) || 1;
  //   const limit = parseInt(req.query.pageSize as string) || 10;
  //   const status = req.query.status as string;
  //   const offset = (page - 1) * limit;

  //   let QUERY = `
  //   SELECT
  //     m.*,
  //     c.*
  //   FROM production.missions m
  //   LEFT JOIN production.crews c
  //     ON m.mission_crew_id = c.crew_id
  //   WHERE m.mission_user_id = $1
  // `;

  //   const values: any[] = [userId];

  //   if (status) {
  //     values.push(status);
  //     QUERY += ` AND m.mission_status = $${values.length}`;
  //   }

  //   values.push(limit);
  //   values.push(offset);

  //   QUERY += `
  //   ORDER BY m.mission_id DESC
  //   LIMIT $${values.length - 1}
  //   OFFSET $${values.length}
  // `;

  //   // 🔥 USER STREAK + TOTAL TIME
  //   const USER_QUERY = `
  //   SELECT
  //     user_current_streak,
  //     user_longest_streak,
  //     user_total_time_points,
  //     user_last_mission_date
  //   FROM production.usertable
  //   WHERE user_id = $1
  // `;

  //   try {
  //     const [result, userRes] = await Promise.all([
  //       pool.query(QUERY, values),
  //       pool.query(USER_QUERY, [userId]),
  //     ]);

  //     if (result.rows.length === 0) {
  //       return res.status(200).json({
  //         message: "No missions found",
  //         data: [],
  //         status: 1,
  //       });
  //     }

  //     const userData = userRes.rows[0] || {};

  //     // 🔥 DAILY GROUPING (for UI like image)
  //     const dailyMap: any = {};

  //     result.rows.forEach((m: any) => {
  //       const date = new Date(m.mission_start_time * 1000)
  //         .toISOString()
  //         .split("T")[0];

  //       if (!dailyMap[date]) {
  //         dailyMap[date] = 0;
  //       }

  //       dailyMap[date] += Number(m.mission_time_points || 0);
  //     });

  //     const daily_history = Object.keys(dailyMap).map((date) => ({
  //       date,
  //       total_time: dailyMap[date],
  //     }));

  //     // 🔥 streak break logic
  //     let streak_interrupted_date = null;

  //     if (userData.user_last_mission_date) {
  //       const last = new Date(userData.user_last_mission_date);
  //       const today = new Date();
  //       today.setHours(0, 0, 0, 0);
  //       last.setHours(0, 0, 0, 0);

  //       const diff = (today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);

  //       if (diff > 1) {
  //         streak_interrupted_date = last.toISOString().split("T")[0];
  //       }
  //     }

  //     return res.status(200).json({
  //       message: "Missions retrieved successfully",
  //       page,
  //       limit,
  //       count: result.rows.length,

  //       // 🔥 NEW KEYS (UI MATCH)
  //       summary: {
  //         longest_streak: Number(userData.user_longest_streak) || 0,
  //         current_streak: Number(userData.user_current_streak) || 0,
  //         total_time: Number(userData.user_total_time_points) || 0,
  //         streak_interrupted_date,
  //       },

  //       daily_history: isValEmptyArray(daily_history), // 🔥 for list UI

  //       data: isValEmptyArray(result.rows),
  //       status: 1,
  //     });
  //   } catch (error) {
  //     logger.error(error);
  //     return res.status(500).json({
  //       message: "Internal server error",
  //     });
  //   }
  // }
  async GetMissionHistory(req: RequestAuthType, res: Response) {
    const userId = req["auth"]?.userId;

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.pageSize as string) || 10;
    const status = req.query.status as string;
    const offset = (page - 1) * limit;

    let QUERY = `
    SELECT 
      m.*,
      c.*
    FROM production.missions m
    LEFT JOIN production.crews c 
      ON m.mission_crew_id = c.crew_id
    WHERE m.mission_user_id = $1 AND m.mission_status != 'active'
  `;

    const values: any[] = [userId];

    if (status) {
      values.push(status);
      QUERY += ` AND m.mission_status = $${values.length}`;
    }

    values.push(limit);
    values.push(offset);

    QUERY += `
    ORDER BY m.mission_id DESC
    LIMIT $${values.length - 1}
    OFFSET $${values.length}
  `;

    const USER_QUERY = `
    SELECT 
      user_current_streak,
      user_longest_streak,
      user_total_time_points,
      user_last_mission_date
    FROM production.usertable
    WHERE user_id = $1
  `;

    const STATS_QUERY = `
    SELECT 
      COUNT(*) AS total_missions,
      COALESCE(SUM(mission_time_points), 0) AS total_points
    FROM production.missions
    WHERE mission_user_id = $1
  `;

    try {
      const [result, userRes, statsRes] = await Promise.all([
        pool.query(QUERY, values),
        pool.query(USER_QUERY, [userId]),
        pool.query(STATS_QUERY, [userId]),
      ]);

      const userData = userRes.rows[0] || {};
      const stats = statsRes.rows[0] || {};

      // =========================
      // 🔥 CORRECT INTERRUPT LOGIC
      // =========================
      let streak_interrupted_date = "";

      const today = new Date(
        new Date().toLocaleString("en-US", {
          timeZone: "Asia/Kolkata",
        }),
      );
      today.setHours(0, 0, 0, 0);

      if (userData.user_last_mission_date) {
        const last = new Date(userData.user_last_mission_date);
        last.setHours(0, 0, 0, 0);

        const diff = (today.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);

        if (diff >= 2) {
          const breakDate = new Date(last);
          breakDate.setDate(breakDate.getDate() + 1);

          streak_interrupted_date = breakDate.toISOString().split("T")[0];
        }
      }

      // =========================
      // 🔥 FINAL RESPONSE
      // =========================
      return res.status(200).json({
        message: "Missions retrieved successfully",
        page,
        limit,
        count: result.rows.length,
        summary: {
          longest_streak: Number(userData.user_longest_streak) || 0,
          current_streak: Number(userData.user_current_streak) || 0,
          total_time: Number(stats.total_points) || 0,
          streak_interrupted_date,
        },
        data: isValEmptyArray(result.rows),
        status: 1,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }

  async GetCrewVsCrewLeaderboard(req: RequestAuthType, res: Response) {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.pageSize as string) || 10;
    const offset = (page - 1) * limit;

    const QUERY = `
    SELECT 
      c.*,
      SUM(u.user_total_time_points) AS total_points,
      COUNT(u.user_id) AS total_members
    FROM production.crews c
    LEFT JOIN production.usertable u 
      ON u.user_crew_id = c.crew_id
    GROUP BY c.crew_id
    ORDER BY total_points DESC NULLS LAST
    LIMIT $1 OFFSET $2
  `;

    const COUNT_QUERY = `
    SELECT COUNT(*) FROM production.crews
  `;

    try {
      const countRes = await pool.query(COUNT_QUERY);
      const total = Number(countRes.rows[0].count);

      const result = await pool.query(QUERY, [limit, offset]);

      if (result.rows.length === 0) {
        return res.status(200).json({
          message: "No crews found",
          data: [],
          status: 0,
        });
      }

      const leaderboard = result.rows.map((crew: any, index: number) => ({
        rank: offset + index + 1, // 🔥 global rank fix
        crew_id: crew.crew_id,
        crew_name: crew.crew_name,
        crew_avatar: crew.crew_avtar,
        crew_bio: crew.crew_bio,
        total_points: Number(crew.total_points) || 0,
        total_members: Number(crew.total_members) || 0,
      }));

      return res.status(200).json({
        message: "Crew leaderboard fetched successfully",
        page,
        limit,
        total,
        data: leaderboard,
        status: 1,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }

  async GetCrewUserLeaderboard(req: RequestAuthType, res: Response) {
    const userId = req["auth"]?.userId;

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.pageSize as string) || 10;
    const offset = (page - 1) * limit;

    const CREW_QUERY = `
    SELECT 
      c.*,
      u.user_name AS created_by_name
    FROM production.crews c
    JOIN production.usertable u 
      ON c.crew_created_by = u.user_id
    WHERE c.crew_id = (
      SELECT user_crew_id 
      FROM production.usertable 
      WHERE user_id = $1
    )
  `;

    const MEMBERS_QUERY = `
    SELECT 
      user_id,
      user_name,
      user_avatar,
      user_total_time_points,
      user_current_streak,
      user_longest_streak,
      CASE 
        WHEN user_id = (
          SELECT crew_created_by 
          FROM production.crews 
          WHERE crew_id = $1
        ) THEN 'admin'
        ELSE 'member'
      END AS role
    FROM production.usertable
    WHERE user_crew_id = $1
    ORDER BY user_total_time_points DESC
    LIMIT $2 OFFSET $3
  `;

    const COUNT_QUERY = `
    SELECT COUNT(*) 
    FROM production.usertable 
    WHERE user_crew_id = $1
  `;

    try {
      const crewRes = await pool.query(CREW_QUERY, [userId]);

      if (crewRes.rows.length === 0) {
        return res.status(200).json({
          message: "Crew not found",
          status: 0,
        });
      }

      const crew = crewRes.rows[0];

      const countRes = await pool.query(COUNT_QUERY, [crew.crew_id]);
      const totalMembers = Number(countRes.rows[0].count);

      const membersRes = await pool.query(MEMBERS_QUERY, [
        crew.crew_id,
        limit,
        offset,
      ]);

      let currentUserRank = null;

      const members = membersRes.rows.map((member: any, index: number) => {
        const rank = offset + index + 1; // 🔥 global rank fix

        if (member.user_id === userId) {
          currentUserRank = rank;
        }

        return {
          rank,
          user_id: member.user_id,
          user_name: member.user_name,
          user_avatar: member.user_avatar,
          points: Number(member.user_total_time_points) || 0,
          current_streak: Number(member.user_current_streak) || 0,
          longest_streak: Number(member.user_longest_streak) || 0,
          role: member.role,
        };
      });

      return res.status(200).json({
        message: "Crew user leaderboard fetched successfully",
        page,
        limit,
        total_members: totalMembers,
        data: {
          crew_id: crew.crew_id,
          crew_name: crew.crew_name,
          crew_avatar: crew.crew_avtar,
          crew_bio: crew.crew_bio,
          created_by_name: crew.created_by_name,
          current_user_rank: currentUserRank,
          members,
        },
        status: 1,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }

  async GetGlobalUserLeaderboard(req: RequestAuthType, res: Response) {
    const userId = req["auth"]?.userId;

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.pageSize as string) || 10;
    const offset = (page - 1) * limit;

    const QUERY = `
    SELECT 
      user_id,
      user_name,
      user_avatar,
      user_total_time_points,
      user_current_streak,
      user_longest_streak
    FROM production.usertable
    ORDER BY user_total_time_points DESC
    LIMIT $1 OFFSET $2
  `;

    const COUNT_QUERY = `
    SELECT COUNT(*) FROM production.usertable
  `;

    try {
      // 🔹 total users
      const countRes = await pool.query(COUNT_QUERY);
      const totalUsers = Number(countRes.rows[0].count);

      // 🔹 paginated users
      const result = await pool.query(QUERY, [limit, offset]);

      if (result.rows.length === 0) {
        return res.status(200).json({
          message: "No users found",
          data: [],
          status: 0,
        });
      }

      // 🔥 rank logic (global rank)
      const users = result.rows.map((user: any, index: number) => ({
        rank: offset + index + 1,
        user_id: user.user_id,
        user_name: user.user_name,
        user_avatar: user.user_avatar,
        points: Number(user.user_total_time_points) || 0,
        current_streak: Number(user.user_current_streak) || 0,
        longest_streak: Number(user.user_longest_streak) || 0,
      }));

      // 🔥 current user rank (global)
      let currentUserRank = null;

      if (userId) {
        const rankQuery = `
        SELECT COUNT(*) + 1 AS rank
        FROM production.usertable
        WHERE user_total_time_points > (
          SELECT user_total_time_points 
          FROM production.usertable 
          WHERE user_id = $1
        )
      `;

        const rankRes = await pool.query(rankQuery, [userId]);
        currentUserRank = Number(rankRes.rows[0].rank);
      }

      return res.status(200).json({
        message: "Global leaderboard fetched successfully",
        page,
        limit,
        total_users: totalUsers,
        current_user_rank: currentUserRank,
        data: users,
        status: 1,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }
}
