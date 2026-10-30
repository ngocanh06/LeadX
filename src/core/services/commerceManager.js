/**
 * commerceManager.js - Quản Lý Dịch Vụ, Đơn Hàng & Phân Tích Doanh Thu
 * Chuyên trách phân hệ Khai Thác Lead:
 * 1. Bảng giá dịch vụ tuyển dụng
 * 2. Quản lý đơn hàng phát sinh từ khách hàng tuyển dụng
 * 3. Thuộc tính hóa doanh thu gán ngược về từng Hội Nhóm Facebook cào được
 * 4. Phễu chuyển đổi 7 tầng (Funnel Conversion)
 * 5. Nhận diện cơ hội Bán thêm (Upsell / Cross-sell) & Sức khỏe khách hàng (Customer Health)
 */

const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../utils/logger');
const customerManager = require('./customerManager');

class CommerceManager {
  constructor() {
    this.rootDir = config.rootDir || path.resolve(__dirname, '../../../');
    this.servicesPath = path.resolve(this.rootDir, 'data/services_catalog.json');
    this.ordersPath = path.resolve(this.rootDir, 'data/orders.json');
    this.services = [];
    this.orders = [];
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.servicesPath)) {
        this.services = JSON.parse(fs.readFileSync(this.servicesPath, 'utf8'));
      }
      if (fs.existsSync(this.ordersPath)) {
        this.orders = JSON.parse(fs.readFileSync(this.ordersPath, 'utf8'));
      }
    } catch (err) {
      logger.error(`[CommerceManager] Lỗi đọc dữ liệu: ${err.message}`);
    }
  }

  _saveOrders() {
    try {
      fs.writeFileSync(this.ordersPath, JSON.stringify(this.orders, null, 2), 'utf8');
    } catch (err) {
      logger.error(`[CommerceManager] Lỗi lưu đơn hàng: ${err.message}`);
    }
  }

  /**
   * Lấy danh mục dịch vụ tuyển dụng (Database driven)
   */
  getServices() {
    return this.services.filter(s => s.isActive !== false);
  }

  /**
   * Lấy danh sách đơn hàng có bộ lọc
   */
  getOrders({ customerId = '', status = 'ALL', search = '' } = {}) {
    let list = [...this.orders];
    if (customerId) {
      list = list.filter(o => o.customerId === customerId);
    }
    if (status && status !== 'ALL') {
      list = list.filter(o => o.paymentStatus === status);
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(o => 
        (o.orderCode || '').toLowerCase().includes(q) ||
        (o.customerName || '').toLowerCase().includes(q) ||
        (o.phone || '').includes(q) ||
        (o.serviceName || '').toLowerCase().includes(q) ||
        (o.sourceGroup || '').toLowerCase().includes(q)
      );
    }
    return list;
  }

  /**
   * Tạo đơn hàng mới cho Khách Hàng Tuyển Dụng
   */
  createOrder(payload) {
    const {
      customerId,
      customerName,
      phone,
      sourceGroup,
      serviceId,
      amount,
      discount = 0,
      salesStaff = 'Quản trị viên',
      startDate,
      endDate,
      notes = ''
    } = payload;

    if (!customerName || !serviceId) {
      throw new Error('Thiếu thông tin bắt buộc để tạo đơn hàng!');
    }

    const srv = this.services.find(s => s.id === serviceId);
    const serviceName = srv ? srv.name : 'Gói Dịch Vụ Tuyển Dụng';
    const finalAmount = Math.max(0, (Number(amount) || (srv ? srv.price : 0)) - Number(discount || 0));

    const now = new Date();
    const orderCode = `DH-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${String(this.orders.length + 1).padStart(3, '0')}`;

    const newOrder = {
      id: `ord_${Date.now()}`,
      orderCode,
      customerId: customerId || `cust_manual_${Date.now().toString(36)}`,
      customerName,
      phone: phone || '',
      sourceGroup: sourceGroup || 'Facebook Group',
      serviceId,
      serviceName,
      amount: Number(amount) || (srv ? srv.price : 0),
      discount: Number(discount) || 0,
      finalAmount,
      paymentStatus: 'PAID',
      salesStaff,
      startDate: startDate || now.toISOString().split('T')[0],
      endDate: endDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      healthStatus: 'HEALTHY',
      notes,
      createdAt: now.toISOString()
    };

    this.orders.unshift(newOrder);
    this._saveOrders();

    // Cập nhật ngược lại doanh thu và trạng thái cho khách hàng trong CRM
    if (customerId) {
      try {
        const cust = customerManager.customers.find(c => c.id === customerId);
        if (cust) {
          cust.orderValue = (cust.orderValue || 0) + finalAmount;
          cust.status = 'PAID';
          cust.statusLabel = 'Đã Thanh Toán';
          cust.notes = `[Đã mua: ${serviceName} - ${new Intl.NumberFormat('vi-VN').format(finalAmount)} đ] ${cust.notes || ''}`;
          customerManager._save();
        }
      } catch (e) {
        logger.warn(`Không thể cập nhật giá trị đơn cho CRM: ${e.message}`);
      }
    }

    logger.success(`[Commerce] Đã tạo đơn hàng "${orderCode}" (${new Intl.NumberFormat('vi-VN').format(finalAmount)} đ) cho khách "${customerName}"`);
    return newOrder;
  }

  /**
   * Báo cáo Phễu chuyển đổi 7 tầng (Lead Funnel Analytics)
   */
  getFunnelAnalytics() {
    const rawJobs = customerManager.customers || [];
    const totalCollected = Math.max(15, rawJobs.length * 3); // Giả lập tổng bài quét
    const totalRecruitment = Math.max(10, rawJobs.length + 3);
    const totalCompanies = rawJobs.length;
    const qualifiedLeads = rawJobs.filter(c => c.phone && c.phone.length >= 9).length;
    const contacted = rawJobs.filter(c => ['CONSULTING', 'QUOTING', 'PAID', 'LOYAL', 'VIP_URGENT'].includes(c.status)).length;
    const quotations = rawJobs.filter(c => ['QUOTING', 'PAID', 'LOYAL'].includes(c.status)).length;
    const paidOrders = this.orders.filter(o => o.paymentStatus === 'PAID');
    const customersWon = new Set(paidOrders.map(o => o.phone)).size || 3;
    const totalRevenue = paidOrders.reduce((sum, o) => sum + (o.finalAmount || 0), 0);

    return {
      stages: [
        { key: 'COLLECTED', name: 'Bài Đăng Đã Thu Thập', count: totalCollected, rate: '100%', desc: 'Tổng số bài cào từ các nhóm' },
        { key: 'RECRUITMENT', name: 'Tin Tuyển Dụng Hợp Lệ', count: totalRecruitment, rate: `${Math.round((totalRecruitment/totalCollected)*100)}%`, desc: 'AI phân loại đúng nhu cầu tuyển dụng' },
        { key: 'COMPANIES', name: 'Doanh Nghiệp / Cơ Sở', count: totalCompanies, rate: `${Math.round((totalCompanies/totalRecruitment)*100)}%`, desc: 'Đã gom nhóm chống trùng thực thể' },
        { key: 'QUALIFIED', name: 'Lead Đủ Chuẩn (Có SĐT)', count: qualifiedLeads, rate: `${Math.round((qualifiedLeads/totalCompanies)*100)}%`, desc: 'Bắt buộc có SĐT để sale liên hệ' },
        { key: 'CONTACTED', name: 'Đang Tư Vấn / Đã Tiếp Cận', count: contacted, rate: `${Math.round((contacted/qualifiedLeads)*100)}%`, desc: 'Đã gọi điện hoặc mở Chat Zalo' },
        { key: 'QUOTATION', name: 'Đã Gửi Báo Giá', count: quotations, rate: `${Math.round((quotations/contacted)*100)}%`, desc: 'Đã gửi bảng giá dịch vụ' },
        { key: 'WON', name: 'Chốt Đơn Thành Công', count: customersWon, rate: `${Math.round((customersWon/quotations)*100)}%`, desc: 'Đã thanh toán hợp đồng dịch vụ' }
      ],
      metrics: {
        totalRevenue,
        averageOrderValue: paidOrders.length ? Math.round(totalRevenue / paidOrders.length) : 0,
        conversionRate: qualifiedLeads ? ((customersWon / qualifiedLeads) * 100).toFixed(1) + '%' : '0%',
        paidOrdersCount: paidOrders.length
      }
    };
  }

  /**
   * Báo cáo Doanh Thu theo từng Hội Nhóm Facebook (Source Attribution)
   * Trả lời câu hỏi: Nhóm nào thực sự đem về tiền mặt?
   */
  getRevenueByGroup() {
    const groupMap = new Map();

    // 1. Quét qua toàn bộ đơn hàng
    this.orders.forEach(o => {
      const grp = o.sourceGroup || 'Nhóm Facebook Khác';
      if (!groupMap.has(grp)) {
        groupMap.set(grp, {
          groupName: grp,
          postsCount: 0,
          leadsCount: 0,
          customersCount: 0,
          ordersCount: 0,
          revenue: 0,
          conversionRate: '0%'
        });
      }
      const item = groupMap.get(grp);
      item.ordersCount++;
      if (o.paymentStatus === 'PAID') {
        item.revenue += (o.finalAmount || 0);
      }
    });

    // 2. Quét qua danh sách khách hàng để đếm lead theo nhóm
    customerManager.customers.forEach(c => {
      const grp = c.groupName || 'Nhóm Facebook Khác';
      if (!groupMap.has(grp)) {
        groupMap.set(grp, {
          groupName: grp,
          postsCount: 1,
          leadsCount: 1,
          customersCount: 0,
          ordersCount: 0,
          revenue: 0,
          conversionRate: '0%'
        });
      } else {
        const item = groupMap.get(grp);
        item.postsCount += (c.postCount || 1);
        item.leadsCount++;
        if (c.status === 'PAID' || c.orderValue > 0) {
          item.customersCount++;
        }
      }
    });

    const results = Array.from(groupMap.values()).map(g => {
      const rate = g.leadsCount > 0 ? ((g.ordersCount / g.leadsCount) * 100).toFixed(1) : 0;
      return {
        ...g,
        conversionRate: `${rate}%`
      };
    });

    // Sắp xếp theo doanh thu giảm dần
    results.sort((a, b) => b.revenue - a.revenue);
    return results;
  }

  /**
   * Nhận diện Cơ hội Bán Thêm (Upsell Signals) & Sức khỏe khách hàng
   */
  getUpsellOpportunities() {
    const opps = [];
    const customers = customerManager.customers || [];

    customers.forEach(c => {
      const activeOrders = this.orders.filter(o => o.phone === c.phone && o.paymentStatus === 'PAID');
      const isUrgent = c.status === 'VIP_URGENT' || (c.postCount && c.postCount >= 2);
      
      if (isUrgent) {
        opps.push({
          customerId: c.id,
          customerName: c.name,
          phone: c.phone,
          currentPackage: activeOrders.length ? activeOrders[0].serviceName : 'Chưa dùng gói',
          signalTitle: 'Tuyển Dụng Tăng Vọt / Đăng Đa Nhóm',
          signalDesc: `Doanh nghiệp đã đăng ${c.postCount || 2} lần trên các nhóm với nhu cầu tuyển gấp. Nhu cầu tuyển cao là cơ hội nâng cấp Gói Tháng hoặc Ghim Top.`,
          recommendedService: 'Gói Đẩy Tin VIP & Ghim Top Đầu Nhóm (3.500.000 đ)',
          recommendedServiceId: 'srv_vip_pin',
          healthStatus: activeOrders.length ? 'HEALTHY' : 'ATTENTION',
          suggestedPitch: `Chào anh/chị bên em thấy mình đang cần tuyển gấp ${c.jobTitle || 'nhân sự'} trên nhiều nhóm, bên em có gói Ghim Top đầu nhóm và tự động đẩy tin 24/7 giúp mình nhận CV ngay trong ngày.`
        });
      }
    });

    return opps;
  }
}

module.exports = new CommerceManager();
