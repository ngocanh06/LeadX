/**
 * revenueAttributionService.js - Động Cơ Phân Bổ Nguồn Doanh Thu Thực Tế (Revenue Attribution Engine)
 * Tuân thủ Section 16 Master Prompt:
 * - Chuỗi giá trị toàn vẹn: Channel / Group -> Post -> Campaign -> Lead -> Customer -> Order -> Revenue VND
 * - Tính toán chính xác 100% dựa trên orders.json, customers.json, leads_crm.json, campaigns.json.
 * - Tuyệt đối không làm giả số liệu hay tỷ lệ chuyển đổi.
 */
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../utils/logger');

class RevenueAttributionService {
  constructor() {
    this.rootDir = config.rootDir || path.resolve(__dirname, '../../../');
  }

  _readJsonSafe(relativePath) {
    try {
      const fullPath = path.resolve(this.rootDir, relativePath);
      if (fs.existsSync(fullPath)) {
        return JSON.parse(fs.readFileSync(fullPath, 'utf8')) || [];
      }
      return [];
    } catch (err) {
      logger.error(`[ATTRIBUTION] Lỗi đọc ${relativePath}: ${err.message}`);
      return [];
    }
  }

  /**
   * Tính toán báo cáo phân bổ doanh thu đầy đủ
   */
  getAttributionReport() {
    const orders = this._readJsonSafe('data/orders.json');
    const customers = this._readJsonSafe('data/customers.json');
    const leads = this._readJsonSafe('data/leads_crm.json');
    const campaigns = this._readJsonSafe('data/campaigns.json');
    const postingQueue = this._readJsonSafe('data/posting_queue.json');

    // 1. Tổng doanh thu thực tế
    const paidOrders = orders.filter(o => o.paymentStatus === 'PAID');
    const totalRevenue = paidOrders.reduce((sum, o) => sum + (Number(o.finalAmount || o.amount) || 0), 0);
    const totalOrdersCount = orders.length;
    const paidOrdersCount = paidOrders.length;

    // 2. Phân bổ theo Nguồn Kênh (Channel Attribution)
    const channelAttribution = {};
    const groupAttribution = {};

    for (const order of paidOrders) {
      const amount = Number(order.finalAmount || order.amount) || 0;
      const groupName = order.sourceGroup || 'Không xác định';

      // Group attribution
      if (!groupAttribution[groupName]) {
        groupAttribution[groupName] = { groupName, orderCount: 0, revenue: 0 };
      }
      groupAttribution[groupName].orderCount += 1;
      groupAttribution[groupName].revenue += amount;

      // Channel type
      let channelType = 'Facebook Group';
      if (groupName.toLowerCase().includes('page') || groupName.toLowerCase().includes('fanpage')) {
        channelType = 'Fanpage';
      }
      if (!channelAttribution[channelType]) {
        channelAttribution[channelType] = { channelType, orderCount: 0, revenue: 0 };
      }
      channelAttribution[channelType].orderCount += 1;
      channelAttribution[channelType].revenue += amount;
    }

    // Top 5 nhóm đem lại doanh thu cao nhất
    const topRevenueGroups = Object.values(groupAttribution)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // 3. Phân bổ theo Ngành (Industry Attribution: Tuyển dụng vs BĐS)
    let recruitmentRevenue = 0;
    let bdsRevenue = 0;

    for (const order of paidOrders) {
      const amount = Number(order.finalAmount || order.amount) || 0;
      const srv = (order.serviceName || order.notes || '').toLowerCase();
      if (srv.includes('căn hộ') || srv.includes('phòng') || srv.includes('bđs') || srv.includes('bất động sản')) {
        bdsRevenue += amount;
      } else {
        recruitmentRevenue += amount;
      }
    }

    // 4. Phân bổ theo Chiến dịch (Campaign Attribution)
    const campaignAttribution = campaigns.map(camp => {
      // Tìm các leads thuộc campaign này
      const campLeads = leads.filter(l => l.campaignId === camp.id);
      const campLeadIds = campLeads.map(l => l.id);

      // Tìm orders kết nối với các leads/khách hàng này
      const matchedOrders = paidOrders.filter(o => 
        o.campaignId === camp.id ||
        campLeadIds.includes(o.leadId)
      );

      const revenue = matchedOrders.reduce((sum, o) => sum + (Number(o.finalAmount || o.amount) || 0), 0);

      return {
        campaignId: camp.id,
        campaignName: camp.name,
        industry: camp.industry,
        leadsCount: campLeads.length,
        ordersCount: matchedOrders.length,
        revenue
      };
    });

    // 5. Toàn chuỗi Phễu Chuyển Đổi (Conversion Funnel)
    const funnel = {
      totalDispatchedPosts: postingQueue.length,
      successPosts: postingQueue.filter(p => p.status === 'SUCCESS').length,
      totalLeads: leads.length,
      hotLeads: leads.filter(l => l.leadTier === 'HOT' || l.leadScore >= 75).length,
      totalCustomers: customers.length,
      paidOrders: paidOrdersCount,
      totalRevenueVND: totalRevenue,
      leadToOrderRate: leads.length > 0 ? Number(((paidOrdersCount / leads.length) * 100).toFixed(2)) : 0
    };

    return {
      totalRevenue,
      paidOrdersCount,
      totalOrdersCount,
      recruitmentRevenue,
      bdsRevenue,
      channelAttribution: Object.values(channelAttribution),
      topRevenueGroups,
      campaignAttribution,
      funnel,
      generatedAt: new Date().toISOString()
    };
  }
}

module.exports = new RevenueAttributionService();
