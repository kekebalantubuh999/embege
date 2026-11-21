/**
 * ============================================================================
 * FILE: Setup.gs
 * FUNGSI: Inisialisasi & Penyusunan Database Google Sheets Otomatis (MBG SPPG)
 * ============================================================================
 */

const MBG_TIMEZONE = 'Asia/Jakarta';

const DB_SCHEMA = {
  Menu_MBG: {
    headerColor: '#3E3A3C',
    columns: [
      'Tanggal',
      'Hari',
      'Makanan_Pokok',
      'Lauk_Utama',
      'Lauk_Pendamping',
      'Sayuran',
      'Buah',
      'Pelengkap',
      'Porsi_PAUD',
      'Porsi_SD',
      'Porsi_SMP',
      'Catatan_Khusus'
    ]
  },
  Pengaturan_SPPG: {
    headerColor: '#3E3A3C',
    columns: ['Kunci', 'Nilai', 'Keterangan']
  }
};

/**
 * Menambahkan menu kustom ketika Google Spreadsheet dibuka
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('🍱 Admin MBG SPPG')
      .addItem('🚀 Inisialisasi Database (Setup)', 'setupDatabaseFromMenu')
      .addItem('🔄 Reset Cache Web App', 'clearMenuCacheFromMenu')
      .addToUi();
  } catch (e) {
    // Abaikan jika dijalankan dari standalone script tanpa UI Spreadsheet aktif
  }
}

/**
 * Wrapper menu untuk setupDatabase dengan umpan balik alert UI
 */
function setupDatabaseFromMenu() {
  const result = setupDatabase();
  try {
    SpreadsheetApp.getUi().alert(
      'Setup Selesai',
      result.message + '\nSpreadsheet ID: ' + result.data.spreadsheetId,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (e) {
    // Non-UI context
  }
  return result;
}

/**
 * Wrapper menu untuk clearMenuCache dengan umpan balik toast UI
 */
function clearMenuCacheFromMenu() {
  const result = clearMenuCache();
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      ss.toast(result.message, '🍱 Admin MBG SPPG', 4);
    }
  } catch (e) {
    // Non-UI context
  }
  return result;
}

/**
 * Mendapatkan instance Spreadsheet aktif atau membuat baru jika standalone
 */
function getTargetSpreadsheet() {
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty('SPREADSHEET_ID');

  if (savedId) {
    try {
      return SpreadsheetApp.openById(savedId);
    } catch (e) {
      Logger.log('SPREADSHEET_ID tersimpan tidak valid, mencoba Spreadsheet aktif...');
    }
  }

  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    ss = SpreadsheetApp.create('Database_Menu_MBG_SPPG');
  }
  props.setProperty('SPREADSHEET_ID', ss.getId());
  return ss;
}

/**
 * Menghitung daftar 5 tanggal (Senin–Jumat) pada pekan sekolah aktif di Asia/Jakarta.
 * Jika dijalankan pada Sabtu/Minggu, otomatis diarahkan ke Senin–Jumat pekan depan.
 */
function getActiveSchoolWeekDates() {
  const now = new Date();
  const jakartaDateStr = Utilities.formatDate(now, MBG_TIMEZONE, 'yyyy-MM-dd');
  const parts = jakartaDateStr.split('-').map(function (n) {
    return parseInt(n, 10);
  });
  const baseUtc = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
  const isoDay = baseUtc.getUTCDay(); // 0=Min, 1=Sen, ..., 6=Sab

  let offsetToMonday = 0;
  if (isoDay === 6) {
    offsetToMonday = 2; // Sabtu -> Senin depan
  } else if (isoDay === 0) {
    offsetToMonday = 1; // Minggu -> Senin besok
  } else {
    offsetToMonday = 1 - isoDay; // Senin..Jumat -> Senin pekan ini
  }

  const mondayUtc = new Date(baseUtc.getTime() + offsetToMonday * 86400000);
  const dates = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(mondayUtc.getTime() + i * 86400000);
    dates.push(Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd'));
  }
  return dates;
}

/**
 * Menghasilkan 5 baris seed menu Senin–Jumat sesuai skema FR-04
 */
function buildDefaultMenuSeedRows() {
  const weekDates = getActiveSchoolWeekDates();
  return [
    [
      weekDates[0],
      'Senin',
      'Nasi Putih Pulen',
      'Ayam Panggang Kecap',
      'Tahu Bacem Manis',
      'Capcay Wortel Brokoli',
      'Pisang Barangan',
      'Susu UHT Full Cream',
      'Nasi 80g, Ayam 40g, Tahu 30g, Sayur 40g, Susu 115ml',
      'Nasi 120g, Ayam 60g, Tahu 40g, Sayur 60g, Susu 125ml',
      'Nasi 160g, Ayam 80g, Tahu 50g, Sayur 80g, Susu 200ml',
      'Disajikan hangat · Tanpa MSG · Kecap rendah natrium'
    ],
    [
      weekDates[1],
      'Selasa',
      'Nasi Putih Pulen',
      'Telor Bumbu Balado',
      'Tempe Goreng Gurih',
      'Sayur Sop Wortel & Sawi',
      'Jeruk Manis Segar',
      'Susu UHT Full Cream',
      'Nasi 80g, Telur 1 btr, Tempe 25g, Sayur 45g, Susu 115ml',
      'Nasi 120g, Telur 1 btr, Tempe 40g, Sayur 65g, Susu 125ml',
      'Nasi 160g, Telur 1-2 btr, Tempe 55g, Sayur 85g, Susu 200ml',
      'Mengandung protein telur · Balado lembut tidak pedas'
    ],
    [
      weekDates[2],
      'Rabu',
      'Nasi Putih Pulen',
      'Ikan Kembung Bumbu Kuning',
      'Perkedel Kentang Panggang',
      'Sayur Bayam & Jagung Manis',
      'Semangka Merah Segar',
      'Susu UHT Full Cream',
      'Nasi 80g, Ikan 40g, Perkedel 30g, Sayur 45g, Susu 115ml',
      'Nasi 120g, Ikan 60g, Perkedel 45g, Sayur 65g, Susu 125ml',
      'Nasi 160g, Ikan 80g, Perkedel 60g, Sayur 85g, Susu 200ml',
      'Ikan fillet tanpa duri · Bebas alergen kacang'
    ],
    [
      weekDates[3],
      'Kamis',
      'Nasi Kuning Harum Kunyit',
      'Ayam Semur Kecap Suwir',
      'Tempe Orek Manis',
      'Tumis Buncis & Wortel',
      'Apel Merah Segar',
      'Susu UHT Full Cream',
      'Nasi 80g, Ayam 40g, Tempe 25g, Sayur 40g, Susu 115ml',
      'Nasi 120g, Ayam 60g, Tempe 40g, Sayur 60g, Susu 125ml',
      'Nasi 160g, Ayam 80g, Tempe 50g, Sayur 80g, Susu 200ml',
      'Kaya zat besi & vitamin C · Tanpa pewarna sintetis'
    ],
    [
      weekDates[4],
      'Jumat',
      'Nasi Putih Pulen',
      'Bakso Sapi Saus Tomat Segar',
      'Tahu Kukus Daun Bawang',
      'Sup Brokoli & Labu Siam',
      'Pepaya Potong Manis',
      'Susu UHT Full Cream',
      'Nasi 80g, Bakso 35g, Tahu 30g, Sayur 45g, Susu 115ml',
      'Nasi 120g, Bakso 55g, Tahu 40g, Sayur 65g, Susu 125ml',
      'Nasi 160g, Bakso 75g, Tahu 55g, Sayur 85g, Susu 200ml',
      'Daging sapi halal bersertifikat · Saus tomat alami'
    ]
  ];
}

/**
 * Menghasilkan seed konfigurasi awal SPPG
 */
function buildDefaultSettingsSeedRows() {
  return [
    ['Nama_SPPG', 'SPPG Unit Terpusat', 'Nama unit dapur penyedia layanan MBG'],
    ['Jam_Distribusi', '09.30 WIB', 'Estimasi pengiriman ompreng ke sekolah binaan'],
    ['Kontak_Admin', '0812-0000-1234', 'Kontak WhatsApp koordinator ahli gizi SPPG'],
    ['Wilayah_Layanan', 'Kluster Sekolah Binaan', 'Cakupan sekolah penerima manfaat SPPG']
  ];
}

/**
 * Fungsi Utama: Menyusun seluruh Sheet, Header, Format Visual, dan Seed Data
 */
function setupDatabase() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return {
      success: false,
      code: 429,
      message: 'Proses setup lain sedang berjalan. Silakan coba beberapa saat lagi.'
    };
  }

  try {
    const ss = getTargetSpreadsheet();
    const createdSheets = [];
    const existingSheets = [];

    const seedBySheet = {
      Menu_MBG: buildDefaultMenuSeedRows(),
      Pengaturan_SPPG: buildDefaultSettingsSeedRows()
    };

    Object.keys(DB_SCHEMA).forEach(function (sheetName) {
      const config = DB_SCHEMA[sheetName];
      let sheet = ss.getSheetByName(sheetName);

      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
        createdSheets.push(sheetName);
      } else {
        existingSheets.push(sheetName);
      }

      const lastCol = config.columns.length;
      const headerRange = sheet.getRange(1, 1, 1, lastCol);
      headerRange.setValues([config.columns]);

      headerRange
        .setBackground(config.headerColor || '#3E3A3C')
        .setFontColor('#FFFFFF')
        .setFontWeight('bold')
        .setFontFamily('Inter, Arial, sans-serif')
        .setHorizontalAlignment('center')
        .setVerticalAlignment('middle');

      sheet.setRowHeight(1, 34);
      sheet.setFrozenRows(1);

      // Pastikan kolom Tanggal diformat sebagai Plain Text '@' agar YYYY-MM-DD konsisten
      if (sheetName === 'Menu_MBG') {
        const maxRows = Math.max(sheet.getMaxRows() - 1, 50);
        sheet.getRange(2, 1, maxRows, 1).setNumberFormat('@');
      }

      const seedData = seedBySheet[sheetName] || [];
      if (sheet.getLastRow() <= 1 && seedData.length > 0) {
        sheet.getRange(2, 1, seedData.length, lastCol).setValues(seedData);
      }

      for (let c = 1; c <= lastCol; c++) {
        sheet.autoResizeColumn(c);
        const currentWidth = sheet.getColumnWidth(c);
        if (currentWidth < 120) sheet.setColumnWidth(c, 120);
        if (currentWidth > 320) sheet.setColumnWidth(c, 320);
      }
    });

    // Hapus 'Sheet1' bawaan kosong jika database baru dibuat
    const defaultSheet = ss.getSheetByName('Sheet1');
    if (defaultSheet && ss.getSheets().length > 1 && defaultSheet.getLastRow() === 0) {
      ss.deleteSheet(defaultSheet);
    }

    // Bersihkan cache lama setelah setup
    try {
      CacheService.getScriptCache().remove('MBG_SPPG_MENU_V1');
    } catch (e) {
      // Abaikan jika cache gagal dihapus
    }

    return {
      success: true,
      code: 200,
      message: 'Database MBG SPPG berhasil disusun dan siap digunakan!',
      data: {
        spreadsheetId: ss.getId(),
        spreadsheetUrl: ss.getUrl(),
        createdSheets: createdSheets,
        updatedSheets: existingSheets
      }
    };
  } finally {
    lock.releaseLock();
  }
}
