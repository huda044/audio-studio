import axios from 'axios';
import FormData from 'form-data';
import fs from 'node:fs';
import path from 'node:path';

const ASSET_URL = 'https://apis.roblox.com/assets/v1/assets';
const OPERATION_URL = 'https://apis.roblox.com/assets/v1/operations';

function creationContext(creator) {
  if (creator?.groupId) return { creator: { groupId: String(creator.groupId) } };
  return { creator: { userId: String(creator?.userId || '') } };
}

async function pollOperation(operationId, apiKey) {
  const deadline = Date.now() + 1000 * 60 * 4;
  while (Date.now() < deadline) {
    const { data } = await axios.get(`${OPERATION_URL}/${operationId}`, {
      headers: { 'x-api-key': apiKey }
    });

    if (data.done) {
      const assetId = data.response?.assetId || data.response?.asset?.assetId || data.metadata?.assetId;
      if (assetId) return { status: 'Accepted', assetId, raw: data };
      if (data.error) return { status: 'Failed', error: data.error.message || 'Upload gagal.' };
      return { status: 'Accepted', raw: data };
    }

    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  return { status: 'Pending', error: 'Operasi Roblox masih diproses.' };
}

export async function uploadAudioParts({ parts, apiKey, creator, displayName, description }) {
  const results = [];

  for (const part of parts) {
    const request = {
      assetType: 'Audio',
      displayName: parts.length > 1 ? `${displayName} - Part ${part.index}` : displayName,
      description,
      creationContext: creationContext(creator)
    };

    const form = new FormData();
    form.append('request', JSON.stringify(request));
    form.append('file', fs.createReadStream(part.path), {
      filename: path.basename(part.path),
      contentType: 'audio/ogg'
    });

    try {
      const { data } = await axios.post(ASSET_URL, form, {
        headers: { ...form.getHeaders(), 'x-api-key': apiKey },
        maxBodyLength: Infinity
      });
      const operationId = data.operationId || data.path?.split('/').pop();
      const polled = operationId
        ? await pollOperation(operationId, apiKey)
        : { status: 'Pending', error: 'Operation ID tidak ditemukan.' };

      results.push({
        part: part.index,
        status: polled.status,
        assetId: polled.assetId || null,
        rbxassetid: polled.assetId ? `rbxassetid://${polled.assetId}` : '',
        operationId,
        error: polled.error || null
      });
    } catch (error) {
      results.push({
        part: part.index,
        status: 'Failed',
        assetId: null,
        rbxassetid: '',
        error: error.response?.data?.message || error.message
      });
    }
  }

  return results;
}
