const PREFIX = new TextEncoder().encode('AINOUR2');

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function concat(...parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

export function createDriveAdapter({ auth, knowledgeFolderId, backupFolderId, backupKey, fetchImpl = fetch }) {
  if (!backupKey) throw new Error('Google Drive adapter requires BACKUP_ENCRYPTION_KEY');
  const keyBytes = base64ToBytes(backupKey);
  if (keyBytes.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY must decode to 32 bytes');
  let cryptoKeyPromise = null;

  async function cryptoKey() {
    if (!cryptoKeyPromise) {
      cryptoKeyPromise = crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    }
    return cryptoKeyPromise;
  }

  async function encryptBackup(plainBytes) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await cryptoKey();
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainBytes));
    return concat(PREFIX, iv, ciphertext);
  }

  async function decryptBackup(payload) {
    if (payload.length < PREFIX.length + 12 + 16) throw new Error('Encrypted backup is too short');
    const prefix = payload.subarray(0, PREFIX.length);
    if (String.fromCharCode(...prefix) !== 'AINOUR2') throw new Error('Unknown backup format');
    const iv = payload.subarray(PREFIX.length, PREFIX.length + 12);
    const ciphertext = payload.subarray(PREFIX.length + 12);
    const key = await cryptoKey();
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext));
  }

  async function findFolder(name) {
    const query = `name='${name.replaceAll("'", "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const data = await auth.json(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&spaces=drive`);
    return data.files?.[0] || null;
  }

  async function ensureFolder(name) {
    const existing = await findFolder(name);
    if (existing) return { ...existing, reused: true };
    const data = await auth.json('https://www.googleapis.com/drive/v3/files?fields=id,name', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' })
    });
    return { id: data.id, name: data.name, reused: false };
  }

  async function uploadBytes({ name, parentId, mimeType, bytes }) {
    const boundary = `ainour_boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const metadata = JSON.stringify({ name, parents: [parentId], mimeType });
    const head = new TextEncoder().encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
    );
    const tail = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
    const body = concat(head, bytes, tail);
    return auth.json('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size', {
      method: 'POST',
      headers: { 'content-type': `multipart/related; boundary=${boundary}` },
      body
    });
  }

  async function downloadBytes(fileId) {
    const response = await auth.request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);
    if (!response.ok) throw new Error(`Drive download failed with HTTP ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  async function remove(fileId) {
    const response = await auth.request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
    return response.status === 204 || response.status === 200;
  }

  async function status() {
    const [knowledge, backup] = await Promise.all([
      findFolder('AI Nour Knowledge (Phase 0A)'),
      findFolder('AI Nour Backups (Phase 0A)')
    ]);
    return {
      ok: Boolean(knowledge?.id && backup?.id),
      knowledgeFolder: knowledge?.id || null,
      backupFolder: backup?.id || null
    };
  }

  async function backupRoundTripTest() {
    const backup = (await findFolder('AI Nour Backups (Phase 0A)')) || (backupFolderId ? { id: backupFolderId } : null);
    if (!backup?.id) throw new Error('Backup folder is not available');
    const plain = new TextEncoder().encode(JSON.stringify({ phase: '1', synthetic: true, at: new Date().toISOString() }));
    const encrypted = await encryptBackup(plain);
    const uploaded = await uploadBytes({
      name: `phase1-backup-${Date.now()}.bin`,
      parentId: backup.id,
      mimeType: 'application/octet-stream',
      bytes: encrypted
    });
    try {
      const downloaded = await downloadBytes(uploaded.id);
      const decrypted = await decryptBackup(downloaded);
      return {
        uploaded: Boolean(uploaded.id),
        downloaded: downloaded.length === encrypted.length,
        decryptsExactly: bytesEqual(decrypted, plain),
        cleanedUp: await remove(uploaded.id)
      };
    } catch (error) {
      await remove(uploaded.id).catch(() => false);
      throw error;
    }
  }

  return { findFolder, ensureFolder, uploadBytes, downloadBytes, remove, status, encryptBackup, decryptBackup, backupRoundTripTest, knowledgeFolderId, backupFolderId };
}
