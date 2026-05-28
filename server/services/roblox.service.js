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
  const trace = [{
    step: 'Polling',
    status: 'Pending',
    message: `Memantau operasi Roblox ${operationId}.`
  }];
  const deadline = Date.now() + 1000 * 60 * 4;
  while (Date.now() < deadline) {
    const { data } = await axios.get(`${OPERATION_URL}/${operationId}`, {
      headers: { 'x-api-key': apiKey }
    });

    if (data.done) {
      const assetId = data.response?.assetId || data.response?.asset?.assetId || data.metadata?.assetId;
      if (assetId) {
        trace.push({
          step: 'Moderasi Roblox',
          status: 'Accepted',
          message: `Asset diterima Roblox dengan ID ${assetId}.`
        });
        return { status: 'Accepted', assetId, raw: data, trace };
      }
      if (data.error) {
        trace.push({
          step: 'Moderasi Roblox',
          status: 'Failed',
          message: data.error.message || 'Upload ditolak atau gagal diproses Roblox.'
        });
        return { status: 'Failed', error: data.error.message || 'Upload gagal.', raw: data, trace };
      }
      trace.push({
        step: 'Moderasi Roblox',
        status: 'Accepted',
        message: 'Operasi selesai, tetapi assetId belum tersedia di response.'
      });
      return { status: 'Accepted', raw: data, trace };
    }

    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  trace.push({
    step: 'Polling',
    status: 'Pending',
    message: 'Operasi Roblox masih diproses setelah batas waktu tunggu aplikasi.'
  });
  return { status: 'Pending', error: 'Operasi Roblox masih diproses.', trace };
}

export async function checkAssetStatus(operationId, apiKey) {
  try {
    const { data } = await axios.get(`${OPERATION_URL}/${operationId}`, {
      headers: { 'x-api-key': apiKey },
      timeout: 10000
    });
    if (data.done) {
      const assetId = data.response?.assetId || data.response?.asset?.assetId || data.metadata?.assetId;
      if (assetId) return { status: 'Accepted', assetId, rbxassetid: `rbxassetid://${assetId}` };
      if (data.error) return { status: 'Failed', error: data.error.message || 'Roblox menolak asset.' };
      return { status: 'Accepted' };
    }
    return { status: 'Pending' };
  } catch (error) {
    return { status: 'Pending', error: error.response?.data?.message || error.message };
  }
}

export async function uploadAudioParts({ parts, apiKey, creator, displayName, description }) {
  const results = [];

  for (const part of parts) {
    const trace = [{
      step: 'Persiapan',
      status: 'Pending',
      message: `Part ${part.index} siap dikirim (${Math.round(part.sizeBytes / 1024)} KB).`
    }];
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
      trace.push({
        step: 'Submit Open Cloud',
        status: 'Pending',
        message: 'Mengirim audio ke Roblox Assets API.'
      });
      const { data } = await axios.post(ASSET_URL, form, {
        headers: { ...form.getHeaders(), 'x-api-key': apiKey },
        maxBodyLength: Infinity
      });
      const operationId = data.operationId || data.path?.split('/').pop();
      trace.push({
        step: 'Submit Open Cloud',
        status: operationId ? 'Accepted' : 'Pending',
        message: operationId ? `Roblox menerima request. Operation ID: ${operationId}.` : 'Roblox menerima request, tetapi operationId tidak ditemukan.'
      });
      const polled = operationId
        ? await pollOperation(operationId, apiKey)
        : { status: 'Pending', error: 'Operation ID tidak ditemukan.' };
      trace.push(...(polled.trace || []));

      results.push({
        part: part.index,
        status: polled.status,
        assetId: polled.assetId || null,
        rbxassetid: polled.assetId ? `rbxassetid://${polled.assetId}` : '',
        operationId,
        error: polled.error || null,
        trace
      });
    } catch (error) {
      const robloxError = error.response?.data;
      const message = robloxError?.message
        || robloxError?.error?.message
        || error.message;
      trace.push({
        step: 'Submit Open Cloud',
        status: 'Failed',
        message
      });
      results.push({
        part: part.index,
        status: 'Failed',
        assetId: null,
        rbxassetid: '',
        error: message,
        trace
      });
    }
  }

  return results;
}
