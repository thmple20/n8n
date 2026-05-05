// @ts-nocheck

import { pool } from "../utils/Connection";
import * as admin from "firebase-admin";
// import firebaseAdmin from "../utils/admin";
import { insertDataQuery, Time } from "../utils/Higherorderfunction";

export const SinglePushNotifcation = async (
  user_device_token: string,
  notificationMessage: string,
  type: string,
  userId: string,
  threadId: string,
) => {
  console.log(user_device_token, notificationMessage, type, userId);
  if (!user_device_token) {
    return;
  }
  try {
    const sendmessage = {
      data: {
        title: "Choplite",
        type: type,
        message: notificationMessage,
        sound: "alert",
        userId: userId,
        id: threadId,
      },
      notification: {
        body: notificationMessage,
        title: "Choplite",
      },
      apns: {
        headers: {
          "apns-priority": "10",
        },
        payload: {
          aps: {
            sound: "alert.mp3",
          },
        },
      },
      token: user_device_token,
    };

    // const sent = await firebaseAdmin.messaging().send(sendmessage);

    // if (sent) {
    //   return { notification: 1 };
    // }
    return { notification: 1 };
  } catch (error) {
    console.log(error);
    return { notification: 0 };
  }
};

export async function StoreRefreshToken(
  userId: number,
  refreshToken: string,
  device_id: string,
  expires_at: number,
) {
  const QUERY = `
    INSERT INTO production.refresh_tokens 
    (user_id, refresh_token, device_id, expires_at, created_at)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
  `;

  const currentTime = Math.floor(Date.now() / 1000);

  try {
    const result = await pool.query(QUERY, [
      userId,
      refreshToken,
      device_id,
      expires_at,
      currentTime,
    ]);

    return result.rows[0];
  } catch (error) {
    console.error("StoreRefreshToken Error:", error);
    throw error;
  }
}

export async function ValidateRefreshToken(
  userId: number,
  refreshToken: string,
  deviceId: any,
) {
  const QUERY = `
    SELECT *
    FROM production.refresh_tokens
    WHERE 
      user_id = $1
      AND refresh_token = $2
      AND device_id = $3
      AND is_revoked = 0
      AND expires_at > EXTRACT(EPOCH FROM NOW())
    LIMIT 1
  `;

  try {
    const result = await pool.query(QUERY, [userId, refreshToken, deviceId]);

    if (result.rows.length === 0) {
      return null; // ❌ invalid token
    }

    return result.rows[0]; // ✅ valid token data
  } catch (error) {
    console.error("ValidateRefreshToken Error:", error);
    return null;
  }
}

export async function SaveMessage({
  sender_id,
  receiver_id,
  content,
  m_thread_id,
}) {
  const payload = {
    message_sender_id: sender_id,
    message_receiver_id: receiver_id,
    message_content: content,
    message_thread_id: m_thread_id,
    nessage_created_at: Time(),
  };
  const { insertQuery, insertParams } = insertDataQuery(
    "production.user_messages",
    payload,
  );
  const result = await pool.query(insertQuery, insertParams);
  return result.rows[0];
}

export async function SendMessage(payload, socketUser) {
  try {
    const { message_thread_id, message, receiver_id } = payload;
    const sender_id = socketUser.user_id;

    if (!message || !message_thread_id) {
      return {
        error: true,
        errorMessage: "Invalid message payload",
      };
    }

    const result = await pool.query(
      `INSERT INTO messages
      (thread_id, sender_id, receiver_id, message)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [message_thread_id, sender_id, receiver_id, message],
    );

    return {
      data: result.rows[0],
      error: false,
    };
  } catch (err) {
    return {
      error: true,
      errorMessage: err.message,
    };
  }
}

export async function UpdateMessage(payload, socketUser) {
  try {
    const { message_id, message } = payload;
    const sender_id = socketUser.user_id;

    if (!message_id || !message) {
      return {
        error: true,
        errorMessage: "Invalid update payload",
      };
    }

    // 🔒 Ownership check
    const check = await db.query(
      `SELECT thread_id FROM messages
       WHERE message_id = $1 AND sender_id = $2`,
      [message_id, sender_id],
    );

    if (check.rowCount === 0) {
      return {
        error: true,
        errorMessage: "Unauthorized or message not found",
      };
    }

    const update = await db.query(
      `
      UPDATE messages
      SET message = $1
      WHERE message_id = $2
      RETURNING *
      `,
      [message, message_id],
    );

    return {
      data: update.rows[0],
      threadId: check.rows[0].thread_id,
      error: false,
    };
  } catch (err) {
    return {
      error: true,
      errorMessage: err.message,
    };
  }
}
