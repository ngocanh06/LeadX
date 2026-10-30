/**
 * ConnectorFactory.js - Factory khởi tạo Connector theo Platform
 * -------------------------------------------------------------
 * Mở rộng kiến trúc Đa Nguồn (Multi-source):
 * Facebook Groups, Website, Form, Email, CSV, API, Manual.
 */
const FacebookGroupConnector = require('./FacebookGroupConnector');

class ConnectorFactory {
  /**
   * Tạo instance connector phù hợp với source config
   * @param {Object} sourceConfig
   * @returns {LeadSourceConnector}
   */
  static create(sourceConfig) {
    if (!sourceConfig || !sourceConfig.platform) {
      throw new Error('Cấu hình nguồn thiếu thông tin platform.');
    }

    const platform = sourceConfig.platform.toUpperCase();

    switch (platform) {
      case 'FACEBOOK':
      case 'FACEBOOK_GROUP':
      case 'FB_GROUP':
        return new FacebookGroupConnector(sourceConfig);

      default:
        // Mặc định đối với các nhóm Facebook hoặc Generic Connector
        return new FacebookGroupConnector(sourceConfig);
    }
  }
}

module.exports = ConnectorFactory;
