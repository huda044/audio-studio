import axios from 'axios';
import FormData from 'form-data';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { clientAbortError } from './taskQueue.service.js';

// Keep-alive agents: upload multi-part ke Roblox memakai satu koneksi TLS
// berulang — menghemat handshake (~1 RTT) per part dibuat-buat ulang.
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 4 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 4 });
const AXIOS_AGENTS = { httpAgent, httpsAgent };

const ASSET_URL = 'https://apis.roblox.com/assets/v1/assets';
const OPERATION_URL = 'https://apis.roblox.com/assets/v1/operations';
const DEFAULT_MAX_AUDIO_SECONDS = 420;
const DEFAULT_MAX_AUDIO_BYTES = 19 * 1024 * 1024;
const ROBLOX_MAX_AUDIO_SECONDS = Number(process.env.ROBLOX_AUDIO_MAX_DURATION_SECONDS || DEFAULT_MAX_AUDIO_SECONDS);
const ROBLOX_MAX_AUDIO_BYTES = Number(process.env.ROBLOX_AUDIO_MAX_BYTES || DEFAULT_MAX_AUDIO_BYTES);
const ROBLOX_UPLOAD_TIMEOUT_MS = Number(process.env.ROBLOX_UPLOAD_TIMEOUT_MS || 60000);
const ROBLOX_POLL_TIMEOUT_MS = Number(process.env.ROBLOX_POLL_TIMEOUT_MS || 240000);
const ROBLOX_POLL_INTERVAL_MS = Number(process.env.ROBLOX_POLL_INTERVAL_MS || 2500);

function creationContext(creator) {
  if (creator?.groupId) return { creator: { groupId: String(creator.groupId) } };
  return { creator: { userId: String(creator?.userId || '') } };
}

function truncate(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatRobloxError(errorOrData, fallback = 'Roblox menolak request.') {
  const response = errorOrData?.response;
  const data = response?.data || errorOrData || {};
  const raw = data.errors?.[0]?.message
    || data.message
    || data.error?.message
    || data.error
    || errorOrData?.message
    || fallback;
  const message = String(raw).slice(0, 500);
  const status = response?.status || data.status || errorOrData?.status || 0;

  if (status === 401 || status === 403) {
    return {
      message: 'API key ditolak Roblox atau belum punya permission asset:read/asset:write untuk creator ini.',
      status
    };
  }
  if (status === 413) return { message: 'File audio terlalu besar untuk Assets API Roblox.', status };
  if (status === 429) return { message: 'Roblox membatasi request upload. Coba lagi setelah beberapa saat.', status };
  if (status >= 500) return { message: 'Roblox API sedang bermasalah. Coba ulang nanti.', status };
  return { message, status };
}

function extractOperationId(data = {}) {
  return data.operationId || data.path?.split('/').pop() || '';
}

function cleanOperationId(operationId) {
  return String(operationId || '').trim().split('/').filter(Boolean).pop() || '';
}

async function requestWithRetry(fn, { retries = 2, retryDelayMs = 1200, signal } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fn();
      if (response.status !== 429 && response.status < 500) return response;
      lastError = { response };
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw clientAbortError();
      const status = error.response?.status || 0;
      if (status && status !== 429 && status < 500) throw error;
    }
    if (attempt < retries) {
      if (signal?.aborted) throw clientAbortError();
      await sleep(retryDelayMs * (attempt + 1));
    }
  }
  if (lastError?.response) return lastError.response;
  throw lastError;
}

async function pollOperation(operationId, apiKey, signal) {
  const cleanId = cleanOperationId(operationId);
  const trace = [{
    step: 'Polling',
    status: 'Pending',
    message: `Memantau operasi Roblox ${cleanId}.`
  }];
  const deadline = Date.now() + ROBLOX_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw clientAbortError();
    const response = await requestWithRetry(() => axios.get(`${OPERATION_URL}/${encodeURIComponent(cleanId)}`, {
      headers: { 'x-api-key': apiKey },
      timeout: 10000,
      validateStatus: () => true,
      signal,
      ...AXIOS_AGENTS
    }), {
      retries: 2,
      retryDelayMs: 1200,
      signal
    });
    const { data } = response;

    if (response.status >= 400) {
      const formatted = formatRobloxError({ status: response.status, ...data });
      trace.push({
        step: 'Polling',
        status: response.status >= 500 || response.status === 429 ? 'Pending' : 'Failed',
        message: formatted.message
      });
      if (response.status < 500 && response.status !== 429) {
        return { status: 'Failed', error: formatted.message, raw: data, trace, httpStatus: response.status };
      }
    }

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

    await sleep(ROBLOX_POLL_INTERVAL_MS);
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
    const cleanId = cleanOperationId(operationId);
    if (!cleanId) return { status: 'Failed', error: 'operationId tidak valid.' };
    const response = await axios.get(`${OPERATION_URL}/${encodeURIComponent(cleanId)}`, {
      headers: { 'x-api-key': apiKey },
      timeout: 10000,
      validateStatus: () => true
    });
    const { data } = response;
    if (response.status >= 400) {
      const formatted = formatRobloxError({ status: response.status, ...data });
      return {
        status: response.status === 429 || response.status >= 500 ? 'Pending' : 'Failed',
        error: formatted.message,
        httpStatus: response.status
      };
    }
    if (data.done) {
      const assetId = data.response?.assetId || data.response?.asset?.assetId || data.metadata?.assetId;
      if (assetId) return { status: 'Accepted', assetId, rbxassetid: `rbxassetid://${assetId}` };
      if (data.error) return { status: 'Failed', error: data.error.message || 'Roblox menolak asset.' };
      return { status: 'Accepted' };
    }
    return { status: 'Pending' };
  } catch (error) {
    const formatted = formatRobloxError(error);
    return { status: 'Pending', error: formatted.message, httpStatus: formatted.status };
  }
}

export async function uploadAudioParts({ parts, apiKey, creator, displayName, description, signal }) {
  const results = [];

  for (const part of parts) {
    if (signal?.aborted) throw clientAbortError();
    const trace = [{
      step: 'Persiapan',
      status: 'Pending',
      message: `Part ${part.index} siap dikirim (${Math.round(part.sizeBytes / 1024)} KB).`
    }];
    if (part.sizeBytes > ROBLOX_MAX_AUDIO_BYTES || part.duration > ROBLOX_MAX_AUDIO_SECONDS) {
      const message = part.sizeBytes > ROBLOX_MAX_AUDIO_BYTES
        ? `Part ${part.index} melebihi limit ukuran Roblox (${Math.round(ROBLOX_MAX_AUDIO_BYTES / 1024 / 1024)} MB).`
        : `Part ${part.index} melebihi limit durasi Roblox (${Math.round(ROBLOX_MAX_AUDIO_SECONDS)} detik).`;
      trace.push({ step: 'Validasi Roblox', status: 'Failed', message });
      results.push({
        part: part.index,
        status: 'Failed',
        assetId: null,
        rbxassetid: '',
        operationId: '',
        error: message,
        trace
      });
      continue;
    }

    const request = {
      assetType: 'Audio',
      displayName: truncate(parts.length > 1 ? `${displayName} - Part ${part.index}` : displayName, 50) || `Audio Part ${part.index}`,
      description: truncate(description, 1000),
      creationContext: creationContext(creator)
    };

    try {
      trace.push({
        step: 'Submit Open Cloud',
        status: 'Pending',
        message: 'Mengirim audio ke Roblox Assets API.'
      });
      const response = await requestWithRetry(() => {
        const form = new FormData();
        form.append('request', JSON.stringify(request));
        form.append('fileContent', fs.createReadStream(part.path), {
          filename: path.basename(part.path),
          contentType: 'audio/ogg'
        });
        return axios.post(ASSET_URL, form, {
          headers: { ...form.getHeaders(), 'x-api-key': apiKey },
          maxBodyLength: ROBLOX_MAX_AUDIO_BYTES + 1024 * 1024,
          maxContentLength: ROBLOX_MAX_AUDIO_BYTES + 1024 * 1024,
          timeout: ROBLOX_UPLOAD_TIMEOUT_MS,
          validateStatus: () => true,
          signal,
          ...AXIOS_AGENTS
        });
      }, {
        retries: 2,
        retryDelayMs: 1500,
        signal
      });
      const { data } = response;
      if (response.status >= 400) {
        const formatted = formatRobloxError({ status: response.status, ...data });
        trace.push({
          step: 'Submit Open Cloud',
          status: 'Failed',
          message: formatted.message
        });
        results.push({
          part: part.index,
          status: 'Failed',
          assetId: null,
          rbxassetid: '',
          operationId: '',
          httpStatus: response.status,
          error: formatted.message,
          trace
        });
        continue;
      }

      const operationId = extractOperationId(data);
      trace.push({
        step: 'Submit Open Cloud',
        status: operationId ? 'Accepted' : 'Pending',
        message: operationId ? `Roblox menerima request. Operation ID: ${operationId}.` : 'Roblox menerima request, tetapi operationId tidak ditemukan.'
      });
      const polled = operationId
        ? await pollOperation(operationId, apiKey, signal)
        : { status: 'Pending', error: 'Operation ID tidak ditemukan.' };
      trace.push(...(polled.trace || []));

      results.push({
        part: part.index,
        status: polled.status,
        assetId: polled.assetId || null,
        rbxassetid: polled.assetId ? `rbxassetid://${polled.assetId}` : '',
        operationId,
        httpStatus: polled.httpStatus || response.status,
        error: polled.error || null,
        trace
      });
    } catch (error) {
      if (signal?.aborted || error.code === 'ERR_CANCELED' || error.code === 'client_abort') throw clientAbortError();
      const formatted = formatRobloxError(error);
      trace.push({
        step: 'Submit Open Cloud',
        status: 'Failed',
        message: formatted.message
      });
      results.push({
        part: part.index,
        status: 'Failed',
        assetId: null,
        rbxassetid: '',
        httpStatus: formatted.status,
        error: formatted.message,
        trace
      });
    }
  }

  return results;
}
