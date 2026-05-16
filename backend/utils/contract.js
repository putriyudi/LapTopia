const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const PDFDocument = require('pdfkit');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Generate PDF Kontrak Digital
 * Menyimpan PDF ke folder private 'contracts'
 * @param {Object} data - Data transaksi dari database
 * @returns {Promise<{filePath: string, filename: string, hash: string}>}
 */
async function generateKontrak(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      
      // Simpan di private folder 'contracts' di root project
      const contractsDir = path.join(__dirname, '../../contracts');
      ensureDir(contractsDir);

      const filename = `kontrak_trx_${data.id_transaksi}_${Date.now()}.pdf`;
      const filePath = path.join(contractsDir, filename);

      const writeStream = fs.createWriteStream(filePath);
      
      // Hash untuk file PDF (dihitung on-the-fly dari stream)
      const fileHash = crypto.createHash('sha256');
      doc.on('data', chunk => {
        fileHash.update(chunk);
      });
      
      doc.pipe(writeStream);

      // HEADER
      doc.fontSize(20).font('Helvetica-Bold').text('KONTRAK SEWA LAPTOP', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(12).font('Helvetica').fillColor('gray').text('LAPTOPIA - LAPTOP RENT', { align: 'center' });
      doc.moveDown(2);

      // HASH KONTEN INTERNAL
      // Kita hash data utamanya lalu cetak di PDF sebagai bukti integritas data cetak
      const payloadString = `${data.id_transaksi}|${data.nik_penyewa}|${data.nomor_seri}|${data.tgl_mulai_sewa}`;
      const contentHash = crypto.createHash('sha256').update(payloadString).digest('hex');

      doc.fillColor('black');
      
      // INFORMASI TRANSAKSI
      doc.fontSize(14).font('Helvetica-Bold').text('A. INFORMASI TRANSAKSI');
      doc.fontSize(11).font('Helvetica').moveDown(0.5);
      doc.text(`Nomor Kontrak   : KTR-${data.id_transaksi}-${new Date().getFullYear()}`);
      doc.text(`ID Transaksi    : #${data.id_transaksi}`);
      doc.text(`Waktu Cetak     : ${new Date().toLocaleString('id-ID')}`);
      doc.text(`Metode Bayar    : ${data.payment_method || '-'}`);
      doc.text(`Status Bayar    : ${data.payment_status === 'paid' ? 'LUNAS' : data.payment_status.toUpperCase()}`);
      doc.moveDown();

      // DATA PENYEWA
      doc.fontSize(14).font('Helvetica-Bold').text('B. DATA PENYEWA');
      doc.fontSize(11).font('Helvetica').moveDown(0.5);
      doc.text(`Nama Lengkap    : ${data.nama_penyewa}`);
      
      // Masking NIK (Tampilkan hanya 4 digit pertama dan 4 digit terakhir)
      let maskedNik = data.nik_penyewa;
      if (maskedNik && maskedNik.length === 16) {
        maskedNik = `${maskedNik.substring(0, 4)}********${maskedNik.substring(12)}`;
      }
      doc.text(`NIK (Masked)    : ${maskedNik}`);
      doc.text(`Email           : ${data.email_penyewa}`);
      doc.text(`No. HP          : ${data.no_hp_penyewa}`);
      doc.text(`Alamat          : ${data.alamat_penyewa}`);
      doc.text(`Jaminan Fisik   : ${data.jaminan_fisik || 'Tidak Ada'}`);
      doc.moveDown();

      // DATA LAPTOP
      doc.fontSize(14).font('Helvetica-Bold').text('C. DATA LAPTOP & SEWA');
      doc.fontSize(11).font('Helvetica').moveDown(0.5);
      doc.text(`Merk / Tipe     : ${data.merk_tipe}`);
      doc.text(`Nomor Seri      : ${data.nomor_seri}`);
      if (data.spesifikasi) {
        doc.text(`Spesifikasi     : ${data.spesifikasi}`);
      }
      doc.text(`Tanggal Mulai   : ${new Date(data.tgl_mulai_sewa).toLocaleDateString('id-ID')}`);
      doc.text(`Rencana Kembali : ${new Date(data.tgl_kembali_rencana).toLocaleDateString('id-ID')}`);
      doc.text(`Durasi Sewa     : ${data.durasi_hari} Hari`);
      doc.text(`Total Biaya     : Rp ${parseFloat(data.total_biaya).toLocaleString('id-ID')}`);
      doc.moveDown();

      // KETENTUAN SEWA
      doc.fontSize(14).font('Helvetica-Bold').text('D. KETENTUAN SEWA');
      doc.fontSize(10).font('Helvetica').moveDown(0.5);
      doc.text('1. Penyewa wajib mengembalikan laptop dalam keadaan baik sesuai waktu yang telah disepakati.');
      doc.text('2. Keterlambatan pengembalian akan dikenakan denda sebesar 10% dari tarif sewa harian untuk setiap hari keterlambatan.');
      doc.text('3. Kerusakan fisik, kehilangan, atau kerusakan perangkat lunak yang diakibatkan kelalaian penyewa akan ditanggung sepenuhnya oleh penyewa sesuai estimasi perbaikan teknisi LaptopRent.');
      doc.text('4. Laptop tidak boleh dipindahtangankan, disewakan kembali, digadai, atau dijual kepada pihak manapun.');
      doc.text('5. Apabila penyewa melanggar poin (4), maka LaptopRent berhak menempuh jalur hukum terkait penggelapan barang/aset perusahaan.');
      doc.moveDown(3);

      // TANDA TANGAN
      const ySig = doc.y;
      doc.fontSize(11);
      doc.text('Penyewa,', 50, ySig, { align: 'left' });
      doc.text('Petugas / Kasir,', 0, ySig, { align: 'right' });
      
      doc.moveDown(4);
      
      doc.font('Helvetica-Bold');
      doc.text(`( ${data.nama_penyewa} )`, 50, doc.y, { align: 'left' });
      doc.text(`( ${data.kasir_nama} )`, 0, doc.y - 13, { align: 'right' });
      
      // DIGITAL HASH STAMP
      doc.moveDown(4);
      doc.fontSize(8).font('Courier').fillColor('gray');
      doc.text('========================================================================', { align: 'center' });
      doc.text('DOKUMEN INI DIGENERATE SECARA OTOMATIS OLEH SISTEM LAPTOPIA', { align: 'center' });
      doc.text(`Content Integrity Hash (SHA256): ${contentHash}`, { align: 'center' });
      doc.text('========================================================================', { align: 'center' });

      doc.end();

      writeStream.on('finish', () => {
        const finalFileHash = fileHash.digest('hex');
        resolve({ 
          filePath, 
          filename, 
          hash: finalFileHash 
        });
      });

      writeStream.on('error', (error) => {
        reject(error);
      });

    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { generateKontrak };