import bcrypt from "bcrypt";
import { Response } from "express";

import { RequestAuthType } from "./CoreService";
import { pool } from "../utils/Connection";
import {
  insertDataQuery,
  isValEmpty,
  isValEmptyArray,
  Time,
  updateDataSelectedFields,
} from "../utils/Higherorderfunction";
import logger from "../middlewares/Logger";
import { generateAccessAndRefereshTokens } from "../utils/generateRefereshToken";
import { exclude, excludeArray } from "../utils/Excludefied";
import { uploadFile } from "../utils/file-upload";
// import { PromocodeNotification } from "./Helper";

export default class AdminModel {
  //...............Admin......................

  async AdminSignup(req: RequestAuthType, res: Response) {
    const { userName, password, userRole } = req.body;

    const saltRounds = 10;

    const isUserExistQuery = `SELECT * FROM production.usertable WHERE user_email=$1`;

    const findUserQuery = `SELECT * FROM production.usertable WHERE user_id=$1`;

    const isAdminExisQuery = `SELECT * FROM production.usertable WHERE LOWER(user_role)=LOWER($1)`;

    // watchLog(req);

    try {
      const isAdminExist = await pool.query(isAdminExisQuery, [userRole]);

      if (isAdminExist.rows.length > 0) {
        return res.status(400).json({
          status: 0,
          data: "",
          message: "Admin already exists",
          error: "Admin already exists",
        });
      }

      const hashedPassword = await bcrypt.hash(password, saltRounds);

      const adminData = {
        user_email: userName,
        user_password: hashedPassword,
        user_role: userRole,
      };

      const { insertQuery, insertParams } = insertDataQuery(
        "production.usertable",
        adminData,
      );

      const isExist = await pool.query(isUserExistQuery, [userName]);

      if (isExist.rows.length > 0) {
        return res.status(400).json({
          status: 0,
          message: "User already exists with this name",
          error: "User already exists with this name",
        });
      }

      const addedAdmin = await pool.query(insertQuery, insertParams);

      if (addedAdmin.rows[0].user_id > 0) {
        const users = await pool.query(findUserQuery, [
          addedAdmin.rows[0].user_id,
        ]);

        const removeNullValues = isValEmpty(users.rows[0] || {});

        return res.status(200).json({
          status: 1,
          data: removeNullValues,
          message: "Admin Added Successfully!",
        });
      }
    } catch (error) {
      logger.error(`${error}`);
      return res.status(400).json({
        status: 0,
        message: "Something went wrong",
        error: "Somthing went wrong",
      });
    }
  }

  async AdminLogin(req: RequestAuthType, res: Response) {
    const { userName, password } = req.body;

    const isUserExistQuery = `SELECT * FROM production.usertable WHERE LOWER(user_email) = LOWER($1)`;

    try {
      const user = await pool.query(isUserExistQuery, [userName]);
      console.log("Admin =====>", user.rows[0]);
      if (user.rows.length === 0) {
        return res.status(200).json({
          status: 0,
          message: "No user Found",
          error: "No user Found",
        });
      }

      const { user_password: hashedPassword, user_id } = user.rows[0];

      const isPassword = await bcrypt.compare(password, hashedPassword);

      if (isPassword) {
        const { user_access_token, refresh_token, error } =
          await generateAccessAndRefereshTokens(user_id, "Admin");

        if (error)
          return res.status(500).json({
            status: 0,
            message: "Something went wrong while generating token",
            error: "Something went wrong while generating token",
          });

        return res.status(200).json({
          status: 1,
          data: {
            refresh_token: refresh_token,
            access_token: user_access_token,
          },
          message: "Success",
        });
      } else {
        return res.status(400).json({
          status: 0,
          message: "Invalid credentials",
          error: "Invalid credentials",
        });
      }
    } catch (error) {
      logger.error(`${error}`);
      return res.status(400).json({
        status: 0,
        message: "Something went wrong",
        error: "Somthing went wrong",
      });
    }
  }

  async GetAdminData(req: RequestAuthType, res: Response) {
    const user = req.auth?.userId;
    console.log("user id", user);
    const FIND_USER_BY_ID_QUERY = `SELECT * FROM production.usertable WHERE user_id = $1`;
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    try {
      const userResult = await pool.query(FIND_USER_BY_ID_QUERY, [user]);

      const userData = userResult.rows[0];

      const removeNullValues = isValEmpty(userData);
      const details = exclude(removeNullValues, [
        "user_password",
        "user_device_token",
        "user_otp",
        "user_email_verified",
      ]);

      return res.status(200).json({
        message: "Success",
        data: details,
        status: 1,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  async UpdateAdminData(req: RequestAuthType, res: Response) {
    const user = req.auth?.userId;

    const { ...rest } = req.body;

    const isUserExistQuery = `SELECT * FROM production.usertable WHERE user_id=$1`;
    const UPDATE_USER_QUERY = `SELECT * FROM production.usertable WHERE user_id = $1`;

    try {
      const isUserExistResult = await pool.query(isUserExistQuery, [user]);

      if (isUserExistResult.rows.length === 0) {
        return res.status(404).json({
          status: 0,
          message: "User not found",
        });
      }

      const payload = {
        ...rest,
        user_updated_at: Time(),
      };

      const { updateQuery, updateParams } = updateDataSelectedFields(
        payload,
        user,
        "user_id",
        "production.usertable",
      );

      const updatedResult = await pool.query(updateQuery, updateParams);

      const userResult = await pool.query(UPDATE_USER_QUERY, [user]);
      const userData = userResult.rows[0];

      const removeNullValues = isValEmpty(userData);
      const details = exclude(removeNullValues, [
        "user_password",
        "user_device_token",
        "user_otp",
        "user_email_verified",
      ]);

      return res.status(200).json({
        message: "User updated successfully",
        data: details,
        status: 1,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  // ========================= User Management =========================
  async GetAdminUserList(req: RequestAuthType, res: Response) {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.pageSize as string) || 10;
    const offset = (page - 1) * limit;

    const search = req.query.search as string;
    const isBlocked = req.query.is_blocked as string;
    const isVerified = req.query.is_verified as string;

    // 🔥 FIX: NULL role handle
    let BASE_QUERY = `FROM production.usertable u WHERE COALESCE(LOWER(u.user_role), '') != 'admin'`;

    const values: any[] = [];

    // 🔍 search
    if (search) {
      values.push(`%${search.toLowerCase()}%`);
      BASE_QUERY += ` AND (LOWER(u.user_name) LIKE $${values.length} OR LOWER(u.user_email) LIKE $${values.length})`;
    }

    // 🔥 FIXED FILTER
    if (isBlocked !== undefined && isBlocked !== "") {
      values.push(Number(isBlocked));
      BASE_QUERY += ` AND u.user_is_blocked = $${values.length}`;
    }

    if (isVerified !== undefined && isVerified !== "") {
      values.push(Number(isVerified));
      BASE_QUERY += ` AND u.user_is_verified = $${values.length}`;
    }

    // 🔥 MAIN QUERY WITH PAGINATION
    //   const DATA_QUERY = `
    //   SELECT *
    //   ${BASE_QUERY}
    //   ORDER BY user_created_at DESC
    //   LIMIT $${values.length + 1}
    //   OFFSET $${values.length + 2}
    // `;

    const DATA_QUERY = `
  SELECT 
    u.*,

    (
      SELECT r.rank_name
      FROM production.rank_master r
      WHERE u.user_total_time_points >= r.min_time
        AND (u.user_total_time_points <= r.max_time OR r.max_time IS NULL)
      ORDER BY r.min_time DESC
      LIMIT 1
    ) AS status_level,

    (
      SELECT r.rank_image_url
      FROM production.rank_master r
      WHERE u.user_total_time_points >= r.min_time
        AND (u.user_total_time_points <= r.max_time OR r.max_time IS NULL)
      ORDER BY r.min_time DESC
      LIMIT 1
    ) AS rank_avatar

  ${BASE_QUERY}
  ORDER BY u.user_created_at DESC
  LIMIT $${values.length + 1}
  OFFSET $${values.length + 2}
`;

    const COUNT_QUERY = `SELECT COUNT(*) ${BASE_QUERY}`;

    try {
      const [dataRes, countRes] = await Promise.all([
        pool.query(DATA_QUERY, [...values, limit, offset]), // ✅ FIX
        pool.query(COUNT_QUERY, values),
      ]);

      const data = dataRes.rows.map((u: any) => ({
        ...u,
        user_avatar: u.rank_avatar || u.user_avatar,
        status_level: u.status_level || "New Recruit",
      }));

      return res.status(200).json({
        message: "User list fetched successfully",
        page,
        limit,
        total: Number(countRes.rows[0].count),
        count: dataRes.rows.length,
        data: isValEmptyArray(data),
        status: 1,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }

  async GetAdminUserDetail(req: RequestAuthType, res: Response) {
    const userId = req.params.userId;

    //   const USER_QUERY = `
    //   SELECT *
    //   FROM production.usertable
    //   WHERE user_id = $1
    // `;

    const USER_QUERY = `
  SELECT 
    u.*,

    (
      SELECT r.rank_name
      FROM production.rank_master r
      WHERE u.user_total_time_points >= r.min_time
        AND (u.user_total_time_points <= r.max_time OR r.max_time IS NULL)
      ORDER BY r.min_time DESC
      LIMIT 1
    ) AS status_level,

    (
      SELECT r.rank_image_url
      FROM production.rank_master r
      WHERE u.user_total_time_points >= r.min_time
        AND (u.user_total_time_points <= r.max_time OR r.max_time IS NULL)
      ORDER BY r.min_time DESC
      LIMIT 1
    ) AS rank_avatar

  FROM production.usertable u
  WHERE u.user_id = $1
`;

    const CREWS_QUERY = `
    SELECT 
      c.crew_id,
      c.crew_name,
      c.crew_avtar,
      c.crew_bio,
      cm.crew_member_role AS role,
      CASE 
        WHEN c.crew_created_by = cm.crew_member_user_id THEN 'admin'
        ELSE 'member'
      END AS crew_role
    FROM production.crew_members cm
    JOIN production.crews c 
      ON c.crew_id = cm.crew_id
    WHERE cm.crew_member_user_id = $1
  `;

    try {
      const userRes = await pool.query(USER_QUERY, [userId]);

      if (userRes.rows.length === 0) {
        return res.status(200).json({
          message: "User not found",
          status: 0,
        });
      }

      const crewsRes = await pool.query(CREWS_QUERY, [userId]);

      const user = userRes.rows[0];

      const finalUser = {
        ...user,

        user_avatar: user.rank_avatar || user.user_avatar,
        status_level: user.status_level || "New Recruit",
      };

      return res.status(200).json({
        message: "User details fetched successfully",
        data: {
          ...finalUser,
          crews: crewsRes.rows, // 🔥 multiple crews
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

  async UpdateAdminUser(req: RequestAuthType, res: Response) {
    const userId = req.params.userId;
    const { ...rest } = req.body;

    const FIND_USER = `SELECT * FROM production.usertable WHERE user_id = $1`;

    try {
      const userRes = await pool.query(FIND_USER, [userId]);

      if (userRes.rows.length === 0) {
        return res.status(200).json({
          message: "User not found",
          status: 0,
        });
      }

      const payload = {
        ...rest,
        user_updated_at: Time(),
      };

      const { updateQuery, updateParams } = updateDataSelectedFields(
        payload,
        userId,
        "user_id",
        "production.usertable",
      );
      const result = await pool.query(updateQuery, updateParams);

      return res.status(200).json({
        message: "User updated successfully",
        status: 1,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }

  async DeleteAdminUser(req: RequestAuthType, res: Response) {
    const userId = req.params.userId;

    const FIND_USER = `SELECT * FROM production.usertable WHERE user_id = $1`;
    const DELETE_QUERY = `DELETE FROM production.usertable WHERE user_id = $1`;

    try {
      const userRes = await pool.query(FIND_USER, [userId]);

      if (userRes.rows.length === 0) {
        return res.status(200).json({
          message: "User not found",
          status: 0,
        });
      }

      await pool.query(DELETE_QUERY, [userId]);

      return res.status(200).json({
        message: "User deleted successfully",
        status: 1,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }

  // ========================= Crew Management =========================
  async GetAdminCrewList(req: RequestAuthType, res: Response) {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.pageSize as string) || 10;
    const offset = (page - 1) * limit;

    const search = req.query.search as string;

    const conditions: string[] = [];
    const values: any[] = [];

    if (search && search.trim() !== "") {
      values.push(`%${search.toLowerCase()}%`);
      conditions.push(`LOWER(c.crew_name) LIKE $${values.length}`);
    }

    const WHERE = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const DATA_QUERY = `
    SELECT 
      c.*,
      u.user_name AS created_by_name,
      COUNT(cm.crew_member_user_id) AS total_members,
      COALESCE(SUM(u2.user_total_time_points), 0) AS total_points
    FROM production.crews c
    JOIN production.usertable u 
      ON c.crew_created_by = u.user_id
    LEFT JOIN production.crew_members cm 
      ON cm.crew_id = c.crew_id
    LEFT JOIN production.usertable u2 
      ON u2.user_id = cm.crew_member_user_id
    ${WHERE}
    GROUP BY c.crew_id, u.user_name
    ORDER BY c.crew_id DESC
    LIMIT $${values.length + 1}
    OFFSET $${values.length + 2}
  `;

    const COUNT_QUERY = `
    SELECT COUNT(*) FROM production.crews c ${WHERE}
  `;

    try {
      const [dataRes, countRes] = await Promise.all([
        pool.query(DATA_QUERY, [...values, limit, offset]),
        pool.query(COUNT_QUERY, values),
      ]);

      return res.status(200).json({
        message: "Crew list fetched",
        page,
        pageSize: limit,
        total: Number(countRes.rows[0].count),
        data: dataRes.rows,
        status: 1,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  // async GetAdminCrewDetail(req: RequestAuthType, res: Response) {
  //   const crewId = req.params.crewId;

  //   const CREW_QUERY = `
  //   SELECT
  //     c.*,
  //     u.user_name AS created_by_name
  //   FROM production.crews c
  //   JOIN production.usertable u
  //     ON c.crew_created_by = u.user_id
  //   WHERE c.crew_id = $1
  // `;

  //   const MEMBERS_QUERY = `
  //   SELECT
  //     u.user_id,
  //     u.user_name,
  //     u.user_avatar,
  //     u.user_total_time_points,
  //     u.user_current_streak,
  //     u.user_longest_streak,
  //     cm.crew_member_role AS role
  //   FROM production.crew_members cm
  //   JOIN production.usertable u
  //     ON u.user_id = cm.crew_member_user_id
  //   WHERE cm.crew_id = $1
  //   ORDER BY u.user_total_time_points DESC
  // `;

  //   try {
  //     const crewRes = await pool.query(CREW_QUERY, [crewId]);

  //     if (crewRes.rows.length === 0) {
  //       return res.status(200).json({
  //         message: "Crew not found",
  //         status: 0,
  //       });
  //     }

  //     const membersRes = await pool.query(MEMBERS_QUERY, [crewId]);

  //     const members = membersRes.rows.map((m: any, i: number) => ({
  //       rank: i + 1,
  //       ...m,
  //     }));

  //     return res.status(200).json({
  //       message: "Crew detail fetched",
  //       data: {
  //         ...crewRes.rows[0],
  //         members,
  //       },
  //       status: 1,
  //     });
  //   } catch (error) {
  //     logger.error(error);
  //     return res.status(500).json({ message: "Internal server error" });
  //   }
  // }

  async GetAdminCrewDetail(req: RequestAuthType, res: Response) {
    const crewId = req.params.crewId;

    const CREW_QUERY = `
    SELECT 
      c.*,
      u.user_name AS created_by_name
    FROM production.crews c
    JOIN production.usertable u 
      ON c.crew_created_by = u.user_id
    WHERE c.crew_id = $1
  `;

    // 🔥 UPDATED MEMBERS QUERY (RANK ADD)
    const MEMBERS_QUERY = `
    SELECT 
      u.user_id,
      u.user_name,
      u.user_avatar,
      u.user_total_time_points,
      u.user_current_streak,
      u.user_longest_streak,
      cm.crew_member_role AS role,

      (
        SELECT r.rank_name
        FROM production.rank_master r
        WHERE u.user_total_time_points >= r.min_time
          AND (u.user_total_time_points <= r.max_time OR r.max_time IS NULL)
        ORDER BY r.min_time DESC
        LIMIT 1
      ) AS status_level,

      (
        SELECT r.rank_image_url
        FROM production.rank_master r
        WHERE u.user_total_time_points >= r.min_time
          AND (u.user_total_time_points <= r.max_time OR r.max_time IS NULL)
        ORDER BY r.min_time DESC
        LIMIT 1
      ) AS rank_avatar

    FROM production.crew_members cm
    JOIN production.usertable u 
      ON u.user_id = cm.crew_member_user_id
    WHERE cm.crew_id = $1
    ORDER BY u.user_total_time_points DESC
  `;

    try {
      const crewRes = await pool.query(CREW_QUERY, [crewId]);

      if (crewRes.rows.length === 0) {
        return res.status(200).json({
          message: "Group not found",
          status: 0,
        });
      }

      const membersRes = await pool.query(MEMBERS_QUERY, [crewId]);

      // 🔥 FINAL MAPPING (NO KEY CHANGE)
      const members = membersRes.rows.map((m: any, i: number) => ({
        rank: i + 1,

        ...m,
        user_avatar: m.rank_avatar || m.user_avatar,
        status_level: m.status_level || "New Recruit",
      }));

      return res.status(200).json({
        message: "Group detail fetched",
        data: {
          ...crewRes.rows[0],
          members,
        },
        status: 1,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  async UpdateCrew(req: RequestAuthType, res: Response) {
    const crewId = req.params.crewId;
    const { ...rest } = req.body;
    const FIND_CREW = `SELECT * FROM production.crews WHERE crew_id = $1`;
    const payload = {
      ...rest,
      crew_updated_at: Time(),
    };

    try {
      const crewRes = await pool.query(FIND_CREW, [crewId]);

      if (crewRes.rows.length === 0) {
        return res.status(200).json({
          message: "Group not found",
          status: 0,
        });
      }

      const { updateQuery, updateParams } = updateDataSelectedFields(
        payload,
        crewId,
        "crew_id",
        "production.crews",
      );

      const result = await pool.query(updateQuery, updateParams);

      return res.status(200).json({
        message: "Group updated",
        data: result.rows[0],
        status: 1,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  async DeleteCrew(req: RequestAuthType, res: Response) {
    const crewId = req.params.crewId;

    const FIND_CREW = `
    SELECT * FROM production.crews WHERE crew_id = $1
  `;

    const DELETE_MEMBERS = `
    DELETE FROM production.crew_members WHERE crew_id = $1
  `;

    const DELETE_CREW = `
    DELETE FROM production.crews WHERE crew_id = $1
  `;

    try {
      const crewRes = await pool.query(FIND_CREW, [crewId]);

      if (crewRes.rows.length === 0) {
        return res.status(200).json({
          message: "Group not found",
          status: 0,
        });
      }

      // 🔥 delete members
      await pool.query(DELETE_MEMBERS, [crewId]);

      // 🔥 delete crew
      await pool.query(DELETE_CREW, [crewId]);

      return res.status(200).json({
        message: "Group deleted successfully",
        status: 1,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  //...............App Files......................
  async UploadFile(req: RequestAuthType, res: Response) {
    const userId = req["auth"]?.userId;
    const { type } = req.body;

    try {
      const uploadedFile = await uploadFile(req);

      if (!uploadedFile) {
        return res.status(400).json({
          status: 0,
          message: "Something went wrong while uploading the image",
          error: "Something went wrong while uploading the image",
        });
      }

      if (type === "rank-logo") {
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

  // ================ Prefix ====================
  async GetPrefixList(req: RequestAuthType, res: Response) {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.pageSize as string) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search as string;

    let BASE_QUERY = `FROM production.prefix_master WHERE 1=1`;
    const values: any[] = [];

    if (search) {
      values.push(`%${search.toLowerCase()}%`);
      BASE_QUERY += ` AND LOWER(prefix_name) LIKE $${values.length}`;
    }

    const DATA_QUERY = `
    SELECT *
    ${BASE_QUERY}
    ORDER BY prefix_id DESC
    LIMIT $${values.length + 1}
    OFFSET $${values.length + 2}
  `;

    const COUNT_QUERY = `
    SELECT COUNT(*) ${BASE_QUERY}
  `;

    try {
      const [dataRes, countRes] = await Promise.all([
        pool.query(DATA_QUERY, [...values, limit, offset]),
        pool.query(COUNT_QUERY, values),
      ]);

      if (dataRes.rows.length === 0) {
        return res.status(200).json({
          message: "No prefixes found",
          page,
          limit,
          total: 0,
          count: 0,
          data: [],
          status: 0,
        });
      }
      return res.status(200).json({
        message: "Prefix list fetched successfully",
        page,
        limit,
        total: Number(countRes.rows[0].count),
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

  async GetPrefixDetail(req: RequestAuthType, res: Response) {
    const { prefixId } = req.params;

    const QUERY = `
    SELECT * FROM production.prefix_master
    WHERE prefix_id = $1
  `;

    try {
      const result = await pool.query(QUERY, [prefixId]);

      if (result.rows.length === 0) {
        return res.status(200).json({
          message: "Prefix not found",
          status: 0,
        });
      }

      return res.status(200).json({
        message: "Prefix detail fetched successfully",
        data: isValEmpty(result.rows[0]),
        status: 1,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }

  async CreatePrefix(req: RequestAuthType, res: Response) {
    const { prefix_status, ...rest } = req.body;
    const currentTime = Math.floor(Date.now() / 1000);
    const UPDATE_PREFIX_STATUS_QUERY = `UPDATE production.prefix_master SET prefix_status = 0 WHERE prefix_status = 1`;

    const payload = {
      ...rest,
      prefix_status,
      prefix_created_at: currentTime,
      prefix_updated_at: currentTime,
    };

    const { insertQuery, insertParams } = insertDataQuery(
      "production.prefix_master",
      payload,
    );

    try {
      if (prefix_status == 1) {
        await pool.query(UPDATE_PREFIX_STATUS_QUERY);
      }
      const result = await pool.query(insertQuery, insertParams);

      return res.status(200).json({
        message: "Prefix created successfully",
        status: 1,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }

  async UpdatePrefix(req: RequestAuthType, res: Response) {
    const { prefixId } = req.params;
    const { prefix_status, ...rest } = req.body;

    const FIND_QUERY = `SELECT * FROM production.prefix_master WHERE prefix_id = $1`;
    const UPDATE_PREFIX_STATUS_QUERY = `UPDATE production.prefix_master SET prefix_status = 0 WHERE prefix_status = 1`;
    try {
      const existing = await pool.query(FIND_QUERY, [prefixId]);

      if (existing.rows.length === 0) {
        return res.status(200).json({
          message: "Prefix not found",
          status: 0,
        });
      }

      const payload: any = {
        ...rest,
        prefix_status,
        prefix_updated_at: Math.floor(Date.now() / 1000),
      };

      const { updateQuery, updateParams } = updateDataSelectedFields(
        payload,
        prefixId,
        "prefix_id",
        "production.prefix_master",
      );

      if (prefix_status == 1) {
        await pool.query(UPDATE_PREFIX_STATUS_QUERY);
      }

      const result = await pool.query(updateQuery, updateParams);

      return res.status(200).json({
        message: "Prefix updated successfully",
        status: 1,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }

  async DeletePrefix(req: RequestAuthType, res: Response) {
    const { prefixId } = req.params;

    const FIND_QUERY = `
    SELECT * FROM production.prefix_master
    WHERE prefix_id = $1
  `;

    const DELETE_QUERY = `
    DELETE FROM production.prefix_master
    WHERE prefix_id = $1
  `;

    try {
      const existing = await pool.query(FIND_QUERY, [prefixId]);

      if (existing.rows.length === 0) {
        return res.status(200).json({
          message: "Prefix not found",
          status: 0,
        });
      }

      await pool.query(DELETE_QUERY, [prefixId]);

      return res.status(200).json({
        message: "Prefix deleted successfully",
        status: 1,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }

  // ================== Stats Level ==================
  async GetRankList(req: RequestAuthType, res: Response) {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.pageSize as string) || 10;
    const offset = (page - 1) * limit;
    const search = req.query.search as string;

    let BASE_QUERY = `FROM production.rank_master WHERE 1=1`;
    const values: any[] = [];

    if (search) {
      values.push(`%${search.toLowerCase()}%`);
      BASE_QUERY += ` AND LOWER(rank_name) LIKE $${values.length}`;
    }

    const DATA_QUERY = `SELECT * ${BASE_QUERY} ORDER BY rank_id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
    const COUNT_QUERY = `SELECT COUNT(*) ${BASE_QUERY}`;

    try {
      const [dataRes, countRes] = await Promise.all([
        pool.query(DATA_QUERY, [...values, limit, offset]),
        pool.query(COUNT_QUERY, values),
      ]);

      if (dataRes.rows.length === 0) {
        return res.status(200).json({
          status: 0,
          data: [],
          message: "No ranks found",
          page,
          limit,
          total: 0,
          count: 0,
        });
      }

      return res.status(200).json({
        status: 1,
        message: "Rank list fetched successfully",
        data: isValEmptyArray(dataRes.rows),
        page,
        limit,
        total: Number(countRes.rows[0].count),
        count: dataRes.rows.length,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }

  async CreateRank(req: RequestAuthType, res: Response) {
    const { ...rest } = req.body;
    const currentTime = Math.floor(Date.now() / 1000);

    const payload = {
      ...rest,
      rank_created_at: currentTime,
      rank_updated_at: currentTime,
    };

    try {
      const { insertQuery, insertParams } = insertDataQuery(
        "production.rank_master",
        payload,
      );

      await pool.query(insertQuery, insertParams);

      return res.status(200).json({
        message: "Rank created successfully",
        status: 1,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }

  async UpdateRank(req: RequestAuthType, res: Response) {
    const { rank_id } = req.params;
    const { ...rest } = req.body;

    const FIND_QUERY = `SELECT * FROM production.rank_master WHERE rank_id = $1`;

    try {
      const existing = await pool.query(FIND_QUERY, [rank_id]);

      if (existing.rows.length === 0) {
        return res.status(200).json({
          message: "Rank not found",
          status: 0,
        });
      }

      const payload = {
        ...rest,
        rank_updated_at: Math.floor(Date.now() / 1000),
      };

      const { updateQuery, updateParams } = updateDataSelectedFields(
        payload,
        rank_id,
        "rank_id",
        "production.rank_master",
      );

      const result = await pool.query(updateQuery, updateParams);

      return res.status(200).json({
        message: "Rank updated successfully",
        status: 1,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }

  async DeleteRank(req: RequestAuthType, res: Response) {
    const { rank_id } = req.params;

    const FIND_QUERY = `SELECT * FROM production.rank_master WHERE rank_id = $1`;
    const DELETE_QUERY = `DELETE FROM production.rank_master WHERE rank_id = $1`;

    try {
      const existing = await pool.query(FIND_QUERY, [rank_id]);

      if (existing.rows.length === 0) {
        return res.status(200).json({
          message: "Rank not found",
          status: 0,
        });
      }

      await pool.query(DELETE_QUERY, [rank_id]);

      return res.status(200).json({
        message: "Rank deleted successfully",
        status: 1,
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }

  async GetRankDetail(req: RequestAuthType, res: Response) {
    const { rank_id } = req.params;

    const QUERY = `
    SELECT * 
    FROM production.rank_master
    WHERE rank_id = $1
  `;

    try {
      const result = await pool.query(QUERY, [rank_id]);

      if (result.rows.length === 0) {
        return res.status(200).json({
          status: 0,
          message: "Rank not found",
          data: null,
        });
      }

      return res.status(200).json({
        status: 1,
        message: "Rank detail fetched successfully",
        data: result.rows[0],
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }

  async GetAdminDashboard(req: RequestAuthType, res: Response) {
    try {
      const TOTAL_USERS_QUERY = `
      SELECT COUNT(*) 
      FROM production.usertable 
      WHERE COALESCE(LOWER(user_role), '') != 'admin'
    `;

      const TOTAL_CREWS_QUERY = `
      SELECT COUNT(*) FROM production.crews
    `;

      const USERS_CHART_QUERY = `
      SELECT 
        TO_CHAR(TO_TIMESTAMP(user_created_at), 'YYYY-MM') AS month,
        COUNT(*) AS total
      FROM production.usertable
      WHERE COALESCE(LOWER(user_role), '') != 'admin'
      GROUP BY month
      ORDER BY month ASC
    `;

      const CREW_CHART_QUERY = `
      SELECT 
        TO_CHAR(TO_TIMESTAMP(crew_created_at), 'YYYY-MM') AS month,
        COUNT(*) AS total
      FROM production.crews
      GROUP BY month
      ORDER BY month ASC
    `;

      //   // 🔥 UPDATED: RANK JOIN
      //   const LATEST_USERS_QUERY = `
      //   SELECT
      //     u.user_id,
      //     u.user_name,
      //     u.user_email,
      //     u.user_avatar,
      //     u.user_total_time_points,
      //     u.user_created_at,

      //     r.rank_name AS status_level,
      //     r.rank_image_url AS rank_avatar

      //   FROM production.usertable u

      //   LEFT JOIN production.rank_master r
      //     ON u.user_total_time_points >= r.min_time
      //     AND (u.user_total_time_points <= r.max_time OR r.max_time IS NULL)

      //   WHERE COALESCE(LOWER(u.user_role), '') != 'admin'

      //   ORDER BY r.min_time DESC, u.user_created_at DESC
      //   LIMIT 5
      // `;
      const LATEST_USERS_QUERY = `
  SELECT 
    u.user_id,
    u.user_name,
    u.user_email,
    u.user_avatar,
    u.user_total_time_points,
    u.user_created_at,

    (
      SELECT r.rank_name
      FROM production.rank_master r
      WHERE u.user_total_time_points >= r.min_time
        AND (u.user_total_time_points <= r.max_time OR r.max_time IS NULL)
      ORDER BY r.min_time DESC
      LIMIT 1
    ) AS status_level,

    (
      SELECT r.rank_image_url
      FROM production.rank_master r
      WHERE u.user_total_time_points >= r.min_time
        AND (u.user_total_time_points <= r.max_time OR r.max_time IS NULL)
      ORDER BY r.min_time DESC
      LIMIT 1
    ) AS rank_avatar

  FROM production.usertable u

  WHERE COALESCE(LOWER(u.user_role), '') != 'admin'

  ORDER BY u.user_created_at DESC
  LIMIT 5
`;

      const [
        totalUsersRes,
        totalCrewsRes,
        usersChartRes,
        crewChartRes,
        latestUsersRes,
      ] = await Promise.all([
        pool.query(TOTAL_USERS_QUERY),
        pool.query(TOTAL_CREWS_QUERY),
        pool.query(USERS_CHART_QUERY),
        pool.query(CREW_CHART_QUERY),
        pool.query(LATEST_USERS_QUERY),
      ]);

      // 🔥 CLEAN DATA
      const latestUsers = latestUsersRes.rows.map((u: any) => ({
        user_id: u.user_id,
        user_name: u.user_name,
        user_email: u.user_email,
        user_avatar: u.rank_avatar || u.user_avatar || "",
        status_level: u.status_level || "New Recruit",
        user_created_at: u.user_created_at,
      }));

      return res.status(200).json({
        status: 1,
        message: "Dashboard data fetched successfully",
        data: {
          total_users: Number(totalUsersRes.rows[0].count),
          total_crews: Number(totalCrewsRes.rows[0].count),

          user_chart: usersChartRes.rows.map((item: any) => ({
            month: item.month,
            total: Number(item.total),
          })),

          crew_chart: crewChartRes.rows.map((item: any) => ({
            month: item.month,
            total: Number(item.total),
          })),

          latest_users: latestUsers,
        },
      });
    } catch (error) {
      logger.error(error);
      return res.status(500).json({
        message: "Internal server error",
      });
    }
  }
}
