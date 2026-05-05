import nodemailer from "nodemailer";

// 🔥 transporter (single instance best practice)
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// 🔥 OTP EMAIL TEMPLATE (Hit Mission Theme)
const generateOtpTemplate = (name: string, otp: string) => {
  return `
  <div style="font-family: Arial, sans-serif; background:#f4f6f8; padding:20px;">
    <div style="max-width:500px; margin:auto; background:white; border-radius:10px; padding:20px; text-align:center;">

      <h1 style="color:#4F46E5; margin-bottom:10px;">Hit Mission 🚀</h1>
      <p style="color:#555;">Reduce screen time. Build better habits.</p>

      <hr style="margin:20px 0;" />

      <h2 style="color:#111;">Hello ${name || "User"} 👋</h2>

      <p style="color:#555;">
        Use the OTP below to verify your account
      </p>

      <div style="
        font-size:28px;
        font-weight:bold;
        letter-spacing:5px;
        background:#EEF2FF;
        color:#4F46E5;
        padding:15px;
        border-radius:8px;
        margin:20px 0;
      ">
        ${otp}
      </div>

      <p style="color:#777; font-size:14px;">
        This OTP is valid for 5 minutes. Do not share it with anyone.
      </p>

      <hr style="margin:20px 0;" />

      <p style="font-size:12px; color:#999;">
        © ${new Date().getFullYear()} Hit Mission. All rights reserved.
      </p>

    </div>
  </div>
  `;
};

// 🔥 SEND OTP EMAIL
export const sendOtpEmail = async (
  name: string,
  email: string,
  otp: string,
) => {
  try {
    const info = await transporter.sendMail({
      from: `"Hit Mission" <${process.env.EMAIL}>`,
      to: email,
      subject: "🔐 Verify Your Account - Hit Mission",
      html: generateOtpTemplate(name, otp),
    });

    return info;
  } catch (error) {
    console.error("Email send error:", error);
    throw error;
  }
};
