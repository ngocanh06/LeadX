const bannerGenerator = require('../src/modules/recruitment/services/bannerGeneratorService');

async function testAllTemplates() {
  const sampleJobs = [
    { title: 'Nhân Viên Giao Hàng Shipper Xe Máy', company: 'Giao Hàng Nhanh Express', salary: '9 - 15 Triệu', location: 'Hà Nội', category: 'Kho Vận & Giao Hàng' },
    { title: 'Barista Pha Chế Cà Phê Chuyên Nghiệp', company: 'The Coffee House', salary: '7 - 10 Triệu', location: 'TP. Hồ Chí Minh', category: 'F&B & Nhà Hàng' },
    { title: 'Lập Trình Viên Fullstack Node.js / React', company: 'FPT Software', salary: '25 - 45 Triệu', location: 'Đà Nẵng', category: 'Công Nghệ Thông Tin' },
    { title: 'Kỹ Sư Giám Sát An Toàn Công Trình', company: 'Coteccons Group', salary: '15 - 25 Triệu', location: 'Bình Dương', category: 'Kỹ Thuật Xây Dựng' }
  ];

  console.log('Testing 4 sample posters with different templates...');
  for (let i = 0; i < sampleJobs.length; i++) {
    const job = sampleJobs[i];
    const res = await bannerGenerator.generateJobPoster(job, { province: job.location }, { force: true });
    console.log(`Job ${i + 1}: ${job.title} -> success: ${res.success}, template: ${res.templateIndex}, theme: ${res.theme}, file: ${res.filename}`);
  }
  await bannerGenerator.close();
  console.log('All tests completed successfully!');
}

testAllTemplates().catch(err => {
  console.error('Error testing templates:', err);
  process.exit(1);
});
