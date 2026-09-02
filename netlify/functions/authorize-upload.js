/* =========================================================
   OLIVIA - 1 ANINHO
   Função Netlify: checa o limite de fotos/vídeos de cada
   convidado e, se estiver dentro do limite, autoriza o
   envio direto para o Cloudinary (gerando uma assinatura).

   O arquivo em si NUNCA passa por aqui - só os metadados.
   Isso é o que torna o envio rápido: o celular do convidado
   manda o arquivo direto pro Cloudinary, sem intermediário
   pesado no meio.
   ========================================================= */

const cloudinary = require("cloudinary").v2;

const MAX_PHOTOS = 10;
const MAX_VIDEOS = 3;

// Precisa ser IGUAL ao nome do Upload Preset criado no
// painel do Cloudinary (Settings > Upload > Upload presets).
const UPLOAD_PRESET = "olivia_festa";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

function sanitizeGuestName(name) {
  const safe = String(name || "Convidado")
    .trim()
    .replace(/[\/\\:*?"<>|]/g, "")
    .substring(0, 60);

  return safe || "Convidado";
}

async function countAssets(folder, resourceType) {
  try {
    const result = await cloudinary.api.resources({
      resource_type: resourceType,
      type: "upload",
      prefix: folder + "/",
      max_results: 500
    });

    return result.resources.length;

  } catch (err) {
    // Pasta ainda não existe = zero arquivos enviados até agora.
    if (err && (err.http_code === 404 || err.http_code === 420)) {
      return 0;
    }

    if (err && err.error && /not found/i.test(err.error.message || "")) {
      return 0;
    }

    throw err;
  }
}

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ status: "error", message: "Método não permitido." })
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const guestName = sanitizeGuestName(body.guestName);
    const mode = body.mode || "authorize";
    const resourceType = body.resourceType === "video" ? "video" : "image";

    const folder = "convidados/" + guestName;

    const [photosUsed, videosUsed] = await Promise.all([
      countAssets(folder, "image"),
      countAssets(folder, "video")
    ]);

    if (mode === "counts") {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: "success",
          photosUsed: photosUsed,
          videosUsed: videosUsed
        })
      };
    }

    if (resourceType === "image" && photosUsed >= MAX_PHOTOS) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: "error",
          message: "Limite de " + MAX_PHOTOS + " fotos atingido para este convidado."
        })
      };
    }

    if (resourceType === "video" && videosUsed >= MAX_VIDEOS) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: "error",
          message: "Limite de " + MAX_VIDEOS + " vídeos atingido para este convidado."
        })
      };
    }

    const timestamp = Math.round(Date.now() / 1000);

    const paramsToSign = {
      timestamp: timestamp,
      folder: folder,
      upload_preset: UPLOAD_PRESET
    };

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: "authorized",
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY,
        timestamp: timestamp,
        signature: signature,
        folder: folder,
        uploadPreset: UPLOAD_PRESET,
        photosUsed: photosUsed,
        videosUsed: videosUsed
      })
    };

  } catch (error) {
    console.error(error);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: "error",
        message: "Erro no servidor: " + (error && error.message ? error.message : String(error))
      })
    };
  }
};
