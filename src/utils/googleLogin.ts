import { google } from "googleapis";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const REDIRECT_URI = "http://localhost:4007/auth/google/callback";

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI,
);

// 🔥 LOGIN URL GENERATE
export const getGoogleAuthUrl = (req: any, res: any) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline", // refresh token ke liye
    scope: [
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    prompt: "consent", // force account select
  });

  res.json({ url });
};

export const googleCallback = async (req: any, res: any) => {
  const code = req.query.code;

  const { tokens } = await oauth2Client.getToken(code);

  // 🔥 YAHI PRINT KAR
  console.log("ID TOKEN:", tokens.id_token);

  res.json({
    id_token: tokens.id_token, // 👈 ye dekh
  });
};
