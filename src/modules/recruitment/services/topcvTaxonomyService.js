/**
 * topcvTaxonomyService.js - Quản lý Danh mục Nghề & Khung Lọc Nghề 3 Cấp chuẩn TopCV
 * Cấu trúc: NHÓM NGHỀ -> NGHỀ -> VỊ TRÍ CHUYÊN MÔN
 */
const path = require('path');
const fs = require('fs');

class TopcvTaxonomyService {
  constructor() {
    this.taxonomy = [];
    this.flatRoles = [];
    this._loadTaxonomy();
  }

  _loadTaxonomy() {
    try {
      const filePath = path.join(__dirname, '../data/topcvOccupationTaxonomy.json');
      if (fs.existsSync(filePath)) {
        this.taxonomy = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        
        // Tạo bảng phẳng hóa flatRoles để tìm kiếm / ánh xạ nhanh O(1)
        this.flatRoles = [];
        this.taxonomy.forEach(item => {
          const nhom = item.nhomNghe;
          (item.ngheList || []).forEach(n => {
            const nghe = n.nghe;
            (n.viTriList || []).forEach(vt => {
              this.flatRoles.push({
                nhomNghe: nhom,
                nghe: nghe,
                viTri: vt,
                keywords: this._generateKeywords(nhom, nghe, vt)
              });
            });
          });
        });
      }
    } catch (err) {
      console.error('[TopcvTaxonomyService] Lỗi nạp danh mục nghề:', err);
    }
  }

  _generateKeywords(nhom, nghe, viTri) {
    const clean = (str) => str.toLowerCase()
      .replace(/[()\/,-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const parts = [
      clean(viTri),
      clean(nghe),
      clean(nhom)
    ];

    // Tách các từ viết tắt trong ngoặc đơn ví dụ "Business Analyst (Phân tích nghiệp vụ)"
    const matchParen = viTri.match(/\((.*?)\)/);
    if (matchParen) {
      parts.push(clean(matchParen[1]));
    }

    return parts.filter(Boolean);
  }

  /**
   * Lấy toàn bộ cây danh mục nghề 3 cấp
   */
  getTaxonomyTree() {
    return this.taxonomy;
  }

  /**
   * Lấy danh sách 25 Nhóm nghề
   */
  getNhomNgheList() {
    return this.taxonomy.map(t => ({
      nhomNghe: t.nhomNghe,
      totalNghe: (t.ngheList || []).length,
      totalViTri: (t.ngheList || []).reduce((acc, n) => acc + (n.viTriList || []).length, 0)
    }));
  }

  /**
   * Lấy danh sách Nghề theo Nhóm nghề
   */
  getNgheList(nhomNghe) {
    const item = this.taxonomy.find(t => t.nhomNghe === nhomNghe);
    if (!item) return [];
    return (item.ngheList || []).map(n => ({
      nghe: n.nghe,
      totalViTri: (n.viTriList || []).length
    }));
  }

  /**
   * Lấy danh sách Vị trí chuyên môn theo Nghề
   */
  getViTriList(nhomNghe, nghe) {
    const item = this.taxonomy.find(t => t.nhomNghe === nhomNghe);
    if (!item) return [];
    const n = (item.ngheList || []).find(x => x.nghe === nghe);
    if (!n) return [];
    return n.viTriList || [];
  }

  /**
   * Khớp một tin việc làm vào Nhóm nghề / Nghề / Vị trí của TopCV
   * @param {Object} job { rawTitle, rawSkillsText, descriptionSnippet }
   */
  matchJobTaxonomy(job) {
    const titleLower = (job.rawTitle || '').toLowerCase();
    
    // Tìm kiếm trong flatRoles
    for (const r of this.flatRoles) {
      const vtLower = r.viTri.toLowerCase();
      // Nếu title chứa chính xác vị trí chuyên môn
      if (titleLower.includes(vtLower)) {
        return {
          nhomNghe: r.nhomNghe,
          nghe: r.nghe,
          viTri: r.viTri,
          confidence: 0.95
        };
      }

      // Kiểm tra các từ khóa alias
      for (const kw of r.keywords) {
        if (kw.length >= 4 && titleLower.includes(kw)) {
          return {
            nhomNghe: r.nhomNghe,
            nghe: r.nghe,
            viTri: r.viTri,
            confidence: 0.8
          };
        }
      }
    }

    return null;
  }
}

module.exports = new TopcvTaxonomyService();
