/**
 * groupScraper.js - Tự động quét & cào Hội Nhóm Facebook theo từ khóa / tỉnh thành
 */
const browserController = require('../../../core/automation/browserController');
const logger = require('../../../core/utils/logger');

class GroupScraper {
  constructor() {
    this.isScraping = false;
    this.progress = {
      keyword: '',
      totalFound: 0,
      status: 'IDLE', // IDLE | RUNNING | COMPLETED | ERROR
      message: 'Sẵn sàng'
    };
    this.results = [];
    this.logs = [];
  }

  _log(msg, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('vi-VN');
    this.logs.push({ timestamp, message: msg, type });
    if (this.logs.length > 300) this.logs.shift();

    if (type === 'error') logger.error(msg);
    else if (type === 'success') logger.success(msg);
    else logger.info(msg);
  }

  getStatus() {
    return {
      isScraping: this.isScraping,
      progress: this.progress,
      resultsCount: this.results.length,
      results: this.results,
      logs: this.logs.slice(-30)
    };
  }

  /**
   * Chuyển đổi chuỗi thành viên "45K thành viên", "75 nghìn thành viên", "1.2M members" thành số nguyên
   */
  _parseMemberCount(str) {
    if (!str) return 0;
    const clean = str.toLowerCase().replace(/,/g, '.');
    
    // 1.2M, 1.5 triệu, 1tr
    const mMatch = clean.match(/([\d.]+)\s*(?:m|triệu|trieu|tr)\b/);
    if (mMatch) return Math.round(parseFloat(mMatch[1]) * 1000000);
    
    // 45K, 75 nghìn, 50 ngàn
    const kMatch = clean.match(/([\d.]+)\s*(?:k|nghìn|nghin|ngàn|ngan)\b/);
    if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);
    
    // 51.234 thành viên, 51,234 members
    const fullMatch = clean.match(/([\d.]+)\s*(?:thành viên|members|member)/);
    if (fullMatch) {
      const val = parseFloat(fullMatch[1].replace(/\./g, ''));
      return isNaN(val) ? 0 : val;
    }

    const numMatch = clean.match(/([\d.]+)/);
    if (numMatch) {
      const val = parseFloat(numMatch[1].replace(/\./g, ''));
      return isNaN(val) ? 0 : val;
    }
    return 0;
  }

  /**
   * Bắt đầu quét nhóm Facebook theo từ khóa
   */
  async scrapeGroups({ keyword, province = '', minMembers = 0, privacyFilter = 'ALL', maxResults = 30 } = {}) {
    if (this.isScraping) {
      throw new Error('Hệ thống đang thực hiện một tiến trình quét nhóm khác!');
    }

    this.isScraping = true;
    this.results = [];
    this.logs = [];
    this.progress = {
      keyword,
      totalFound: 0,
      status: 'RUNNING',
      message: `Đang kết nối Facebook để tìm kiếm nhóm "${keyword}"...`
    };

    this._log(`[BẮT ĐẦU CÀO NHÓM] Từ khóa: "${keyword}" | Tỉnh/thành: "${province || 'Toàn quốc'}" | Tối thiểu: ${minMembers} TV`);

    let page = null;
    try {
      // Sử dụng Tab chuyên dụng riêng để không xung đột với luồng Auto-Join hoặc Auto-Post
      page = await browserController.newDedicatedPage();
      const searchUrl = `https://www.facebook.com/search/groups/?q=${encodeURIComponent(keyword)}`;
      this._log(`Đang điều hướng đến trang tìm kiếm: ${searchUrl}`);

      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      
      // Chờ các thẻ kết quả xuất hiện trên giao diện
      await page.waitForFunction(() => {
        const text = document.body ? document.body.innerText : '';
        return document.querySelectorAll('a[href*="/groups/"]').length > 2 || 
               text.includes('thành viên') || 
               text.includes('Kết quả tìm kiếm');
      }, { timeout: 15000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 2500));

      const foundGroupsMap = new Map();
      let scrolls = 0;
      const maxScrolls = Math.max(6, Math.ceil(maxResults / 3));

      while (scrolls < maxScrolls && foundGroupsMap.size < maxResults) {
        scrolls++;
        this._log(`[Cuộn trang lần ${scrolls}/${maxScrolls}] Đang quét các thẻ nhóm hiển thị...`);

        // Trích xuất các thẻ nhóm trong DOM
        const rawGroups = await page.evaluate(() => {
          const items = [];
          // Ưu tiên tìm trong vùng nội dung kết quả chính (role="main") để tránh quét trúng menu chuông thông báo hoặc sidebar
          const mainArea = document.querySelector('div[role="main"]') || document.body;
          const links = Array.from(mainArea.querySelectorAll('a[href*="/groups/"]'));

          for (const link of links) {
            const href = link.href || '';
            // Bỏ qua link bài viết, hashtag, tab nội bộ, và LINK THÔNG BÁO NOTIFICATION
            if (
              href.includes('/posts/') || 
              href.includes('/user/') || 
              href.includes('/permalink/') || 
              href.includes('/hashtag/') ||
              href.includes('notif_id=') ||
              href.includes('notif_t=') ||
              href.includes('ref=notif')
            ) continue;

            const linkText = (link.innerText || '').trim();
            // Bỏ qua nếu là thẻ thông báo duyệt nhóm của Facebook ("Chưa đọc Chào mừng bạn đến với...")
            if (
              linkText.toLowerCase().startsWith('chưa đọc') ||
              linkText.toLowerCase().includes('chào mừng bạn đến với')
            ) continue;
            
            const match = href.match(/https:\/\/(www\.)?facebook\.com\/groups\/([^\/?#]+)/);
            if (!match) continue;

            const groupSlug = match[2];
            if (!groupSlug || ['feed', 'discover', 'joins', 'create', 'notifications', 'search'].includes(groupSlug)) continue;

            const cleanUrl = `https://www.facebook.com/groups/${groupSlug}/`;
            
            // Tìm container bao quanh thẻ nhóm chính xác (không vượt quá sang card khác)
            let container = link.closest('div[role="article"]') || link.closest('div[role="listitem"]');
            if (!container) {
              let p = link;
              for (let i = 0; i < 8; i++) {
                if (!p || p === document.body) break;
                if (p.querySelectorAll('a[href*="/groups/"]').length > 1 && i > 0) {
                  break;
                }
                const text = p.innerText || '';
                if (text.includes('thành viên') || text.includes('members') || text.includes('Tham gia') || text.includes('Đã tham gia')) {
                  container = p;
                  break;
                }
                p = p.parentElement;
              }
            }
            if (!container) {
              container = link.parentElement?.parentElement?.parentElement || link;
            }
            
            const cardText = container ? (container.innerText || '') : (link.innerText || '');
            const cardLines = cardText.split('\n').map(l => l.trim()).filter(Boolean);

            // Tên nhóm: Ưu tiên text của link, nếu trống lấy dòng tiêu đề từ thẻ
            let name = link.innerText.trim();
            if (!name || name.length < 3) {
              name = cardLines.find(l => l.length > 2 && 
                !l.includes('thành viên') && 
                !l.includes('members') && 
                !l.toLowerCase().includes('tham gia') && 
                !l.toLowerCase().includes('công khai') && 
                !l.toLowerCase().includes('riêng tư') &&
                !l.includes('người bạn')
              ) || groupSlug;
            }

            // Loại bỏ hoàn toàn nếu lọt thông báo duyệt nhóm của Facebook
            if (name.toLowerCase().startsWith('chưa đọc') || name.toLowerCase().includes('chào mừng bạn đến với')) {
              continue;
            }

            // Tìm thông tin thành viên và quyền riêng tư
            let membersStr = '';
            let privacy = 'UNKNOWN';
            let activity = '';

            for (const line of cardLines) {
              const lower = line.toLowerCase();
              if (lower.includes('thành viên') || lower.includes('members') || lower.includes('member') || lower.includes('nghìn') || lower.includes('ngàn')) {
                if (!membersStr || lower.includes('thành viên')) {
                  membersStr = line;
                }
                if (lower.includes('công khai') || lower.includes('public')) privacy = 'PUBLIC';
                else if (lower.includes('riêng tư') || lower.includes('private')) privacy = 'PRIVATE';
              }
              if (lower.includes('bài viết/ngày') || lower.includes('posts a day') || lower.includes('bài viết một ngày') || lower.includes('bài viết/tuần')) {
                activity = line;
              }
            }

            // Kiểm tra trạng thái đã tham gia chưa từ các nút hành động trong card
            let isJoined = false;
            if (container) {
              const buttons = Array.from(container.querySelectorAll('div[role="button"], button, a[role="button"]'));
              isJoined = buttons.some(b => {
                const txt = (b.innerText || '').toLowerCase().trim();
                const aria = (b.getAttribute('aria-label') || '').toLowerCase().trim();
                return txt === 'đã tham gia' || txt === 'joined' || aria === 'đã tham gia' || aria === 'joined';
              });
            }

            items.push({
              slug: groupSlug,
              name: name.replace(/\n/g, ' ').substring(0, 100),
              url: cleanUrl,
              rawText: cardLines.slice(0, 5).join(' • '),
              membersStr,
              privacy,
              activity,
              isJoined
            });
          }

          return items;
        });

        // Lọc và bổ sung vào Map để không trùng lặp
        for (const rg of rawGroups) {
          if (!foundGroupsMap.has(rg.url)) {
            const memberCount = this._parseMemberCount(rg.membersStr);

            // Kiểm tra điều kiện lọc số lượng thành viên
            if (minMembers > 0 && memberCount > 0 && memberCount < minMembers) {
              continue;
            }
            if (privacyFilter === 'PUBLIC' && rg.privacy === 'PRIVATE') continue;
            if (privacyFilter === 'PRIVATE' && rg.privacy === 'PUBLIC') continue;

            const groupItem = {
              id: `scrape_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
              name: rg.name,
              url: rg.url,
              province: province || 'Toàn quốc',
              members: rg.membersStr || `${Math.round(memberCount / 1000)}K TV`,
              membersCount: memberCount,
              privacy: rg.privacy === 'PUBLIC' ? 'Công khai' : (rg.privacy === 'PRIVATE' ? 'Riêng tư' : 'Nhóm FB'),
              activity: rg.activity || 'Hoạt động đều',
              isJoined: rg.isJoined,
              selected: true // Mặc định tích chọn để nạp
            };

            foundGroupsMap.set(rg.url, groupItem);
            this._log(`  + Đã tìm thấy: "${groupItem.name}" (${groupItem.members})`);

            if (foundGroupsMap.size >= maxResults) break;
          }
        }

        this.progress.totalFound = foundGroupsMap.size;
        this.results = Array.from(foundGroupsMap.values());

        // Cuộn xuống để nạp thêm kết quả
        await page.evaluate(() => window.scrollBy(0, 1200));
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
      }

      this._log(`[HOÀN TẤT CÀO NHÓM] Đã trích xuất thành công ${this.results.length} hội nhóm phù hợp tiêu chí!`, 'success');
      this.progress.status = 'COMPLETED';
      this.progress.message = `Hoàn tất! Tìm được ${this.results.length} nhóm.`;
    } catch (err) {
      this._log(`[LỖI CÀO NHÓM] ${err.message}`, 'error');
      this.progress.status = 'ERROR';
      this.progress.message = `Lỗi: ${err.message}`;
    } finally {
      if (page && !page.isClosed()) {
        await page.close().catch(() => {});
      }
      this.isScraping = false;
    }

    return this.results;
  }
}

module.exports = new GroupScraper();
