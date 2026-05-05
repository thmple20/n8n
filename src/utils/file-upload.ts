// @ts-nocheck
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { RequestAuthType } from "./CoreService";
import { generateId } from "./Higherorderfunction";

const s3 = new S3Client({
  endpoint: process.env.ENDPOINT,
  region: process.env.REGION,
  credentials: {
    accessKeyId: process.env.ACCESSKEYID,
    secretAccessKey: process.env.SECRETACCESSKEY,
  },
});

function trimString(str: string) {
  return str.trim().replace(/\s+/g, "");
}

export const uploadFile = async (req: RequestAuthType) => {
  const fileName = req["file"]?.originalname;

  const uniqueId = generateId(16);

  if (!fileName) {
    return false;
  }
  try {
    const trimmedString = trimString(fileName);

    const fileKey = `${uniqueId}-${trimmedString}`;

    const params = {
      Bucket: "techhira-space-bucket",
      Key: fileKey,
      Body: req["file"]?.buffer,
      ContentType: req.file.mimetype,
      ACL: "public-read",
    };

    await s3.send(new PutObjectCommand(params));

    return {
      url: `https://techhira-space-bucket.nyc3.cdn.digitaloceanspaces.com/${fileKey}`,
      key: fileKey,
    };
  } catch (err) {
    console.error("Error uploading file:", err);
    return false;
  }
};
