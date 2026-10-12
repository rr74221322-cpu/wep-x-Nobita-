const axios = require('axios');

const API_URL = 'https://api.sayan-nexuswork.workers.dev/music';

function safeFileName(title) {
  return String(title || 'song')
    .replace(/[\\/:*?"<>|\r\n]/g, '')
    .trim()
    .slice(0, 180) || 'song';
}

async function handlePlaySong(sock, msg, args, quotedContact) {
  const jid = msg.key.remoteJid;
  const query = args.join(' ').trim();

  if (!query) {
    await sock.sendMessage(jid, {
      text: `🎵 ᴜsᴀɢᴇ: .play <song name>\n🌸 ᴇxᴀᴍᴘʟᴇ: .play Shape of You`
    }, { quoted: quotedContact });
    return true;
  }

  try {
    const statusMsg = await sock.sendMessage(jid, {
      text: `🔎 ᴄʜᴇᴄᴋɪɴɢ: ${query}\n⏳ ᴘʟᴇᴀsᴇ ᴡᴀɪᴛ...`
    }, { quoted: quotedContact });

    const response = await axios.get(
      `${API_URL}?query=${encodeURIComponent(query)}`,
      {
        timeout: 60000,
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }
      }
    );

    const data = response.data;
    if (data?.status !== 'success' || !data?.url) {
      throw new Error(data?.message || 'API did not return an audio URL.');
    }

    const title = safeFileName(data.title || query);

    try {
      await sock.sendMessage(jid, {
        text: `⬇️ ᴅᴏᴡɴʟᴏᴀᴅɪɴɢ: ${data.title || query}...`
      }, { quoted: statusMsg || quotedContact });
    } catch {}

    const audioResponse = await axios.get(data.url, {
      responseType: 'arraybuffer',
      timeout: 120000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        Referer: 'https://www.youtube.com'
      },
      validateStatus: status => status >= 200 && status < 400
    });

    const audioBuffer = Buffer.from(audioResponse.data);
    if (!audioBuffer.length) throw new Error('Audio response was empty.');

    await sock.sendMessage(jid, {
      audio: audioBuffer,
      mimetype: 'audio/mpeg',
      fileName: `${title}.mp3`,
      ptt: false
    }, { quoted: quotedContact });

    return true;
  } catch (error) {
    console.error(`[PLAY/SONG] ${error?.message || error}`);
    await sock.sendMessage(jid, {
      text: `🥺💔 ᴘʟᴀʏ ғᴀɪʟᴇᴅ\n🌸 ${error?.message || 'Please try again later.'}`
    }, { quoted: quotedContact });
    return true;
  }
}

module.exports = { handlePlaySong };
