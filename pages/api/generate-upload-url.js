import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  try {
    const { fileName, fileType } = req.body;
    
    const uniqueFileName = `${Date.now()}-${fileName.replace(/\s+/g, '_')}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: uniqueFileName,
      ContentType: fileType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 300, // URL berlaku 5 menit
    });

    res.status(200).json({ 
      uploadUrl: uploadUrl,
      downloadUrl: `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/${uniqueFileName}`
    });

  } catch (error) {
    console.error("Error generating signed URL:", error);
    res.status(500).json({ message: "Gagal membuat URL upload" });
  }
}