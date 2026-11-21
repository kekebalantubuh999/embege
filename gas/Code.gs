/**
 * ============================================================================
 * FILE: Code.gs
 * FUNGSI: Entry Point Web App & API Pembaca Menu MBG SPPG (V8 Runtime)
 * ============================================================================
 */

const MENU_CACHE_KEY = 'MBG_SPPG_MENU_V1';
const MENU_CACHE_TTL_SECONDS = 300; // 5 menit

/**
 * Entry Point Web App
 */
function doGet(e) {
  const template = HtmlService.createTemplateFromFile('Index');
  template.route = e && e.parameter && e.parameter.page ? e.parameter.page : 'home';

  return template
    .evaluate()
    .setTitle('MBG° — Portal Menu Harian SPPG')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Helper untuk menyisipkan file HTML modular bila diperlukan
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Validasi & normalisasi nilai Tanggal dari Google Sheets ke string 'YYYY-MM-DD' (EC-04).
 * Mengembalikan null apabila tanggal tidak valid agar baris dapat dilewati tanpa error.
 */
function normalizeSheetDate(rawVal) {
  if (rawVal === null || rawVal === undefined || rawVal === '') {
    return null;
  }

  if (rawVal instanceof Date) {
    if (isNaN(rawVal.getTime())) return null;
    return Utilities.formatDate(rawVal, MBG_TIMEZONE, 'yyyy-MM-dd');
  }

  const str = String(rawVal).trim();
  const match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) {
    return null;
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const checkDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  if (
    checkDate.getUTCFullYear() !== year ||
    checkDate.getUTCMonth() + 1 !== month ||
    checkDate.getUTCDate() !== day
  ) {
    return null;
  }

  const mm = month < 10 ? '0' + month : String(month);
  const dd = day < 10 ? '0' + day : String(day);
  return year + '-' + mm + '-' + dd;
}

/**
 * Mengonversi nilai sel secara aman agar tidak ada objek Date mentah ke google.script.run
 */
function serializeCellValue(val) {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? '' : Utilities.formatDate(val, MBG_TIMEZONE, 'yyyy-MM-dd');
  }
  return String(val).trim();
}

/**
 * Membaca pengaturan SPPG dari sheet Pengaturan_SPPG
 */
function readSppgSettings(ss) {
  const defaults = {
    Nama_SPPG: 'SPPG Unit Terpusat',
    Jam_Distribusi: '09.30 WIB',
    Kontak_Admin: '',
    Wilayah_Layanan: 'Kluster Sekolah Binaan'
  };

  const sheet = ss.getSheetByName('Pengaturan_SPPG');
  if (!sheet) return defaults;

  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return defaults;

  for (let i = 1; i < values.length; i++) {
    const key = serializeCellValue(values[i][0]);
    const val = serializeCellValue(values[i][1]);
    if (key && val) {
      defaults[key] = val;
    }
  }
  return defaults;
}

/**
 * Endpoint publik untuk frontend (dipanggil via google.script.run.getMenuData())
 */
function getMenuData() {
  const cache = CacheService.getScriptCache();
  const serverDate = Utilities.formatDate(new Date(), MBG_TIMEZONE, 'yyyy-MM-dd');

  try {
    const cachedRaw = cache.get(MENU_CACHE_KEY);
    if (cachedRaw) {
      const parsed = JSON.parse(cachedRaw);
      parsed.serverDate = serverDate;
      parsed.fromCache = true;
      return parsed;
    }
  } catch (e) {
    Logger.log('Gagal membaca cache: ' + e.message);
  }

  try {
    const ss = getTargetSpreadsheet();
    let menuSheet = ss.getSheetByName('Menu_MBG');

    if (!menuSheet || !ss.getSheetByName('Pengaturan_SPPG')) {
      setupDatabase();
      menuSheet = ss.getSheetByName('Menu_MBG');
    }

    const rawValues = menuSheet ? menuSheet.getDataRange().getValues() : [];
    const settings = readSppgSettings(ss);
    const warnings = [];
    const menus = [];

    if (rawValues.length > 1) {
      const headers = rawValues[0].map(function (h) {
        return String(h).trim();
      });

      const idxTanggal = headers.indexOf('Tanggal');

      for (let r = 1; r < rawValues.length; r++) {
        const row = rawValues[r];
        const isEmptyRow = row.every(function (cell) {
          return cell === '' || cell === null || cell === undefined;
        });
        if (isEmptyRow) continue;

        const rawDate = idxTanggal >= 0 ? row[idxTanggal] : row[0];
        const normalizedDate = normalizeSheetDate(rawDate);

        if (!normalizedDate) {
          warnings.push('Baris ' + (r + 1) + ' dilewati: format Tanggal tidak valid (' + String(rawDate) + ').');
          continue;
        }

        const item = {};
        headers.forEach(function (header, cIdx) {
          item[header] = header === 'Tanggal' ? normalizedDate : serializeCellValue(row[cIdx]);
        });
        menus.push(item);
      }
    }

    menus.sort(function (a, b) {
      return a.Tanggal < b.Tanggal ? -1 : a.Tanggal > b.Tanggal ? 1 : 0;
    });

    const payload = {
      success: true,
      code: 200,
      message: 'Data menu MBG berhasil dimuat.',
      serverDate: serverDate,
      fromCache: false,
      settings: settings,
      menus: menus,
      warnings: warnings
    };

    try {
      cache.put(MENU_CACHE_KEY, JSON.stringify(payload), MENU_CACHE_TTL_SECONDS);
    } catch (cacheErr) {
      Logger.log('Cache put dilewati: ' + cacheErr.message);
    }

    return payload;
  } catch (err) {
    return {
      success: false,
      code: 500,
      message: 'Gagal memuat data dari Google Sheets: ' + err.message,
      serverDate: serverDate,
      settings: {},
      menus: [],
      warnings: []
    };
  }
}

/**
 * Menghapus cache menu agar perubahan terbaru di Sheet langsung tampil
 */
function clearMenuCache() {
  try {
    CacheService.getScriptCache().remove(MENU_CACHE_KEY);
    return {
      success: true,
      code: 200,
      message: 'Cache Web App berhasil di-reset. Muat ulang halaman web untuk melihat data terbaru.'
    };
  } catch (err) {
    return {
      success: false,
      code: 500,
      message: 'Gagal mereset cache: ' + err.message
    };
  }
}
