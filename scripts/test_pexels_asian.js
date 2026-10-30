const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  const testQueries = ['asian software developer', 'modern office facility architecture', 'asian factory worker'];
  for (const q of testQueries) {
    const url = `https://www.pexels.com/search/${encodeURIComponent(q)}/`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    const titles = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img[src*="images.pexels.com/photos/"]'));
      return imgs.slice(0, 4).map(img => img.alt || 'No alt');
    });
    console.log(`=== Query: ${q} ===`);
    console.log(titles);
  }
  await browser.close();
})();
