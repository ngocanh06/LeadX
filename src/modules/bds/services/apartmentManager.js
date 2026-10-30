/**
 * apartmentManager.js - Quản Lý Kho Bất Động Sản & Căn Hộ Cho Thuê (LeadX Real Estate Engine)
 * Tích hợp tự động đồng bộ Google Sheets, phân loại Quận/Huyện Đà Nẵng, quản lý tiện ích và sinh nội dung đăng bài chuẩn SEO BĐS.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const logger = require('../../../core/utils/logger');
const config = require('../../../config');

const DEFAULT_BDS_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQYbGiYlGrwpAGOCcJxCemRLMDWIzVgTZHgrB6ZaqlJmnUp2497nE_hMXalbzM2SbYU27JL0YE_q0Rw/pub?output=csv';

class ApartmentManager {
  constructor() {
    const rootDir = config.rootDir || path.resolve(__dirname, '../../../../');
    this.primaryFilePath = path.resolve(rootDir, 'data/bds/apartments.json');
    this.legacyFilePath = path.resolve(rootDir, 'data/apartments.json');
    this.filePath = fs.existsSync(this.primaryFilePath) ? this.primaryFilePath : this.legacyFilePath;

    this.primarySettingsFile = path.resolve(rootDir, 'data/bds/apartment_settings.json');
    this.legacySettingsFile = path.resolve(rootDir, 'data/apartment_settings.json');
    this.settingsFile = fs.existsSync(this.primarySettingsFile) ? this.primarySettingsFile : this.legacySettingsFile;

    this.apartments = [];
    this.sheetUrl = DEFAULT_BDS_SHEET_URL;
    this.loadSettings();
    this._load();

    // Nếu chưa có dữ liệu hoặc chỉ có mock cũ của HCM, tự động đồng bộ từ Google Sheets
    if (this.apartments.length === 0 || (this.apartments.length > 0 && !this.apartments.some(a => (a.city || '').includes('Đà Nẵng')))) {
      this.syncFromGoogleSheet(this.sheetUrl).catch(err => {
        logger.warn(`[ApartmentManager] Khởi tạo đồng bộ Google Sheet thất bại: ${err.message}`);
      });
    }
  }

  loadSettings() {
    try {
      const target = fs.existsSync(this.primarySettingsFile) ? this.primarySettingsFile : this.legacySettingsFile;
      if (fs.existsSync(target)) {
        const data = JSON.parse(fs.readFileSync(target, 'utf8'));
        this.sheetUrl = data.sheetUrl || DEFAULT_BDS_SHEET_URL;
      } else {
        this.sheetUrl = DEFAULT_BDS_SHEET_URL;
      }
    } catch (err) {
      this.sheetUrl = DEFAULT_BDS_SHEET_URL;
    }
  }

  saveSettings() {
    try {
      const payload = JSON.stringify({ sheetUrl: this.sheetUrl }, null, 2);
      [this.primarySettingsFile, this.legacySettingsFile].forEach(f => {
        try {
          const dir = path.dirname(f);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(f, payload, 'utf8');
        } catch (_) {}
      });
    } catch (err) {
      logger.error(`[ApartmentManager] Lỗi lưu settings: ${err.message}`);
    }
  }

  getSheetUrl() {
    return this.sheetUrl;
  }

  setSheetUrl(url) {
    this.sheetUrl = String(url || '').trim() || DEFAULT_BDS_SHEET_URL;
    this.saveSettings();
  }

  _load() {
    try {
      const target = fs.existsSync(this.primaryFilePath) ? this.primaryFilePath : this.legacyFilePath;
      if (fs.existsSync(target)) {
        const raw = fs.readFileSync(target, 'utf8');
        this.apartments = JSON.parse(raw);
        if (!Array.isArray(this.apartments)) this.apartments = [];
      } else {
        this.apartments = [];
      }
    } catch (err) {
      logger.error(`[ApartmentManager] Lỗi tải apartments.json: ${err.message}`);
      this.apartments = [];
    }
  }

  _save() {
    try {
      const payload = JSON.stringify(this.apartments, null, 2);
      [this.primaryFilePath, this.legacyFilePath].forEach(f => {
        try {
          const dir = path.dirname(f);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(f, payload, 'utf8');
        } catch (_) {}
      });
      return true;
    } catch (err) {
      logger.error(`[ApartmentManager] Lỗi lưu apartments.json: ${err.message}`);
      return false;
    }
  }

  /**
   * Helper parse CSV hỗ trợ dấu ngoặc kép và ngắt dòng bên trong
   */
  _parseCSV(text) {
    const lines = [];
    let row = [''];
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      const next = text[i + 1];
      if (c === '"') {
        if (inQuotes && next === '"') {
          row[row.length - 1] += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        row.push('');
      } else if ((c === '\r' || c === '\n') && !inQuotes) {
        if (c === '\r' && next === '\n') i++;
        lines.push(row);
        row = [''];
      } else {
        row[row.length - 1] += c;
      }
    }
    if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
      lines.push(row);
    }
    return lines;
  }

  /**
   * Tải URL với xử lý Redirect 301/302/307
   */
  _fetchUrlContent(url, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
      if (maxRedirects <= 0) return reject(new Error('Vượt quá số lần chuyển hướng Redirect.'));

      const client = url.startsWith('https') ? https : http;
      client.get(url, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let nextUrl = res.headers.location;
          if (!nextUrl.startsWith('http')) {
            const u = new URL(url);
            nextUrl = `${u.origin}${nextUrl}`;
          }
          return resolve(this._fetchUrlContent(nextUrl, maxRedirects - 1));
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`Tải dữ liệu thất bại với mã lỗi HTTP: ${res.statusCode}`));
        }

        let raw = '';
        res.setEncoding('utf8');
        res.on('data', chunk => raw += chunk);
        res.on('end', () => resolve(raw));
      }).on('error', err => reject(err));
    });
  }

  /**
   * Phân loại Quận/Huyện Đà Nẵng dựa trên tiền tố mã hoặc tên đường
   */
  _deduceDistrict(code, location) {
    const c = (code || '').toUpperCase();
    const loc = (location || '').toLowerCase();

    if (c.startsWith('ST') || loc.includes('hà bổng') || loc.includes('nguyễn công trứ') ||
        loc.includes('phước trường') || loc.includes('chính hữu') || loc.includes('dương đình nghệ') ||
        loc.includes('lương thế vinh') || loc.includes('thạch lam') || loc.includes('an đồn') ||
        loc.includes('phạm vấn') || loc.includes('sơn trà')) {
      return 'Sơn Trà';
    }

    if (c.startsWith('HC') || loc.includes('2 tháng 9') || loc.includes('nguyễn súy') || loc.includes('hải châu')) {
      return 'Hải Châu';
    }

    if (loc.includes('hà huy tập') || loc.includes('thanh khê') || loc.includes('điện biên phủ')) {
      return 'Thanh Khê';
    }

    if (c.startsWith('NHS') || loc.includes('nghiêm xuân yêm') || loc.includes('đỗ bí') ||
        loc.includes('lê quang đạo') || loc.includes('bà huyện thanh quan') || loc.includes('an thượng') ||
        loc.includes('ngũ hành sơn')) {
      return 'Ngũ Hành Sơn';
    }

    return 'Hải Châu';
  }

  /**
   * Parse giá tiền từ chuỗi (ví dụ: '4.200.000 ₫' -> 4200000)
   */
  _parsePrice(priceStr) {
    if (typeof priceStr === 'number') return priceStr;
    if (!priceStr) return 0;
    const clean = String(priceStr).replace(/[^\d]/g, '');
    return Number(clean) || 0;
  }

  /**
   * Parse diện tích (ví dụ: '35 m²' -> 35)
   */
  _parseArea(areaStr) {
    if (typeof areaStr === 'number') return areaStr;
    if (!areaStr) return 0;
    const clean = String(areaStr).replace(/[^\d.]/g, '');
    return parseFloat(clean) || 0;
  }

  /**
   * Helper tải dữ liệu nhị phân (Buffer) hỗ trợ chuyển hướng Redirect (Dùng cho file XLSX)
   */
  _fetchBuffer(url, maxRedirects = 5) {
    return new Promise((resolve, reject) => {
      if (maxRedirects <= 0) return reject(new Error('Vượt quá số lần chuyển hướng Redirect.'));

      const client = url.startsWith('https') ? https : http;
      client.get(url, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let nextUrl = res.headers.location;
          if (!nextUrl.startsWith('http')) {
            const u = new URL(url);
            nextUrl = `${u.origin}${nextUrl}`;
          }
          return resolve(this._fetchBuffer(nextUrl, maxRedirects - 1));
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`Tải dữ liệu thất bại với mã lỗi HTTP: ${res.statusCode}`));
        }

        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', err => reject(err));
    });
  }

  /**
   * Bóc tách danh sách file ID ảnh thực tế từ mã nguồn HTML thư mục Google Drive công khai
   */
  _extractDriveFileIds(html) {
    const ids = [];
    if (!html) return ids;

    // Cách 1: data-id của hàng dữ liệu bảng Drive
    const regex1 = /data-id=["']([a-zA-Z0-9_-]{25,})["']/g;
    let match;
    while ((match = regex1.exec(html)) !== null) {
      if (!ids.includes(match[1])) ids.push(match[1]);
    }

    // Cách 2: Token ID ảnh nằm trong payload JSON của Google Drive
    if (ids.length === 0) {
      const regex2 = /\["([a-zA-Z0-9_-]{28,35})",\["image\/(jpeg|png|webp)"/g;
      while ((match = regex2.exec(html)) !== null) {
        if (!ids.includes(match[1])) ids.push(match[1]);
      }
    }

    // Cách 3: Link trực tiếp /file/d/
    if (ids.length === 0) {
      const regex3 = /https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{25,})/g;
      while ((match = regex3.exec(html)) !== null) {
        if (!ids.includes(match[1])) ids.push(match[1]);
      }
    }

    // Cách 4: Link thumbnail CDN googleusercontent
    if (ids.length === 0) {
      const regex4 = /https:\/\/lh[0-9]\.googleusercontent\.com\/(?:d|u\/[0-9]\/d|proxy)\/([a-zA-Z0-9_-]{25,})/g;
      while ((match = regex4.exec(html)) !== null) {
        if (!ids.includes(match[1])) ids.push(match[1]);
      }
    }

    return ids;
  }

  /**
   * Quét và trích xuất danh sách link ảnh trực tiếp từ thư mục Google Drive, tự động lưu cache cục bộ
   */
  async _fetchDriveFolderImages(driveUrl) {
    if (!driveUrl || !driveUrl.includes('drive.google.com')) return [];

    try {
      const html = await this._fetchUrlContent(driveUrl);
      const fileIds = this._extractDriveFileIds(html);
      if (fileIds && fileIds.length > 0) {
        const rootDir = config.rootDir || path.resolve(__dirname, '../../../../');
        const outDir = path.resolve(rootDir, 'data/images/apartments');
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        // Tải ảnh về lưu cục bộ
        for (const id of fileIds) {
          const dest = path.join(outDir, `${id}.jpg`);
          if (!fs.existsSync(dest) || fs.statSync(dest).size < 1000) {
            this._fetchBuffer(`https://lh3.googleusercontent.com/d/${id}`)
              .then(buf => fs.writeFileSync(dest, buf))
              .catch(() => {});
          }
        }

        return fileIds.map(id => `/uploads/apartments/${id}.jpg`);
      }
    } catch (err) {
      logger.warn(`[ApartmentManager] Không thể quét ảnh từ link Drive "${driveUrl}": ${err.message}`);
    }

    return [];
  }

  /**
   * Chuẩn hóa URL Google Sheets sang định dạng tải XLSX trực tiếp
   */
  _normalizeXlsxUrl(url) {
    let u = String(url || '').trim();
    if (!u) return DEFAULT_BDS_SHEET_URL;

    // Nếu là link công khai web pub
    if (u.includes('/pub')) {
      if (u.includes('output=')) {
        return u.replace(/output=[a-zA-Z0-9_-]+/, 'output=xlsx');
      }
      return u + (u.includes('?') ? '&' : '?') + 'output=xlsx';
    }

    // Nếu là link chỉnh sửa docs.google.com/spreadsheets/d/{KEY}/edit
    const match = u.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (match) {
      const sheetId = match[1];
      return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
    }

    return u;
  }

  /**
   * Đồng bộ bảng hàng Căn hộ từ Google Sheets XLSX & Tự động bóc tách ảnh thực tế từ Google Drive
   */
  async syncFromGoogleSheet(url = null) {
    const rawUrl = url || this.sheetUrl || DEFAULT_BDS_SHEET_URL;
    const xlsxUrl = this._normalizeXlsxUrl(rawUrl);
    logger.info(`[ApartmentManager] Bắt đầu đồng bộ bảng hàng BĐS & ảnh thực tế từ: ${xlsxUrl}`);

    const xlsx = require('xlsx');
    const xlsxBuf = await this._fetchBuffer(xlsxUrl);
    const workbook = xlsx.read(xlsxBuf, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      throw new Error('Không tìm thấy trang tính (Sheet) hợp lệ trong file Excel.');
    }

    // Xác định phạm vi dòng từ range của sheet
    const range = xlsx.utils.decode_range(sheet['!ref'] || 'A1:Z100');

    // Tìm dòng tiêu đề chứa 'Mã căn'
    let headerRow = -1;
    for (let r = range.s.r; r <= Math.min(range.e.r, 20); r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[xlsx.utils.encode_cell({ r, c })];
        if (cell && cell.v && String(cell.v).toLowerCase().includes('mã căn')) {
          headerRow = r;
          break;
        }
      }
      if (headerRow !== -1) break;
    }

    if (headerRow === -1) {
      throw new Error('Không tìm thấy dòng tiêu đề "Mã căn" trong bảng tính Google Sheets.');
    }

    let addedCount = 0;
    let updatedCount = 0;
    let totalImagesSynced = 0;

    for (let r = headerRow + 1; r <= range.e.r; r++) {
      const cellCode = sheet[xlsx.utils.encode_cell({ r, c: 0 })]; // Col A: Mã căn
      const code = cellCode && cellCode.v ? String(cellCode.v).trim() : '';
      if (!code) continue;

      const cellType = sheet[xlsx.utils.encode_cell({ r, c: 1 })]; // Col B: Loại phòng
      const cellLoc = sheet[xlsx.utils.encode_cell({ r, c: 2 })]; // Col C: Vị trí
      const cellArea = sheet[xlsx.utils.encode_cell({ r, c: 3 })]; // Col D: Diện tích
      const cellPrice = sheet[xlsx.utils.encode_cell({ r, c: 4 })]; // Col E: Giá
      const cellElec = sheet[xlsx.utils.encode_cell({ r, c: 5 })]; // Col F: Điện
      const cellWater = sheet[xlsx.utils.encode_cell({ r, c: 6 })]; // Col G: Nước
      const cellFee = sheet[xlsx.utils.encode_cell({ r, c: 7 })]; // Col H: Phí DV
      const cellFurn = sheet[xlsx.utils.encode_cell({ r, c: 8 })]; // Col I: Nội thất
      const cellAmen = sheet[xlsx.utils.encode_cell({ r, c: 9 })]; // Col J: Tiện ích
      const cellTenant = sheet[xlsx.utils.encode_cell({ r, c: 10 })]; // Col K: Khách
      const cellStatus = sheet[xlsx.utils.encode_cell({ r, c: 11 })]; // Col L: Trạng thái
      const cellNote = sheet[xlsx.utils.encode_cell({ r, c: 12 })]; // Col M: Ghi chú
      const cellLink = sheet[xlsx.utils.encode_cell({ r, c: 13 })]; // Col N: Link Drive

      const roomType = cellType && cellType.v ? String(cellType.v).trim() : 'Studio';
      const location = cellLoc && cellLoc.v ? String(cellLoc.v).trim() : '';
      const area = this._parseArea(cellArea ? cellArea.v : 0);
      const price = this._parsePrice(cellPrice ? cellPrice.v : 0);
      const electricity = cellElec && cellElec.v ? String(cellElec.v).trim() : '4k/chữ';
      const water = cellWater && cellWater.v ? String(cellWater.v).trim() : '150k';
      const serviceFee = cellFee && cellFee.v ? String(cellFee.v).trim() : 'Theo tòa nhà';
      const furniture = cellFurn && cellFurn.v ? String(cellFurn.v).trim() : 'Full nội thất';
      const extraAmenities = cellAmen && cellAmen.v ? String(cellAmen.v).trim() : 'Máy giặt, điều hòa, tủ lạnh';
      const targetTenant = cellTenant && cellTenant.v ? String(cellTenant.v).trim() : 'Tất cả khách hàng / Khách nước ngoài';
      const rawStatus = cellStatus && cellStatus.v ? String(cellStatus.v).trim() : 'Trống sẵn';
      const note = cellNote && cellNote.v ? String(cellNote.v).trim() : '';

      // Trích xuất link Google Drive từ công thức =HYPERLINK("...", ...) hoặc hyperlink object hoặc plain text
      let driveLink = '';
      if (cellLink) {
        if (cellLink.f) {
          const m = cellLink.f.match(/https:\/\/drive\.google\.com\/[^"]+/);
          if (m) driveLink = m[0];
        } else if (cellLink.l && cellLink.l.Target) {
          driveLink = cellLink.l.Target;
        } else if (typeof cellLink.v === 'string' && cellLink.v.includes('drive.google.com')) {
          const m = cellLink.v.match(/https:\/\/drive\.google\.com\/[^\s"')]+/);
          if (m) driveLink = m[0];
        }
      }

      const district = this._deduceDistrict(code, location);

      // Trạng thái
      let status = 'AVAILABLE';
      if (rawStatus.toLowerCase().includes('đã thuê') || rawStatus.toLowerCase().includes('hết')) {
        status = 'RENTED';
      } else if (rawStatus.toLowerCase().includes('cọc') || rawStatus.toLowerCase().includes('giữ')) {
        status = 'RESERVED';
      }

      const title = `Cho thuê ${roomType} ${location}, Q. ${district} - ${code} ${note ? `(${note})` : ''}`.trim();
      const aptId = `apt_sheet_${code.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
      const existingIdx = this.apartments.findIndex(a => a.projectCode === code || a.id === aptId);

      const features = extraAmenities.split(',').map(s => s.trim()).filter(Boolean);
      if (features.length === 0) {
        features.push('Thang máy', 'Máy giặt riêng', 'Khóa vân tay', 'An ninh 24/7');
      }

      // Quét ảnh thực tế từ link Google Drive
      let images = [];
      if (driveLink) {
        images = await this._fetchDriveFolderImages(driveLink);
        if (images.length > 0) {
          totalImagesSynced += images.length;
        }
      }

      // Nếu thư mục Drive rỗng hoặc chưa quét được, giữ ảnh thực tế cũ nếu có, hoặc để mảng rỗng (tuyệt đối không dùng ảnh mẫu ngẫu nhiên)
      if (images.length === 0 && existingIdx !== -1 && Array.isArray(this.apartments[existingIdx].images)) {
        const existingImages = this.apartments[existingIdx].images.filter(img => img.includes('googleusercontent.com') || img.includes('/uploads/apartments/'));
        if (existingImages.length > 0) {
          images = existingImages;
        }
      }

      const aptData = {
        id: aptId,
        projectCode: code,
        title,
        city: 'Đà Nẵng',
        district,
        project: location,
        address: `${location}, Q. ${district}, TP. Đà Nẵng`,
        roomType: roomType.includes('Studio') ? 'Studio' : (roomType.includes('2PN') ? '2PN' : (roomType.includes('3PN') ? '3PN' : '1PN')),
        area,
        price,
        deposit: price > 10000000 ? '2 tháng' : '1 tháng',
        fees: {
          electricity,
          water,
          management: serviceFee || 'Đã bao gồm',
          parking: 'Miễn phí / Theo quy định tòa nhà'
        },
        furnitureStatus: furniture,
        features,
        targetTenant,
        note,
        driveLink,
        images,
        hasRealPhotos: images.length > 0,
        contact: {
          agentName: 'Ban Quản Lý / Chuyên Viên BĐS Đà Nẵng',
          phone: '0905123456',
          zalo: '0905123456'
        },
        status,
        syncedAt: new Date().toISOString()
      };

      if (existingIdx !== -1) {
        this.apartments[existingIdx] = {
          ...this.apartments[existingIdx],
          ...aptData,
          postCount: this.apartments[existingIdx].postCount || 0,
          lastPostedAt: this.apartments[existingIdx].lastPostedAt || null
        };
        updatedCount++;
      } else {
        this.apartments.push({
          ...aptData,
          postCount: 0,
          lastPostedAt: null,
          createdAt: new Date().toISOString()
        });
        addedCount++;
      }
    }

    this.setSheetUrl(rawUrl);
    this._save();

    logger.success(`[ApartmentManager] Đồng bộ thành công: ${addedCount + updatedCount} căn hộ (${totalImagesSynced} ảnh thực tế Google Drive).`);
    return {
      success: true,
      total: this.apartments.length,
      syncedRows: addedCount + updatedCount,
      totalImagesSynced,
      addedCount,
      updatedCount
    };
  }

  getAll(filters = {}) {
    this._load();
    let list = [...this.apartments];

    if (filters.city && filters.city !== 'ALL') {
      list = list.filter(a => (a.city || '').toLowerCase().includes(filters.city.toLowerCase()));
    }

    if (filters.district && filters.district !== 'ALL') {
      list = list.filter(a => (a.district || '').toLowerCase().includes(filters.district.toLowerCase()));
    }

    if (filters.roomType && filters.roomType !== 'ALL') {
      list = list.filter(a => a.roomType === filters.roomType);
    }

    if (filters.status && filters.status !== 'ALL') {
      list = list.filter(a => a.status === filters.status);
    }

    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(a =>
        (a.title || '').toLowerCase().includes(q) ||
        (a.project || '').toLowerCase().includes(q) ||
        (a.address || '').toLowerCase().includes(q) ||
        (a.projectCode || '').toLowerCase().includes(q) ||
        (a.note || '').toLowerCase().includes(q) ||
        (a.contact?.agentName || '').toLowerCase().includes(q) ||
        (a.contact?.phone || '').includes(q)
      );
    }

    if (filters.minPrice) {
      list = list.filter(a => a.price >= Number(filters.minPrice));
    }

    if (filters.maxPrice) {
      list = list.filter(a => a.price <= Number(filters.maxPrice));
    }

    return list;
  }

  getById(id) {
    return this.apartments.find(a => a.id === id || a.projectCode === id) || null;
  }

  add(data) {
    if (!data.title || !data.title.trim()) {
      throw new Error('Vui lòng nhập tiêu đề bài đăng căn hộ.');
    }
    if (!data.district || !data.district.trim()) {
      throw new Error('Vui lòng chọn hoặc nhập Quận/Huyện.');
    }

    const newApt = {
      id: `apt_${Date.now()}`,
      projectCode: data.projectCode ? data.projectCode.trim() : `APT-${Math.floor(1000 + Math.random() * 9000)}`,
      title: data.title.trim(),
      city: data.city || 'Đà Nẵng',
      district: data.district.trim(),
      project: data.project ? data.project.trim() : '',
      address: data.address ? data.address.trim() : '',
      roomType: data.roomType || 'Studio',
      area: Number(data.area) || 0,
      price: Number(data.price) || 0,
      deposit: data.deposit || '1 tháng',
      fees: data.fees || {
        electricity: 'Giá nhà nước',
        water: 'Giá nhà nước',
        management: 'Thỏa thuận',
        parking: 'Theo tòa nhà'
      },
      furnitureStatus: data.furnitureStatus || 'Đầy đủ nội thất',
      features: Array.isArray(data.features) ? data.features : (data.features ? data.features.split(',').map(s => s.trim()) : []),
      images: Array.isArray(data.images) ? data.images.filter(Boolean) : [],
      driveLink: data.driveLink || '',
      note: data.note || '',
      contact: {
        agentName: data.contact?.agentName || 'Chính chủ / Môi giới BĐS',
        phone: data.contact?.phone || '0905123456',
        zalo: data.contact?.zalo || data.contact?.phone || '0905123456'
      },
      status: data.status || 'AVAILABLE',
      postCount: 0,
      lastPostedAt: null,
      createdAt: new Date().toISOString()
    };

    this.apartments.unshift(newApt);
    this._save();
    return newApt;
  }

  update(id, data) {
    const idx = this.apartments.findIndex(a => a.id === id || a.projectCode === id);
    if (idx === -1) {
      throw new Error(`Không tìm thấy căn hộ có ID "${id}".`);
    }

    const current = this.apartments[idx];
    const updated = {
      ...current,
      ...data,
      fees: {
        ...current.fees,
        ...(data.fees || {})
      },
      contact: {
        ...current.contact,
        ...(data.contact || {})
      },
      features: Array.isArray(data.features)
        ? data.features
        : (typeof data.features === 'string' ? data.features.split(',').map(s => s.trim()) : current.features),
      images: Array.isArray(data.images) ? data.images : current.images,
      updatedAt: new Date().toISOString()
    };

    this.apartments[idx] = updated;
    this._save();
    return updated;
  }

  delete(id) {
    const idx = this.apartments.findIndex(a => a.id === id || a.projectCode === id);
    if (idx === -1) return false;
    this.apartments.splice(idx, 1);
    this._save();
    return true;
  }

  recordPost(id) {
    const apt = this.getById(id);
    if (apt) {
      apt.postCount = (apt.postCount || 0) + 1;
      apt.lastPostedAt = new Date().toISOString();
      this._save();
    }
  }

  getStats() {
    const total = this.apartments.length;
    const available = this.apartments.filter(a => a.status === 'AVAILABLE').length;
    const rented = this.apartments.filter(a => a.status === 'RENTED').length;
    const reserved = this.apartments.filter(a => a.status === 'RESERVED').length;

    const roomTypeStats = {};
    const districtStats = {};

    for (const a of this.apartments) {
      const rt = a.roomType || 'Khác';
      roomTypeStats[rt] = (roomTypeStats[rt] || 0) + 1;

      const dist = a.district || 'Khác';
      districtStats[dist] = (districtStats[dist] || 0) + 1;
    }

    return {
      total,
      available,
      rented,
      reserved,
      roomTypeStats,
      districtStats
    };
  }

  generatePostTemplate(id) {
    const apt = this.getById(id);
    if (!apt) return '';

    const priceText = apt.price >= 1000000
      ? `${(apt.price / 1000000).toLocaleString('vi-VN')} Triệu/tháng`
      : `${apt.price.toLocaleString('vi-VN')} đ/tháng`;

    const featuresText = (apt.features && apt.features.length > 0)
      ? apt.features.map(f => `  ✨ ${f}`).join('\n')
      : '  ✨ Đầy đủ tiện ích cao cấp, thang máy, máy giặt, an ninh 24/7';

    return `🔥 [CHO THUÊ CĂN HỘ ĐÀ NẴNG] ${apt.title}
Mã căn: ${apt.projectCode} ${apt.note ? `| Ghi chú: ${apt.note}` : ''}

📍 Vị trí: ${apt.address || apt.project + ', Quận ' + apt.district + ', Đà Nẵng'}
📐 Diện tích: ${apt.area ? apt.area + ' m²' : 'Rộng rãi thoáng mát'} | Thiết kế: ${apt.roomType}
💰 Giá thuê: ${priceText} (Cọc: ${apt.deposit || '1-2 tháng'})
🛋️ Hiện trạng: ${apt.furnitureStatus || 'Full nội thất (máy lạnh, bàn ăn, tivi, tủ lạnh, giường đệm)'}

✨ Tiện ích & dịch vụ:
${featuresText}

⚡ Chi phí dịch vụ:
  - Điện: ${apt.fees?.electricity || '4k/chữ'}
  - Nước: ${apt.fees?.water || '100k - 150k/người'}
  - Dịch vụ / Quản lý: ${apt.fees?.management || 'Đã bao gồm'}
  - Xe máy: ${apt.fees?.parking || 'Miễn phí'}

👥 Đối tượng phù hợp: ${apt.targetTenant || 'Người đi làm, gia đình trẻ, chuyên gia & người nước ngoài'}
📞 Liên hệ xem nhà 24/7 (Zalo/Call): ${apt.contact?.phone || '0905123456'} (${apt.contact?.agentName || 'Quản Lý BĐS'})
👇 Xem thêm ảnh thực tế & video chi tiết căn dưới phần bình luận!

#ChoThueCanHo #CanHoDaNang #BatDongSanDaNang #StudioDaNang #CanHoSonTra #CanHoNguHanhSon #ThueNhaDaNang`;
  }
}

module.exports = new ApartmentManager();
