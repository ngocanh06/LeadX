/**
 * similarityUtils.js - Thuật toán tính khoảng cách Levenshtein & Độ tương đồng
 */

/**
 * Tính khoảng cách Levenshtein giữa 2 chuỗi văn bản
 * @param {string} a 
 * @param {string} b 
 * @returns {number}
 */
function getLevenshteinDistance(a, b) {
  const s1 = (a || '').trim().toLowerCase();
  const s2 = (b || '').trim().toLowerCase();

  const m = s1.length;
  const n = s2.length;

  if (m === 0) return n;
  if (n === 0) return m;

  let prevRow = Array.from({ length: n + 1 }, (_, i) => i);
  let currRow = new Array(n + 1);

  for (let i = 1; i <= m; i++) {
    currRow[0] = i;
    const char1 = s1[i - 1];

    for (let j = 1; j <= n; j++) {
      const char2 = s2[j - 1];
      const cost = char1 === char2 ? 0 : 1;

      currRow[j] = Math.min(
        currRow[j - 1] + 1,      // Thao tác Chèn
        prevRow[j] + 1,          // Thao tác Xóa
        prevRow[j - 1] + cost    // Thao tác Thay thế
      );
    }

    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[n];
}

/**
 * Tính tỷ lệ tương đồng chuẩn hóa từ 0.0 (0%) đến 1.0 (100%)
 * @param {string} text1 
 * @param {string} text2 
 * @returns {number}
 */
function calculateSimilarityRatio(text1, text2) {
  if (!text1 || !text2) return 0;
  const maxLen = Math.max(text1.length, text2.length);
  if (maxLen === 0) return 1;

  const distance = getLevenshteinDistance(text1, text2);
  const similarity = 1 - (distance / maxLen);
  return Math.max(0, Math.min(1, similarity));
}

/**
 * Kiểm tra toàn bộ mảng bài viết (All-pairs verification)
 * Đảm bảo không có bất kỳ 2 bài nào có độ tương đồng > maxSimilarityThreshold
 * @param {Array<{pageId: string, content: string}>} variants 
 * @param {number} maxSimilarityThreshold Ngưỡng tối đa cho phép (mặc định 0.70)
 * @returns {{isValid: boolean, conflicts: Array<{idxA: number, idxB: number, pageA: string, pageB: string, similarity: number}>}}
 */
function validateUniqueVariants(variants, maxSimilarityThreshold = 0.70) {
  const conflicts = [];

  for (let i = 0; i < variants.length; i++) {
    for (let j = i + 1; j < variants.length; j++) {
      const similarity = calculateSimilarityRatio(variants[i].content, variants[j].content);
      
      if (similarity > maxSimilarityThreshold) {
        conflicts.push({
          idxA: i,
          pageA: variants[i].pageId || `Page_${i + 1}`,
          idxB: j,
          pageB: variants[j].pageId || `Page_${j + 1}`,
          similarity: Number((similarity * 100).toFixed(2))
        });
      }
    }
  }

  return {
    isValid: conflicts.length === 0,
    conflicts
  };
}

module.exports = {
  getLevenshteinDistance,
  calculateSimilarityRatio,
  validateUniqueVariants
};
