import jwt from "jsonwebtoken";
import { getTokenFrom } from "../middlewares/UserAuthentication";
import logger from "../middlewares/Logger";
import { Request, Response } from "express";
import { StoreRefreshToken, ValidateRefreshToken } from "../services/Helper";
import { pool } from "./Connection";

export interface RequestAuthType extends Request {
  auth?: { userId?: string };
}

const refreshTokenTime = 86400 * 365;
const accesTokenTime = 86400 * 7;
export const generateAccessAndRefereshTokens = async (
  userId: number,
  deviceId: string,
) => {
  const token = { user_access_token: "", refresh_token: "", error: true };

  try {
    const tokenSign = {
      userId: userId,
    };

    const user_access_token = jwt.sign(
      { ...tokenSign, type: "access_token" },
      process.env.SECRET!,
      {
        expiresIn: accesTokenTime,
      },
    );

    const refresh_token = jwt.sign(
      { ...tokenSign, type: "refresh_token" },
      process.env.REFRESHTOKENSECRET!,
      {
        expiresIn: refreshTokenTime,
      },
    );

    // await con.query<ResultSetHeader>(updateQuery, [refresh_token]);

    const expireTime = Math.floor(Date.now() / 1000) + refreshTokenTime;

    await StoreRefreshToken(userId, refresh_token, deviceId, expireTime);

    token.user_access_token = user_access_token;

    token.refresh_token = refresh_token;

    token.error = false;

    return token;
  } catch (error) {
    console.log("error", error);
    logger.error(`${error}`);
    return token;
  }
};

export const generateAccessTokens = async (userId: number) => {
  const token = { user_access_token: "", error: true };

  try {
    const tokenSign = {
      userId: userId,
    };

    const user_access_token = jwt.sign(
      { ...tokenSign, type: "access_token" },
      process.env.SECRET!,
      {
        expiresIn: accesTokenTime,
      },
    );

    token.user_access_token = user_access_token;

    token.error = false;

    return token;
  } catch (error) {
    console.log("error", error);
    logger.error(`${error}`);
    return token;
  }
};

export const RevokeRefreshToken = async (refreshToken: string) => {
  const QUERY = `
    UPDATE production.refresh_tokens
    SET is_revoked = 1
    WHERE refresh_token = $1
  `;
  await pool.query(QUERY, [refreshToken]);
};

export const RefreshAccessToken = async (
  req: RequestAuthType,
  res: Response,
) => {
  const token = getTokenFrom(req);
  const { deviceId } = req.query;

  if (!token) {
    return res.status(401).json({ error: "unauthorised user" });
  }

  if (!deviceId) {
    return res.status(401).json({ error: "device id required" });
  }

  try {
    // ✅ verify refresh token
    const decodedToken = jwt.verify(
      token,
      process.env.REFRESHTOKENSECRET!,
    ) as any;

    // ✅ DB validation
    const isToken = await ValidateRefreshToken(
      decodedToken.userId,
      token,
      deviceId,
    );

    if (!isToken) {
      return res.status(401).json({ error: "invalid refresh token" });
    }

    // 🔥 STEP 1: OLD TOKEN REVOKE
    await RevokeRefreshToken(token);

    // 🔥 STEP 2: GENERATE NEW ACCESS + REFRESH TOKEN
    const { error, user_access_token, refresh_token } =
      await generateAccessAndRefereshTokens(
        decodedToken.userId,
        deviceId as string,
      );

    if (error) {
      return res.status(500).json({
        status: 0,
        message: "Token generation failed",
      });
    }

    // 🔥 STEP 3: RETURN BOTH TOKENS
    return res.status(200).json({
      status: 1,
      data: {
        access_token: user_access_token,
        refresh_token: refresh_token,
      },
      message: "Token refreshed successfully",
    });
  } catch (error) {
    logger.error(`${error}`);
    return res.status(401).json({ error: "invalid or expired token" });
  }
};
