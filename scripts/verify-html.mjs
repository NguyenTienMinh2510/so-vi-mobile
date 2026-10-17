import fs from 'node:fs';

const html = fs.readFileSync('artifacts/ai-spending-preview/index.html', 'utf8');

console.log('Has plan section:', html.includes('data-panel="plan"'));
console.log('Has remaining:', html.includes('Còn cuối kỳ 64.000 đ'));
console.log('Has milestone today:', html.includes('Hôm nay · 2026-10-13'));
console.log('Has milestone day 2:', html.includes('Ngày 2 · 2026-10-14'));
console.log('Has timeline track:', html.includes('rm-timeline'));
console.log('Has metric boxes:', html.includes('rm-grid-box'));
console.log('Has Cơm & Phở:', html.includes('Cơm') && html.includes('Phở'));
console.log('Has Lock & Confirm buttons:', html.includes('Khóa bữa 1 · 2026-10-13') && html.includes('Xác nhận bữa 1 · 2026-10-13'));
console.log('Has Swap & Link choices:', html.includes('Đổi món 2026-10-13 bữa 1') && html.includes('Liên kết chi 2026-10-13 bữa 1'));
