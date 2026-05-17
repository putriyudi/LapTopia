// backend/utils/contract.js
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Warna tema LapTopia
const COLOR_PRIMARY   = '#1e40af';
const COLOR_SECONDARY = '#1e3a8a';
const COLOR_ACCENT    = '#3b82f6';
const COLOR_LIGHT_BG  = '#eff6ff';
const COLOR_GRAY      = '#64748b';
const COLOR_DARK      = '#0f172a';
const COLOR_GREEN     = '#16a34a';
const COLOR_BORDER    = '#bfdbfe';

function drawFilledRect(doc, x, y, w, h, color) {
  doc.save().rect(x, y, w, h).fill(color).restore();
}

function drawHLine(doc, x, y, w, color, thickness) {
  color     = color     || '#e2e8f0';
  thickness = thickness || 0.5;
  doc.save().moveTo(x, y).lineTo(x + w, y).strokeColor(color).lineWidth(thickness).stroke().restore();
}

function drawInfoTable(doc, x, y, rows, colWidths, pageWidth) {
  var rowH = 22;
  var curY = y;
  rows.forEach(function(row, idx) {
    var bgColor = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
    drawFilledRect(doc, x, curY, pageWidth, rowH, bgColor);
    doc.save()
      .fontSize(9).font('Helvetica').fillColor(COLOR_GRAY)
      .text(row[0], x + 8, curY + 6, { width: colWidths[0] - 8 })
      .restore();
    doc.save()
      .fontSize(9.5).font('Helvetica-Bold').fillColor(COLOR_DARK)
      .text(row[1], x + colWidths[0] + 8, curY + 6, { width: colWidths[1] - 16 })
      .restore();
    drawHLine(doc, x, curY + rowH, pageWidth, '#e2e8f0', 0.5);
    curY += rowH;
  });
  return curY;
}

// BUG FIX: Path kontrak disimpan sebagai relatif terhadap project root
async function generateKontrak(data) {
  return new Promise(function(resolve, reject) {
    try {
      var doc = new PDFDocument({ margin: 0, size: 'A4' });

      var contractsDir = path.join(__dirname, '../../contracts');
      ensureDir(contractsDir);

      var filename  = 'kontrak_trx_' + data.id_transaksi + '_' + Date.now() + '.pdf';
      var filePath  = path.join(contractsDir, filename);

      var writeStream = fs.createWriteStream(filePath);
      var fileHash    = crypto.createHash('sha256');
      doc.on('data', function(chunk) { fileHash.update(chunk); });
      doc.pipe(writeStream);

      var M      = 45;
      var PW     = 595.28;
      var CW     = PW - M * 2;
      var nowStr = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });
      var nomorKontrak = 'KTR-' + data.id_transaksi + '-' + new Date().getFullYear();

      // HEADER BANNER
      drawFilledRect(doc, 0, 0, PW, 88, COLOR_SECONDARY);
      drawFilledRect(doc, 0, 88, PW, 5, COLOR_ACCENT);

      doc.save()
        .fontSize(26).font('Helvetica-Bold').fillColor('#ffffff')
        .text('LapTopia', M, 18, { continued: true })
        .fontSize(20).font('Helvetica').fillColor('#93c5fd')
        .text('  LAPTOP RENT', { continued: false })
        .restore();

      doc.save()
        .fontSize(9).font('Helvetica').fillColor('#bfdbfe')
        .text('DOKUMEN KONTRAK PENYEWAAN LAPTOP DIGITAL', M, 52)
        .restore();

      doc.save()
        .fontSize(8).font('Helvetica').fillColor('#93c5fd')
        .text('NOMOR KONTRAK', 0, 18, { align: 'right', width: PW - M })
        .fontSize(13).font('Helvetica-Bold').fillColor('#ffffff')
        .text(nomorKontrak, 0, 34, { align: 'right', width: PW - M })
        .fontSize(8).font('Helvetica').fillColor('#bfdbfe')
        .text('Dicetak: ' + nowStr, 0, 54, { align: 'right', width: PW - M })
        .restore();

      var payloadString = data.id_transaksi + '|' + data.nik_penyewa + '|' + data.nomor_seri + '|' + data.tgl_mulai_sewa;
      var contentHash   = crypto.createHash('sha256').update(payloadString).digest('hex');

      var curY = 110;

      // STATUS BADGE
      var isPaid   = data.payment_status === 'paid';
      var badgeClr = isPaid ? COLOR_GREEN : '#d97706';
      var badgeTxt = isPaid ? 'PEMBAYARAN LUNAS' : 'MENUNGGU PEMBAYARAN';
      var badgeW   = 170;
      doc.save()
        .roundedRect(PW - M - badgeW, curY - 4, badgeW, 22, 4)
        .fillAndStroke(badgeClr + '22', badgeClr)
        .restore();
      doc.save()
        .fontSize(8.5).font('Helvetica-Bold').fillColor(badgeClr)
        .text(badgeTxt, PW - M - badgeW + 8, curY + 2, { width: badgeW - 16, align: 'center' })
        .restore();

      function sectionHeader(title, y) {
        drawFilledRect(doc, M, y, CW, 26, COLOR_PRIMARY);
        doc.save()
          .fontSize(10).font('Helvetica-Bold').fillColor('#ffffff')
          .text(title, M + 10, y + 8)
          .restore();
        return y + 26;
      }

      // A. INFORMASI TRANSAKSI
      curY = sectionHeader('A.  INFORMASI TRANSAKSI', curY + 6);
      var txRows = [
        ['ID Transaksi',      '#' + data.id_transaksi],
        ['Nomor Kontrak',     nomorKontrak],
        ['Metode Pembayaran', data.payment_method || '-'],
        ['Status Pembayaran', isPaid ? 'LUNAS' : (data.payment_status || 'pending').toUpperCase()],
        ['Waktu Cetak',       nowStr],
      ];
      curY = drawInfoTable(doc, M, curY, txRows, [160, CW - 160], CW);
      drawHLine(doc, M, curY, CW, COLOR_BORDER, 1);
      curY += 14;

      // B. DATA PENYEWA
      curY = sectionHeader('B.  DATA PENYEWA', curY);
      var maskedNik = data.nik_penyewa || '';
      if (maskedNik.length === 16) {
        maskedNik = maskedNik.substring(0, 4) + '  ****  ****  ' + maskedNik.substring(12);
      }
      var penyewaRows = [
        ['Nama Lengkap',     data.nama_penyewa],
        ['NIK KTP (Masked)', maskedNik],
        ['Email',            data.email_penyewa],
        ['No. HP / WA',      data.no_hp_penyewa],
        ['Alamat Domisili',  data.alamat_penyewa || '-'],
        ['Jaminan Fisik',    data.jaminan_fisik  || 'Tidak Ada'],
      ];
      curY = drawInfoTable(doc, M, curY, penyewaRows, [160, CW - 160], CW);
      drawHLine(doc, M, curY, CW, COLOR_BORDER, 1);
      curY += 14;

      // C. DATA LAPTOP & PERIODE SEWA
      curY = sectionHeader('C.  DATA LAPTOP & PERIODE SEWA', curY);
      var laptopRows = [
        ['Merk / Tipe',          data.merk_tipe],
        ['Nomor Seri',           data.nomor_seri],
        ['Spesifikasi',          data.spesifikasi || '-'],
        ['Tanggal Mulai Sewa',   new Date(data.tgl_mulai_sewa).toLocaleDateString('id-ID', { dateStyle: 'long' })],
        ['Rencana Pengembalian', new Date(data.tgl_kembali_rencana).toLocaleDateString('id-ID', { dateStyle: 'long' })],
        ['Durasi Sewa',          data.durasi_hari + ' Hari'],
      ];
      curY = drawInfoTable(doc, M, curY, laptopRows, [160, CW - 160], CW);
      drawHLine(doc, M, curY, CW, COLOR_BORDER, 1);
      curY += 14;

      // D. RINCIAN BIAYA
      curY = sectionHeader('D.  RINCIAN BIAYA', curY);
      var hargaHarian = parseFloat(data.harga_sewa_per_hari || 0);
      var totalBiaya  = parseFloat(data.total_biaya);
      var biayaRows   = [
        ['Harga Sewa / Hari', 'Rp ' + hargaHarian.toLocaleString('id-ID')],
        ['Durasi Sewa',       data.durasi_hari + ' Hari'],
      ];
      curY = drawInfoTable(doc, M, curY, biayaRows, [160, CW - 160], CW);

      // Baris total — highlight
      drawFilledRect(doc, M, curY, CW, 28, COLOR_PRIMARY + '18');
      doc.save()
        .rect(M, curY, CW, 28).strokeColor(COLOR_PRIMARY).lineWidth(1).stroke()
        .restore();
      doc.save()
        .fontSize(10).font('Helvetica-Bold').fillColor(COLOR_PRIMARY)
        .text('TOTAL BIAYA SEWA', M + 10, curY + 9, { width: 150 })
        .restore();
      doc.save()
        .fontSize(13).font('Helvetica-Bold').fillColor(COLOR_PRIMARY)
        .text('Rp ' + totalBiaya.toLocaleString('id-ID'), M + 160, curY + 7, { width: CW - 170, align: 'right' })
        .restore();
      curY += 28;
      drawHLine(doc, M, curY, CW, COLOR_BORDER, 1);
      curY += 14;

      // E. SYARAT & KETENTUAN
      curY = sectionHeader('E.  SYARAT & KETENTUAN PENYEWAAN', curY);
      var ketentuanList = [
        'Penyewa wajib mengembalikan laptop tepat waktu sesuai tanggal yang telah disepakati dalam kondisi baik.',
        'Keterlambatan pengembalian dikenakan denda sebesar 10% dari tarif sewa harian per setiap hari keterlambatan.',
        'Kerusakan fisik maupun fungsional akibat kelalaian penyewa sepenuhnya menjadi tanggung jawab penyewa.',
        'Dilarang keras memindahtangankan, menyewakan kembali, atau menggadaikan laptop kepada pihak lain.',
        'Pelanggaran poin (4) memberi LapTopia hak untuk menempuh jalur hukum atas tindakan penggelapan aset.',
        'Penyewa wajib menjaga keamanan data dan tidak melakukan tindakan ilegal menggunakan perangkat.',
        'LapTopia berhak melakukan pengecekan kondisi perangkat sewaktu-waktu selama masa sewa berlangsung.',
        'Sengketa diselesaikan secara musyawarah; jika tidak tercapai, diselesaikan melalui jalur hukum yang berlaku.',
      ];

      drawFilledRect(doc, M, curY, CW, ketentuanList.length * 18 + 12, '#fafafa');
      var ky = curY + 8;
      ketentuanList.forEach(function(k, i) {
        drawFilledRect(doc, M + 8, ky, 14, 14, COLOR_ACCENT);
        doc.save()
          .fontSize(7.5).font('Helvetica-Bold').fillColor('#ffffff')
          .text('' + (i + 1), M + 8, ky + 3, { width: 14, align: 'center' })
          .restore();
        doc.save()
          .fontSize(8.5).font('Helvetica').fillColor(COLOR_DARK)
          .text(k, M + 28, ky + 1, { width: CW - 36, lineGap: 1 })
          .restore();
        ky += 18;
      });
      curY = ky + 4;
      drawHLine(doc, M, curY, CW, COLOR_BORDER, 1);
      curY += 18;

      // F. TANDA TANGAN
      drawFilledRect(doc, M, curY, CW, 24, COLOR_LIGHT_BG);
      doc.save()
        .fontSize(9).font('Helvetica-Bold').fillColor(COLOR_PRIMARY)
        .text('F.  TANDA TANGAN & PERSETUJUAN', M + 10, curY + 8)
        .restore();
      curY += 24;

      var colW = CW / 2 - 8;
      var sigH = 80;
      var sigY = curY + 10;

      // Kotak penyewa
      doc.save()
        .rect(M, sigY, colW, sigH).strokeColor(COLOR_BORDER).lineWidth(1).stroke()
        .restore();
      doc.save()
        .fontSize(8.5).font('Helvetica').fillColor(COLOR_GRAY)
        .text('Penyewa,', M + 8, sigY + 6)
        .restore();
      drawHLine(doc, M + 10, sigY + sigH - 22, colW - 20, '#94a3b8', 0.75);
      doc.save()
        .fontSize(9).font('Helvetica-Bold').fillColor(COLOR_DARK)
        .text('( ' + data.nama_penyewa + ' )', M, sigY + sigH - 16, { width: colW, align: 'center' })
        .restore();

      // Kotak kasir
      var kasirX = M + colW + 16;
      doc.save()
        .rect(kasirX, sigY, colW, sigH).strokeColor(COLOR_BORDER).lineWidth(1).stroke()
        .restore();
      doc.save()
        .fontSize(8.5).font('Helvetica').fillColor(COLOR_GRAY)
        .text('Petugas / Kasir,', kasirX + 8, sigY + 6)
        .restore();
      drawHLine(doc, kasirX + 10, sigY + sigH - 22, colW - 20, '#94a3b8', 0.75);
      doc.save()
        .fontSize(9).font('Helvetica-Bold').fillColor(COLOR_DARK)
        .text('( ' + (data.kasir_nama || 'Kasir') + ' )', kasirX, sigY + sigH - 16, { width: colW, align: 'center' })
        .restore();

      curY = sigY + sigH + 20;

      // DIGITAL INTEGRITY STAMP
      drawFilledRect(doc, M, curY, CW, 56, COLOR_DARK);
      doc.save()
        .fontSize(7).font('Courier').fillColor('#94a3b8')
        .text('DOKUMEN INI DIGENERATE SECARA OTOMATIS OLEH SISTEM LAPTOPIA — TIDAK MEMERLUKAN TANDA TANGAN FISIK',
              M + 8, curY + 6, { width: CW - 16, align: 'center' })
        .restore();
      doc.save()
        .fontSize(7).font('Courier').fillColor('#60a5fa')
        .text('Content Integrity Hash (SHA-256):', M + 8, curY + 20, { width: CW - 16, align: 'center' })
        .restore();
      doc.save()
        .fontSize(6.5).font('Courier').fillColor('#34d399')
        .text(contentHash, M + 8, curY + 32, { width: CW - 16, align: 'center', characterSpacing: 0.5 })
        .restore();
      doc.save()
        .fontSize(7).font('Courier').fillColor('#6b7280')
        .text('© ' + new Date().getFullYear() + ' LapTopia Laptop Rent — Dokumen berlaku tanpa cap & tanda tangan fisik',
              M + 8, curY + 44, { width: CW - 16, align: 'center' })
        .restore();

      doc.end();

      writeStream.on('finish', function() {
        var finalFileHash = fileHash.digest('hex');
        // BUG FIX: Kembalikan path relatif (bukan absolut)
        var projectRoot  = path.join(__dirname, '../..');
        var relativePath = path.relative(projectRoot, filePath);
        resolve({ filePath: relativePath, filename: filename, hash: finalFileHash });
      });

      writeStream.on('error', reject);

    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { generateKontrak };