// Bot WhatsApp dengan Baileys
// Install dependencies: npm install @whiskeysockets/baileys pino qrcode-terminal axios sharp

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  getContentType,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const pino = require('pino');
const readline = require('readline');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// Konfigurasi Bot
const prefix = '.';
const ownerNumber = '6281298993630';
const usePairingCode = false;
const phoneNumber = '6281298993630';

// Readline untuk input pairing code
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_session');
  const { version, isLatest } = await fetchLatestBaileysVersion();

  console.log(`🤖 Menggunakan Baileys versi: ${version}, Latest: ${isLatest}`);

  const naze = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    browser: ['Bot WhatsApp', 'Chrome', '3.0'],
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
    getMessage: async () => ({ conversation: 'Bot Message' })
  });

  // Pairing code (opsional)
  if (usePairingCode && !naze.authState.creds.registered) {
    console.log('\n🔐 MODE PAIRING CODE AKTIF\n');
    let phoneNumberInput = phoneNumber.replace(/[^0-9]/g, '');
    if (!phoneNumberInput) {
      phoneNumberInput = await question('📱 Masukkan nomor WhatsApp: ');
      phoneNumberInput = phoneNumberInput.replace(/[^0-9]/g, '');
    }
    if (!phoneNumberInput.startsWith('62')) phoneNumberInput = '62' + phoneNumberInput;

    setTimeout(async () => {
      try {
        const code = await naze.requestPairingCode(phoneNumberInput);
        console.log(`\n✅ KODE PAIRING: ${code}\n`);
        console.log('1. Buka WhatsApp di HP');
        console.log('2. Klik titik tiga > Linked Devices');
        console.log('3. Klik "Link a Device"');
        console.log('4. Klik "Link with phone number instead"');
        console.log(`5. Masukkan kode: ${code}\n`);
      } catch (error) {
        console.error('❌ Error requesting pairing code:', error.message);
      }
    }, 3000);
  }

  // Koneksi dan auto reconnect
  naze.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr && !usePairingCode) {
      const qrcode = require('qrcode-terminal');
      console.log('\n📱 Scan QR Code di bawah ini:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = lastDisconnect?.error?.message || 'Unknown';
      console.log(`\n❌ Koneksi terputus! Status: ${statusCode} | ${reason}\n`);
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        console.log('🔄 Mencoba reconnect dalam 5 detik...\n');
        setTimeout(startBot, 5000);
      } else {
        console.log('⚠️ Bot logout. Hapus folder "auth_session" untuk login ulang.\n');
        process.exit(0);
      }
    } else if (connection === 'open') {
      console.log('\n✅ Bot WhatsApp Terhubung!');
      console.log(`📞 Nomor Bot: ${naze.user.id.split(':')[0]}`);
      console.log(`👤 Nama: ${naze.user.name || 'Tidak ada nama'}`);
      console.log(`⏰ Waktu: ${new Date().toLocaleString('id-ID')}\n`);
    }
  });

  naze.ev.on('creds.update', saveCreds);

  // Handler pesan
  naze.ev.on('messages.upsert', async ({ messages }) => {
    try {
      const m = messages[0];
      if (!m.message) return;

      const type = getContentType(m.message);
      let body = '';
      if (type === 'conversation') body = m.message.conversation;
      else if (type === 'extendedTextMessage') body = m.message.extendedTextMessage.text;
      else if (type === 'imageMessage') body = m.message.imageMessage.caption || '';
      else if (type === 'videoMessage') body = m.message.videoMessage.caption || '';

      if (!body.startsWith(prefix)) return;

      const args = body.trim().split(/ +/);
      const command = args[0].slice(prefix.length).toLowerCase();
      const text = args.slice(1).join(' ');
      const quotedMsg = m.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const quotedText = quotedMsg?.conversation || quotedMsg?.extendedTextMessage?.text || '';

      const reply = async (txt) => naze.sendMessage(m.key.remoteJid, { text: txt }, { quoted: m });
      const react = async (emoji) =>
        naze.sendMessage(m.key.remoteJid, { react: { text: emoji, key: m.key } });

      // =====================
      // COMMAND HANDLER
      // =====================
      switch (command) {
        case 'brat': {
          const bratText = text || quotedText;
          if (!bratText)
            return reply(`❌ Gunakan: *${prefix + command}* teks\n\nContoh: ${prefix + command} halo dunia`);

          try {
            await react('⏳');
            const encodedText = encodeURIComponent(bratText);
            const url = `https://aqul-brat.hf.space/?text=${encodedText}`;

            console.log('🎨 Membuat Brat Sticker dari:', url);
            const response = await axios.get(url, {
              responseType: 'arraybuffer',
              timeout: 60000,
              headers: { 'User-Agent': 'Mozilla/5.0' }
            });

            const tmpFile = path.join(__dirname, 'brat.png');
            const outputFile = path.join(__dirname, 'brat.webp');
            fs.writeFileSync(tmpFile, Buffer.from(response.data));

            await sharp(tmpFile)
              .resize(512, 512, { fit: 'contain' })
              .webp({ quality: 100 })
              .toFile(outputFile);

            const stickerBuffer = fs.readFileSync(outputFile);
            await naze.sendMessage(m.key.remoteJid, { sticker: stickerBuffer }, { quoted: m });
            await react('✅');

            fs.unlinkSync(tmpFile);
            fs.unlinkSync(outputFile);
          } catch (e) {
            console.error('❌ Brat sticker error:', e.message);
            await react('❌');
            reply('❌ Gagal membuat brat sticker. Coba lagi nanti.');
          }
        }
        break;

        case 'ping': {
          const start = Date.now();
          await reply('🏓 Pinging...');
          const end = Date.now();
          await reply(`🏓 *Pong!* ${end - start}ms`);
        }
        break;

        default:
          reply(`❌ Command *${prefix + command}* tidak ditemukan.`);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });

  return naze;
}

// Jalankan bot
startBot().catch((err) => {
  console.error('Error starting bot:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));
process.on('unhandledRejection', (err) => console.error('Unhandled Rejection:', err));
