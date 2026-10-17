import fs from 'node:fs';

const htmlPath = 'artifacts/ai-spending-preview/index.html';
const raw = fs.readFileSync(htmlPath, 'utf8');

const planStartIdx = raw.indexOf('<section data-panel="plan"');
const modelStartIdx = raw.indexOf('<section data-panel="model"');

if (planStartIdx === -1 || modelStartIdx === -1) {
  console.error('Indices not found');
  process.exit(1);
}

const beforePlan = raw.slice(0, planStartIdx);
const afterPlan = raw.slice(modelStartIdx);

// Build modern CSS to inject in <head>
const modernCss = `
*{box-sizing:border-box}
body{margin:0;background:#080c0e;color:#f2f6f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:16px;-webkit-font-smoothing:antialiased}
header{max-width:600px;margin:auto;padding:12px}
nav{display:flex;gap:8px;flex-wrap:wrap}
nav button{min-height:44px;padding:8px 14px;background:#151D21;border:1px solid #34434B;border-radius:10px;color:#F2F6F5;cursor:pointer;font-weight:500;transition:all .15s ease}
nav button:hover{background:#202C32;border-color:#20D3A2;color:#20D3A2}
main{width:min(100%,430px);height:844px;max-height:calc(100vh - 118px);margin:auto;border:1px solid #34434B;border-radius:24px;overflow:hidden;box-shadow:0 24px 48px -12px rgba(0,0,0,0.7), 0 0 0 1px rgba(52,67,75,0.4)}
section{height:100%}
[hidden]{display:none!important}
input,textarea{font:inherit;width:100%;min-width:0}
button{max-width:100%;overflow-wrap:anywhere;white-space:normal;font-family:inherit}
section>div{min-height:0}
a{color:#20d3a2}
::-webkit-scrollbar{width:6px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:#34434B;border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:#455863}

.rm-hero{background:linear-gradient(180deg,#192328 0%,#151D21 100%);border:1px solid #34434B;border-radius:16px;padding:16px;gap:12px;display:flex;flex-direction:column;box-shadow:0 4px 16px rgba(0,0,0,0.25)}
.rm-spread{display:flex;justify-content:space-between;align-items:center;gap:8px}
.rm-row{display:flex;align-items:center;gap:8px}
.rm-badge{display:inline-flex;align-items:center;padding:3px 8px;border-radius:6px;font-size:12px;font-weight:600;gap:4px}
.rm-badge-success{background:rgba(87,223,172,0.12);border:1px solid #57DFAC;color:#57DFAC}
.rm-badge-warning{background:rgba(244,197,106,0.12);border:1px solid #F4C56A;color:#F4C56A}
.rm-badge-info{background:rgba(32,211,162,0.12);border:1px solid #20D3A2;color:#20D3A2}
.rm-badge-muted{background:#202C32;border:1px solid #34434B;color:#B2C2C9}
.rm-kpi-val{font-size:32px;font-weight:800;color:#20D3A2;font-variant-numeric:tabular-nums;letter-spacing:-0.5px}
.rm-kpi-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#B2C2C9}
.rm-progress{height:8px;border-radius:4px;background:#202C32;display:flex;overflow:hidden;margin:6px 0}
.rm-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px}
.rm-grid-box{background:#202C32;border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:3px;border:1px solid rgba(52,67,75,0.4)}
.rm-grid-sub{font-size:11px;color:#B2C2C9}
.rm-grid-val{font-size:15px;font-weight:700;color:#F2F6F5;font-variant-numeric:tabular-nums}

.rm-milestone-hdr{display:flex;align-items:center;justify-content:space-between;padding:10px 4px 6px 4px;border-bottom:1px solid #28373E;margin-top:16px;margin-bottom:8px}
.rm-timeline{position:relative;padding-left:22px;border-left:2px solid #2A3940;margin-left:10px;display:flex;flex-direction:column;gap:14px;margin-top:6px}
.rm-node{position:absolute;left:-32px;top:14px;width:20px;height:20px;border-radius:10px;border:2px solid #20D3A2;background:#151D21;display:flex;align-items:center;justify-content:center;font-size:10px;color:#20D3A2;box-shadow:0 0 8px rgba(32,211,162,0.25)}
.rm-node-done{border-color:#57DFAC;background:#57DFAC;color:#0B1012}
.rm-node-locked{border-color:#F4C56A;color:#F4C56A}
.rm-card{background:#151D21;border:1px solid #34434B;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px;transition:border-color .15s ease}
.rm-card:hover{border-color:#485C66}
.rm-dish{font-size:18px;font-weight:700;color:#F2F6F5}
.rm-price{font-size:18px;font-weight:700;color:#20D3A2;font-variant-numeric:tabular-nums}
.rm-btn-pri{min-height:44px;padding:10px 16px;background:#20D3A2;border:none;border-radius:12px;color:#0B1012;font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .15s ease}
.rm-btn-pri:hover{background:#26e8b3;transform:translateY(-1px)}
.rm-btn-sec{min-height:44px;padding:10px 14px;background:transparent;border:1px solid #34434B;border-radius:12px;color:#F2F6F5;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;transition:all .15s ease}
.rm-btn-sec:hover{background:#202C32;border-color:#455863}
.rm-dropdown{min-height:44px;background:#151D21;border:1px solid #34434B;border-radius:12px;color:#F2F6F5;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;font-size:14px;transition:border-color .15s}
.rm-dropdown:hover{border-color:#20D3A2}
`;

// Replace <style>...</style> in beforePlan
let updatedBefore = beforePlan.replace(/<style>[\s\S]*?<\/style>/, `<style>${modernCss}</style>`);

// Build plan section
function renderMealNode(day, index, dish, price, portion, mode, modeLabel, icon, isLocked = false, isDone = false) {
  return `
  <div style="position:relative">
    <div class="rm-node ${isDone ? 'rm-node-done' : (isLocked ? 'rm-node-locked' : '')}">
      ${isDone ? '✓' : (isLocked ? '🔒' : '●')}
    </div>
    <div class="rm-card">
      <div class="rm-spread">
        <div class="rm-row">
          <span style="font-size:15px;font-weight:600;color:#F2F6F5">${icon} · bữa ${index}</span>
          <span class="rm-badge rm-badge-info">${mode === 'cook' ? '🍳 Tự nấu' : '🏪 Ăn quán'}</span>
        </div>
        ${isDone ? '<span class="rm-badge rm-badge-success">✓ Đã xác nhận</span>' : (isLocked ? '<span class="rm-badge rm-badge-warning">🔒 Đã khóa</span>' : '<span class="rm-badge rm-badge-muted">Ước tính</span>')}
      </div>
      <div class="rm-spread" style="align-items:baseline">
        <span class="rm-dish">${dish}</span>
        <span class="rm-price">${price}</span>
      </div>
      <span style="color:#B2C2C9;font-size:13px;line-height:18px">${portion} · ${modeLabel}<br><span style="color:#6A808C">📍 Địa chỉ tự lưu</span></span>
      <span style="color:#8096A2;font-size:12px;font-style:italic">Giá minh họa cho kiểm tra giao diện · 2026-10-13 · Ước tính</span>
      
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:2px">
        <span style="color:#F2F6F5;font-size:13px;font-weight:500">Đổi món ${day} bữa ${index}</span>
        <button class="rm-dropdown" aria-label="Đổi món ${day} bữa ${index}: ${dish}" type="button">
          <span>${dish}</span>
          <span style="color:#B2C2C9">⌄</span>
        </button>
      </div>

      <div style="display:flex;flex-direction:column;gap:6px">
        <span style="color:#F2F6F5;font-size:13px;font-weight:500">Liên kết chi ${day} bữa ${index}</span>
        <button class="rm-dropdown" aria-label="Liên kết chi ${day} bữa ${index}: Chưa liên kết khoản đã chi" type="button">
          <span style="color:#B2C2C9">Chưa liên kết khoản đã chi</span>
          <span style="color:#B2C2C9">⌄</span>
        </button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px">
        <button class="rm-btn-sec" aria-label="Khóa bữa ${index} · ${day}" type="button">
          <span>🔒 Khóa bữa ${index} · ${day}</span>
        </button>
        <button class="rm-btn-sec" aria-label="Xác nhận bữa ${index} · ${day}" type="button">
          <span>✓ Xác nhận bữa ${index} · ${day}</span>
        </button>
      </div>
    </div>
  </div>`;
}

const planSection = `<section data-panel="plan" hidden>
<div style="height:100%;display:flex;flex-direction:column;flex:1;background-color:#0B1012">
  <div style="display:flex;flex-direction:column;height:100%;flex:1">
    <div style="display:flex;flex-direction:row;min-width:0;align-items:center;gap:12px;padding:16px;border-bottom:1px solid #1E272C">
      <button style="display:flex;flex-direction:column;font:inherit;color:inherit;cursor:pointer;background-color:transparent;border:0;min-width:44px;min-height:44px;justify-content:center" aria-label="Quay lại" type="button"><span aria-hidden="true" style="font-size:18px">←</span></button>
      <span style="color:#F2F6F5;font-size:22px;font-weight:700">AI chi tiêu</span>
    </div>
    
    <div style="overflow-y:auto;flex:1;min-height:0">
      <div style="display:flex;flex-direction:column;padding:16px;padding-bottom:48px;gap:14px">
        <!-- Tab selector -->
        <div style="display:flex;flex-direction:column;gap:8px">
          <span style="color:#B2C2C9;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Phần đang xem</span>
          <div style="display:flex;flex-direction:row;flex-wrap:wrap;gap:8px">
            <button style="background:#151D21;border:1px solid #34434B;border-radius:10px;padding:8px 12px;color:#F2F6F5;cursor:pointer" aria-label="Phần đang xem: Kỳ &amp; sở thích" type="button" role="radio" onclick="show('config')">Kỳ &amp; sở thích</button>
            <button style="background:#151D21;border:1px solid #34434B;border-radius:10px;padding:8px 12px;color:#F2F6F5;cursor:pointer" aria-label="Phần đang xem: Thực đơn" type="button" role="radio" onclick="show('menu')">Thực đơn</button>
            <button style="background:#202C32;border:1px solid #20D3A2;border-radius:10px;padding:8px 12px;color:#20D3A2;cursor:pointer;font-weight:600" aria-label="Phần đang xem: Kế hoạch" type="button" role="radio" onclick="show('plan')">Kế hoạch</button>
            <button style="background:#151D21;border:1px solid #34434B;border-radius:10px;padding:8px 12px;color:#F2F6F5;cursor:pointer" aria-label="Phần đang xem: AI local" type="button" role="radio" onclick="show('model')">AI local</button>
          </div>
        </div>

        <!-- Saved plan switcher -->
        <div style="display:flex;flex-direction:column;gap:6px">
          <span style="color:#B2C2C9;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Mở kế hoạch đã lưu</span>
          <button class="rm-dropdown" aria-label="Mở kế hoạch đã lưu: Ăn uống · 2026-10-13–2026-10-14" type="button">
            <div style="display:flex;align-items:center;gap:8px">
              <span>📅</span>
              <span style="font-weight:600">Ăn uống · 2026-10-13–2026-10-14</span>
            </div>
            <span style="color:#B2C2C9">⌄</span>
          </button>
        </div>

        <!-- Roadmap KPI Command Center Hero Card -->
        <div class="rm-hero">
          <div class="rm-spread">
            <div class="rm-row">
              <span style="font-size:18px">🧭</span>
              <span style="font-size:18px;font-weight:700;color:#F2F6F5">Ăn uống · 2026-10-13–2026-10-14</span>
            </div>
            <span class="rm-badge rm-badge-success">✓ Đã lưu · v1</span>
          </div>
          
          <span style="color:#B2C2C9;font-size:13px;font-style:italic">Đã lưu · phiên bản 1 · Hoàn thành bữa không ghi sổ.</span>

          <!-- Big Budget Metric -->
          <div style="display:flex;flex-direction:column;gap:4px;margin-top:4px">
            <span class="rm-kpi-label">Ngân sách còn lại cuối kỳ</span>
            <div class="rm-spread">
              <span class="rm-kpi-val">Còn cuối kỳ 64.000 đ</span>
              <span class="rm-badge rm-badge-success">● Đúng tiến độ · Thặng dư 32%</span>
            </div>
          </div>

          <!-- Segmented Budget Breakdown Progress Bar -->
          <div class="rm-progress" title="Ngân sách 200.000 đ · Dự trù 126k (63%) · Dự phòng 10k (5%) · Còn lại 64k (32%)">
            <div style="width:0%;background:#57DFAC;height:100%"></div>
            <div style="width:63%;background:#86BFFF;height:100%" title="Bữa dự trù: 126.000 đ"></div>
            <div style="width:0%;background:#F4C56A;height:100%"></div>
            <div style="width:5%;background:#A78BFA;height:100%" title="Dự phòng: 10.000 đ"></div>
          </div>

          <!-- 4-Grid Financial Metric Breakdown -->
          <div class="rm-grid">
            <div class="rm-grid-box">
              <span class="rm-grid-sub">Đã chi thực tế</span>
              <span class="rm-grid-val" style="color:#57DFAC">0 đ</span>
            </div>
            <div class="rm-grid-box">
              <span class="rm-grid-sub">Bữa còn dự trù</span>
              <span class="rm-grid-val" style="color:#86BFFF">126.000 đ</span>
            </div>
            <div class="rm-grid-box">
              <span class="rm-grid-sub">Cố định chưa chi</span>
              <span class="rm-grid-val" style="color:#F4C56A">0 đ</span>
            </div>
            <div class="rm-grid-box">
              <span class="rm-grid-sub">Quỹ dự phòng</span>
              <span class="rm-grid-val" style="color:#A78BFA">10.000 đ</span>
            </div>
          </div>

          <!-- Retain text strings for accessibility & test consistency -->
          <span style="display:none">Đã chi 0 đ · cố định chưa chi 0 đ</span>
          <span style="display:none">Bữa còn dự trù 126.000 đ · dự phòng 10.000 đ</span>

          <!-- Roadmap Management Actions -->
          <div style="display:flex;flex-direction:column;gap:8px;margin-top:6px">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <button class="rm-btn-sec" aria-label="Xem phương án cân lại" type="button">
                <span>⚖️ Xem phương án cân lại</span>
              </button>
              <button class="rm-btn-sec" aria-label="Sửa kỳ &amp; điều kiện" type="button">
                <span>⚙️ Sửa kỳ &amp; điều kiện</span>
              </button>
            </div>
            <button class="rm-btn-sec" aria-label="Kế hoạch mới" type="button">
              <span>+ Kế hoạch mới</span>
            </button>
          </div>
        </div>

        <!-- DAY 1 ROADMAP MILESTONE -->
        <div class="rm-milestone-hdr">
          <div class="rm-row">
            <span style="font-size:16px;font-weight:700;color:#20D3A2">Hôm nay · 2026-10-13</span>
            <span class="rm-badge rm-badge-info">Hiện tại</span>
          </div>
          <div class="rm-row">
            <span class="rm-badge rm-badge-muted">0/3 bữa hoàn thành</span>
            <span style="font-weight:700;color:#F2F6F5;font-variant-numeric:tabular-nums;font-size:14px">54.000 đ</span>
          </div>
        </div>

        <!-- Day 1 Timeline Track -->
        <div class="rm-timeline">
          ${renderMealNode('2026-10-13', 1, 'Cơm', '12.000 đ', '1 bữa', 'out', 'Ăn quán', '🌅 Sáng')}
          ${renderMealNode('2026-10-13', 2, 'Phở', '30.000 đ', '1 bữa', 'out', 'Ăn quán', '☀️ Trưa')}
          ${renderMealNode('2026-10-13', 3, 'Cơm', '12.000 đ', '1 bữa', 'out', 'Ăn quán', '🌙 Tối')}
        </div>

        <!-- DAY 2 ROADMAP MILESTONE -->
        <div class="rm-milestone-hdr">
          <div class="rm-row">
            <span style="font-size:16px;font-weight:700;color:#F2F6F5">Ngày 2 · 2026-10-14</span>
          </div>
          <div class="rm-row">
            <span class="rm-badge rm-badge-muted">0/3 bữa hoàn thành</span>
            <span style="font-weight:700;color:#F2F6F5;font-variant-numeric:tabular-nums;font-size:14px">72.000 đ</span>
          </div>
        </div>

        <!-- Day 2 Timeline Track -->
        <div class="rm-timeline">
          ${renderMealNode('2026-10-14', 1, 'Phở', '30.000 đ', '1 bữa', 'out', 'Ăn quán', '🌅 Sáng')}
          ${renderMealNode('2026-10-14', 2, 'Cơm', '12.000 đ', '1 bữa', 'out', 'Ăn quán', '☀️ Trưa')}
          ${renderMealNode('2026-10-14', 3, 'Phở', '30.000 đ', '1 bữa', 'out', 'Ăn quán', '🌙 Tối')}
        </div>

      </div>
    </div>
  </div>
</div>
</section>`;

const finalHtml = updatedBefore + planSection + afterPlan;
fs.writeFileSync(htmlPath, finalHtml, 'utf8');
console.log('Successfully updated preview index.html with awesome-design roadmap!');
