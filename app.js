(function(){
  'use strict';

  const STORAGE_KEY = 'ft_transactions_v1';
  const SHEETS_URL_KEY = 'ft_sheets_url';
  const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const EXPENSE_CATEGORIES = ['ค่าห้อง','ค่าน้ำ','ค่าไฟ','เน็ตบ้าน','เน็ตโทรศัพท์','ให้ย่า','BTS','รถตู้','ประกันสังคม','Shopping','น้ำยาซักผ้า','อาหาร','อื่นๆ'];
  const INCOME_CATEGORIES = ['เงินเดือน','รายได้เสริม','โบนัส','อื่นๆ'];

  let transactions = [];
  let currentMonth = new Date().getMonth();
  let currentYear = new Date().getFullYear();
  let editingId = null;
  let currentType = 'expense';
  let categoryChart = null;
  let trendChart = null;
  let sheetsUrl = '';

  function uid(){ return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
  function fmt(n){ n = Math.round(Number(n)||0); return n.toLocaleString('en-US'); }
  function todayISO(){ return new Date().toISOString().slice(0,10); }

  function isSheetsConnected(){ return !!sheetsUrl; }

  async function sheetsRequest(action, params){
    const url = new URL(sheetsUrl);
    url.searchParams.set('action', action);
    Object.keys(params||{}).forEach(k=>{
      if(params[k] !== undefined && params[k] !== null) url.searchParams.set(k, params[k]);
    });
    const res = await fetch(url.toString());
    if(!res.ok) throw new Error('network_error');
    return res.json();
  }

  function updateSheetsStatusUI(message){
    const card = document.getElementById('sheetsStatusCard');
    const text = document.getElementById('sheetsStatusText');
    card.style.display = 'block';
    if(isSheetsConnected()){
      text.textContent = message || 'เชื่อมต่อ Google Sheets แล้ว ข้อมูลจะบันทึกลง Sheet โดยตรง';
    } else {
      text.textContent = 'ยังไม่ได้เชื่อมต่อ — ข้อมูลจะถูกเก็บในเบราว์เซอร์นี้เท่านั้น (localStorage)';
    }
  }

  function loadTransactions(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      transactions = raw ? JSON.parse(raw) : [];
    }catch(e){ transactions = []; }
  }
  function saveTransactions(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions)); }catch(e){}
  }

  async function refreshFromSheetsIfConnected(){
    if(!isSheetsConnected()) return;
    try{
      const data = await sheetsRequest('list');
      if(data && data.ok && Array.isArray(data.transactions)){
        transactions = data.transactions;
        saveTransactions();
      }
    }catch(e){
      updateSheetsStatusUI('เชื่อมต่อ Google Sheets ไม่สำเร็จ ใช้ข้อมูลที่บันทึกไว้ในเบราว์เซอร์แทน');
    }
  }

  function monthTransactions(){
    return transactions.filter(t=>{
      const d = new Date(t.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).sort((a,b)=> new Date(b.date) - new Date(a.date));
  }

  function updateMonthLabel(){
    document.getElementById('monthLabel').textContent = THAI_MONTHS[currentMonth] + ' ' + currentYear;
  }

  function renderSummary(list){
    const income = list.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount||0),0);
    const expense = list.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount||0),0);
    document.getElementById('sumIncome').textContent = '฿' + fmt(income);
    document.getElementById('sumExpense').textContent = '฿' + fmt(expense);
    document.getElementById('sumBalance').textContent = '฿' + fmt(income - expense);
  }

  function renderTxList(list){
    const container = document.getElementById('txList');
    const emptyNote = document.getElementById('txEmpty');
    container.innerHTML = '';
    if(list.length === 0){
      emptyNote.style.display = 'block';
      return;
    }
    emptyNote.style.display = 'none';

    const groups = {};
    list.forEach(t=>{
      if(!groups[t.date]) groups[t.date] = [];
      groups[t.date].push(t);
    });

    Object.keys(groups).sort((a,b)=> new Date(b)-new Date(a)).forEach(date=>{
      const dayLabel = document.createElement('div');
      dayLabel.className = 'tx-day-label';
      const d = new Date(date);
      dayLabel.textContent = d.getDate() + ' ' + THAI_MONTHS[d.getMonth()];
      container.appendChild(dayLabel);

      groups[date].forEach(t=>{
        const row = document.createElement('div');
        row.className = 'tx-row';
        row.dataset.id = t.id;
        row.innerHTML = `
          <div class="tx-left">
            <span class="tx-dot ${t.type}"></span>
            <div class="tx-info">
              <div class="tx-category">${escapeHtml(t.category || 'ไม่ระบุหมวดหมู่')}</div>
              ${t.note ? `<div class="tx-note">${escapeHtml(t.note)}</div>` : ''}
            </div>
          </div>
          <div class="tx-amount num ${t.type}">${t.type==='income'?'+':'-'}฿${fmt(t.amount)}</div>
        `;
        row.addEventListener('click', ()=> openEditModal(t.id));
        container.appendChild(row);
      });
    });
  }

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function renderCategoryChart(list){
    const expenses = list.filter(t=>t.type==='expense');
    const emptyNote = document.getElementById('categoryEmpty');
    const canvas = document.getElementById('categoryChart');
    if(expenses.length === 0){
      emptyNote.style.display = 'block';
      canvas.style.display = 'none';
      if(categoryChart){ categoryChart.destroy(); categoryChart = null; }
      return;
    }
    emptyNote.style.display = 'none';
    canvas.style.display = 'block';

    const byCategory = {};
    expenses.forEach(t=>{
      const cat = t.category || 'อื่นๆ';
      byCategory[cat] = (byCategory[cat]||0) + Number(t.amount||0);
    });
    const labels = Object.keys(byCategory);
    const data = Object.values(byCategory);
    const palette = ['#0071E3','#FF9500','#2FA84F','#FF3B30','#8E5AE2','#00B8B0','#C7511F','#5E5CE6','#B5495B','#6E6E73'];

    if(categoryChart) categoryChart.destroy();
    categoryChart = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data:{
        labels: labels,
        datasets:[{ data: data, backgroundColor: palette, borderWidth:0 }]
      },
      options:{
        maintainAspectRatio:false,
        plugins:{
          legend:{ position:'bottom', labels:{ boxWidth:10, font:{size:11} } }
        }
      }
    });
  }

  function renderTrendChart(){
    const labels = [];
    const incomeData = [];
    const expenseData = [];
    for(let i=5;i>=0;i--){
      const d = new Date(currentYear, currentMonth - i, 1);
      const monthIdx = d.getMonth();
      const yearIdx = d.getFullYear();
      labels.push(THAI_MONTHS[monthIdx].slice(0,3) + ' ' + String(yearIdx).slice(2));
      const list = transactions.filter(t=>{
        const td = new Date(t.date);
        return td.getMonth() === monthIdx && td.getFullYear() === yearIdx;
      });
      incomeData.push(list.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount||0),0));
      expenseData.push(list.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount||0),0));
    }

    const canvas = document.getElementById('trendChart');
    if(trendChart) trendChart.destroy();
    trendChart = new Chart(canvas.getContext('2d'), {
      type:'bar',
      data:{
        labels: labels,
        datasets:[
          { label:'รายรับ', data: incomeData, backgroundColor:'#2FA84F' },
          { label:'รายจ่าย', data: expenseData, backgroundColor:'#FF3B30' }
        ]
      },
      options:{
        maintainAspectRatio:false,
        scales:{ y:{ beginAtZero:true, ticks:{ font:{size:10} } }, x:{ ticks:{ font:{size:10} } } },
        plugins:{ legend:{ position:'bottom', labels:{ boxWidth:10, font:{size:11} } } }
      }
    });
  }

  function renderAll(){
    updateMonthLabel();
    const list = monthTransactions();
    renderSummary(list);
    renderTxList(list);
    renderCategoryChart(list);
    renderTrendChart();
    populateCategoryList();
  }

  function populateCategoryList(){
    const datalist = document.getElementById('categoryList');
    const cats = currentType === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
    datalist.innerHTML = cats.map(c=>`<option value="${c}"></option>`).join('');
  }

  // Modal handling
  function openAddModal(){
    editingId = null;
    currentType = 'expense';
    document.getElementById('modalTitle').textContent = 'เพิ่มรายการ';
    document.getElementById('txDate').value = todayISO();
    document.getElementById('txCategory').value = '';
    document.getElementById('txAmount').value = '';
    document.getElementById('txNote').value = '';
    document.getElementById('deleteTxBtn').style.display = 'none';
    setTypeUI('expense');
    document.getElementById('txModalBackdrop').classList.add('open');
  }

  function openEditModal(id){
    const t = transactions.find(x=>x.id===id);
    if(!t) return;
    editingId = id;
    currentType = t.type;
    document.getElementById('modalTitle').textContent = 'แก้ไขรายการ';
    document.getElementById('txDate').value = t.date;
    document.getElementById('txCategory').value = t.category;
    document.getElementById('txAmount').value = t.amount;
    document.getElementById('txNote').value = t.note || '';
    document.getElementById('deleteTxBtn').style.display = 'inline-block';
    setTypeUI(t.type);
    document.getElementById('txModalBackdrop').classList.add('open');
  }

  function closeModal(){
    document.getElementById('txModalBackdrop').classList.remove('open');
  }

  function setTypeUI(type){
    currentType = type;
    document.getElementById('typeExpenseBtn').classList.toggle('active', type==='expense');
    document.getElementById('typeIncomeBtn').classList.toggle('active', type==='income');
    populateCategoryList();
  }

  async function saveTx(){
    const date = document.getElementById('txDate').value || todayISO();
    const category = document.getElementById('txCategory').value.trim() || 'อื่นๆ';
    const amount = parseFloat(document.getElementById('txAmount').value.replace(/,/g,'')) || 0;
    const note = document.getElementById('txNote').value.trim();
    if(amount <= 0){ alert('กรุณาใส่จำนวนเงินให้ถูกต้อง'); return; }

    const saveBtn = document.getElementById('saveTxBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'กำลังบันทึก...';

    try{
      if(editingId){
        const t = transactions.find(x=>x.id===editingId);
        if(t){ t.date=date; t.category=category; t.amount=amount; t.note=note; t.type=currentType; }
        if(isSheetsConnected()){
          await sheetsRequest('update', {id: editingId, type: currentType, date, category, amount, note});
        }
      } else {
        const newTx = { id: uid(), type: currentType, date, category, amount, note };
        transactions.push(newTx);
        if(isSheetsConnected()){
          await sheetsRequest('add', newTx);
        }
      }
      saveTransactions();
      closeModal();
      renderAll();
    }catch(e){
      alert('บันทึกไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ Google Sheets');
    }finally{
      saveBtn.disabled = false;
      saveBtn.textContent = 'บันทึก';
    }
  }

  async function deleteTx(){
    if(!editingId) return;
    try{
      if(isSheetsConnected()){
        await sheetsRequest('delete', {id: editingId});
      }
      transactions = transactions.filter(t=>t.id!==editingId);
      saveTransactions();
      closeModal();
      renderAll();
    }catch(e){
      alert('ลบไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ Google Sheets');
    }
  }

  // Import / Export
  function exportData(){
    const blob = new Blob([JSON.stringify(transactions, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transactions-export.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function tryImportBudgetJSON(jsonStr){
    let data;
    try{ data = JSON.parse(jsonStr); }
    catch(e){ alert('ไฟล์ JSON ไม่ถูกต้อง'); return; }

    const monthPrefix = new Date(currentYear, currentMonth, 1).toISOString().slice(0,7);
    const dateStr = monthPrefix + '-01';
    const newRows = [];

    if(data && Array.isArray(data.expenses)){
      if(data.income){
        newRows.push({ id: uid(), type:'income', date: dateStr, category:'เงินเดือน', amount: Number(data.income)||0, note:'นำเข้าจากงบตั้งต้น' });
      }
      data.expenses.forEach(e=>{
        newRows.push({ id: uid(), type:'expense', date: dateStr, category: e.name || 'อื่นๆ', amount: Number(e.amount)||0, note:'นำเข้าจากงบตั้งต้น' });
      });
      if(data.monthlySaving){
        newRows.push({ id: uid(), type:'expense', date: dateStr, category:'เงินเก็บ', amount: Number(data.monthlySaving)||0, note:'นำเข้าจากงบตั้งต้น' });
      }
    }
    else if(Array.isArray(data)){
      data.forEach(t=>{
        if(t && t.type && t.amount){
          newRows.push({ id: uid(), type: t.type, date: t.date || dateStr, category: t.category || 'อื่นๆ', amount: Number(t.amount)||0, note: t.note || 'นำเข้า' });
        }
      });
    } else {
      alert('ไม่พบข้อมูลที่รู้จักในไฟล์นี้');
      return;
    }

    const confirmBtn = document.getElementById('confirmImportBtn');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'กำลังนำเข้า...';
    try{
      transactions.push(...newRows);
      if(isSheetsConnected()){
        for(const row of newRows){
          await sheetsRequest('add', row);
        }
      }
      saveTransactions();
      renderAll();
      closeImportModal();
      alert('นำเข้าเรียบร้อย เพิ่ม ' + newRows.length + ' รายการ');
    }catch(e){
      alert('นำเข้าไม่สำเร็จบางส่วน กรุณาตรวจสอบการเชื่อมต่อ Google Sheets แล้วลองใหม่');
    }finally{
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'นำเข้า';
    }
  }

  function openImportModal(){
    document.getElementById('importTextarea').value = '';
    document.getElementById('importModalBackdrop').classList.add('open');
  }
  function closeImportModal(){
    document.getElementById('importModalBackdrop').classList.remove('open');
  }

  // Event bindings
  document.getElementById('prevMonth').addEventListener('click', ()=>{
    currentMonth--; if(currentMonth<0){ currentMonth=11; currentYear--; }
    renderAll();
  });
  document.getElementById('nextMonth').addEventListener('click', ()=>{
    currentMonth++; if(currentMonth>11){ currentMonth=0; currentYear++; }
    renderAll();
  });

  document.getElementById('openAddBtn').addEventListener('click', openAddModal);
  document.getElementById('closeModalBtn').addEventListener('click', closeModal);
  document.getElementById('txModalBackdrop').addEventListener('click', (e)=>{ if(e.target.id==='txModalBackdrop') closeModal(); });
  document.getElementById('saveTxBtn').addEventListener('click', saveTx);
  document.getElementById('deleteTxBtn').addEventListener('click', deleteTx);
  document.getElementById('typeExpenseBtn').addEventListener('click', ()=>setTypeUI('expense'));
  document.getElementById('typeIncomeBtn').addEventListener('click', ()=>setTypeUI('income'));

  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('importBtn').addEventListener('click', openImportModal);
  document.getElementById('closeImportBtn').addEventListener('click', closeImportModal);
  document.getElementById('importModalBackdrop').addEventListener('click', (e)=>{ if(e.target.id==='importModalBackdrop') closeImportModal(); });
  document.getElementById('confirmImportBtn').addEventListener('click', ()=>{
    const text = document.getElementById('importTextarea').value.trim();
    if(!text){ alert('กรุณาวางข้อมูล JSON หรือเลือกไฟล์ก่อน'); return; }
    tryImportBudgetJSON(text);
  });
  document.getElementById('importFileInput').addEventListener('change', (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => { document.getElementById('importTextarea').value = reader.result; };
    reader.readAsText(file);
  });

  document.getElementById('sheetsSettingsBtn').addEventListener('click', ()=>{
    document.getElementById('sheetsUrlInput').value = sheetsUrl;
    document.getElementById('sheetsModalBackdrop').classList.add('open');
  });
  document.getElementById('closeSheetsModalBtn').addEventListener('click', ()=>{
    document.getElementById('sheetsModalBackdrop').classList.remove('open');
  });
  document.getElementById('sheetsModalBackdrop').addEventListener('click', (e)=>{
    if(e.target.id==='sheetsModalBackdrop') document.getElementById('sheetsModalBackdrop').classList.remove('open');
  });
  document.getElementById('connectSheetsBtn').addEventListener('click', async ()=>{
    const url = document.getElementById('sheetsUrlInput').value.trim();
    if(!url){ alert('กรุณาวาง Web app URL ก่อน'); return; }
    const btn = document.getElementById('connectSheetsBtn');
    btn.disabled = true;
    btn.textContent = 'กำลังทดสอบ...';
    const previousUrl = sheetsUrl;
    sheetsUrl = url;
    try{
      const res = await sheetsRequest('ping');
      if(res && res.ok){
        localStorage.setItem(SHEETS_URL_KEY, url);
        await refreshFromSheetsIfConnected();
        updateSheetsStatusUI('เชื่อมต่อ Google Sheets สำเร็จ');
        document.getElementById('sheetsModalBackdrop').classList.remove('open');
        renderAll();
      } else {
        throw new Error('bad_response');
      }
    }catch(e){
      sheetsUrl = previousUrl;
      alert('เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบ URL และการตั้งค่า deploy (Who has access: Anyone)');
    }finally{
      btn.disabled = false;
      btn.textContent = 'ทดสอบและเชื่อมต่อ';
    }
  });
  document.getElementById('disconnectSheetsBtn').addEventListener('click', ()=>{
    sheetsUrl = '';
    localStorage.removeItem(SHEETS_URL_KEY);
    updateSheetsStatusUI();
    document.getElementById('sheetsModalBackdrop').classList.remove('open');
  });

  async function init(){
    sheetsUrl = localStorage.getItem(SHEETS_URL_KEY) || '';
    loadTransactions();
    updateSheetsStatusUI();
    await refreshFromSheetsIfConnected();
    renderAll();
  }

  init();
})();
