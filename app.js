(function(){
  'use strict';

  const STORAGE_KEY = 'ft_transactions_v1';
  const SHEETS_URL_KEY = 'ft_sheets_url';
  const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const EXPENSE_CATEGORIES = ['ค่าห้อง','ค่าน้ำ','ค่าไฟ','เน็ตบ้าน','เน็ตโทรศัพท์','ให้ย่า','BTS','รถตู้','ประกันสังคม','Shopping','น้ำยาซักผ้า','อาหาร','กาแฟ','เดินทาง','สุขภาพ','ของใช้','อื่นๆ'];
  const INCOME_CATEGORIES = ['เงินเดือน','รายได้เสริม','โบนัส','คืนเงิน','อื่นๆ'];

  let transactions = [];
  let currentMonth = new Date().getMonth();
  let currentYear = new Date().getFullYear();
  let editingId = null;
  let currentType = 'expense';
  let categoryChart = null;
  let trendChart = null;
  let sheetsUrl = '';

  function uid(){ return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
  function fmt(n){ return Math.round(Number(n)||0).toLocaleString('en-US'); }
  function todayISO(){ return new Date().toISOString().slice(0,10); }
  function isSheetsConnected(){ return Boolean(sheetsUrl); }

  async function sheetsRequest(action, params){
    const url = new URL(sheetsUrl);
    url.searchParams.set('action', action);
    Object.keys(params||{}).forEach(key=>{
      if(params[key] !== undefined && params[key] !== null) url.searchParams.set(key, params[key]);
    });
    const res = await fetch(url.toString());
    if(!res.ok) throw new Error('network_error');
    return res.json();
  }

  function updateSheetsStatusUI(message){
    const card = document.getElementById('sheetsStatusCard');
    const text = document.getElementById('sheetsStatusText');
    card.style.display = 'flex';
    card.classList.toggle('connected', isSheetsConnected());
    text.textContent = message || (isSheetsConnected()
      ? 'เชื่อมต่อ Google Sheets แล้ว รายการใหม่และรายการที่แก้ไขจะถูกบันทึกลง Sheet'
      : 'ยังไม่ได้เชื่อมต่อ Google Sheets ข้อมูลจะถูกเก็บไว้ใน browser นี้ก่อน');
  }

  function loadTransactions(){
    try{
      transactions = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    }catch(e){
      transactions = [];
    }
  }

  function saveTransactions(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
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
      updateSheetsStatusUI('เชื่อมต่อ Google Sheets ไม่สำเร็จ ตอนนี้แสดงข้อมูลที่เคยบันทึกไว้ใน browser');
    }
  }

  function monthTransactions(){
    return transactions.filter(item=>{
      const d = new Date(item.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).sort((a,b)=> new Date(b.date) - new Date(a.date));
  }

  function updateMonthLabel(){
    document.getElementById('monthLabel').textContent = THAI_MONTHS[currentMonth] + ' ' + currentYear;
  }

  function renderSummary(list){
    const income = list.filter(t=>t.type==='income').reduce((sum,t)=>sum+Number(t.amount||0),0);
    const expense = list.filter(t=>t.type==='expense').reduce((sum,t)=>sum+Number(t.amount||0),0);
    const balance = income - expense;
    const balanceEl = document.getElementById('sumBalance');
    document.getElementById('sumIncome').textContent = '฿' + fmt(income);
    document.getElementById('sumExpense').textContent = '฿' + fmt(expense);
    balanceEl.textContent = '฿' + fmt(balance);
    balanceEl.classList.toggle('expense', balance < 0);
    balanceEl.classList.toggle('income', balance >= 0);
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
    list.forEach(item=>{
      if(!groups[item.date]) groups[item.date] = [];
      groups[item.date].push(item);
    });

    Object.keys(groups).sort((a,b)=> new Date(b)-new Date(a)).forEach(date=>{
      const label = document.createElement('div');
      label.className = 'tx-day-label';
      const d = new Date(date);
      label.textContent = d.getDate() + ' ' + THAI_MONTHS[d.getMonth()];
      container.appendChild(label);

      groups[date].forEach(item=>{
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'tx-row';
        row.dataset.id = item.id;
        row.innerHTML = `
          <div class="tx-left">
            <span class="tx-dot ${item.type}"></span>
            <div class="tx-info">
              <div class="tx-category">${escapeHtml(item.category || 'ไม่ระบุหมวดหมู่')}</div>
              ${item.note ? `<div class="tx-note">${escapeHtml(item.note)}</div>` : ''}
            </div>
          </div>
          <div class="tx-amount num ${item.type}">${item.type==='income'?'+':'-'}฿${fmt(item.amount)}</div>
        `;
        row.addEventListener('click', ()=> openEditModal(item.id));
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
    expenses.forEach(item=>{
      const cat = item.category || 'อื่นๆ';
      byCategory[cat] = (byCategory[cat] || 0) + Number(item.amount || 0);
    });

    if(categoryChart) categoryChart.destroy();
    categoryChart = new Chart(canvas.getContext('2d'), {
      type: 'doughnut',
      data:{
        labels: Object.keys(byCategory),
        datasets:[{
          data: Object.values(byCategory),
          backgroundColor: ['#0071E3','#FF9500','#34C759','#FF3B30','#AF52DE','#00C7BE','#5856D6','#A2845E','#6E6E73'],
          borderWidth: 0
        }]
      },
      options:{
        maintainAspectRatio:false,
        cutout:'68%',
        plugins:{ legend:{ position:'bottom', labels:{ boxWidth:10, padding:14, font:{size:11} } } }
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
      labels.push(THAI_MONTHS[monthIdx].slice(0,3));
      const list = transactions.filter(item=>{
        const td = new Date(item.date);
        return td.getMonth() === monthIdx && td.getFullYear() === yearIdx;
      });
      incomeData.push(list.filter(t=>t.type==='income').reduce((sum,t)=>sum+Number(t.amount||0),0));
      expenseData.push(list.filter(t=>t.type==='expense').reduce((sum,t)=>sum+Number(t.amount||0),0));
    }

    const canvas = document.getElementById('trendChart');
    if(trendChart) trendChart.destroy();
    trendChart = new Chart(canvas.getContext('2d'), {
      type:'bar',
      data:{
        labels,
        datasets:[
          { label:'รายรับ', data: incomeData, backgroundColor:'#34C759', borderRadius:8 },
          { label:'รายจ่าย', data: expenseData, backgroundColor:'#FF3B30', borderRadius:8 }
        ]
      },
      options:{
        maintainAspectRatio:false,
        scales:{
          y:{ beginAtZero:true, grid:{ color:'#ECECF0' }, ticks:{ font:{size:10} } },
          x:{ grid:{ display:false }, ticks:{ font:{size:10} } }
        },
        plugins:{ legend:{ position:'bottom', labels:{ boxWidth:10, padding:14, font:{size:11} } } }
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
    datalist.innerHTML = cats.map(cat=>`<option value="${cat}"></option>`).join('');
  }

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
    setTimeout(()=>document.getElementById('txCategory').focus(), 80);
  }

  function openEditModal(id){
    const item = transactions.find(x=>x.id===id);
    if(!item) return;
    editingId = id;
    currentType = item.type;
    document.getElementById('modalTitle').textContent = 'แก้ไขรายการ';
    document.getElementById('txDate').value = item.date;
    document.getElementById('txCategory').value = item.category;
    document.getElementById('txAmount').value = item.amount;
    document.getElementById('txNote').value = item.note || '';
    document.getElementById('deleteTxBtn').style.display = 'inline-flex';
    setTypeUI(item.type);
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
        const item = transactions.find(x=>x.id===editingId);
        if(item){ item.date=date; item.category=category; item.amount=amount; item.note=note; item.type=currentType; }
        if(isSheetsConnected()) await sheetsRequest('update', {id: editingId, type: currentType, date, category, amount, note});
      } else {
        const newTx = { id: uid(), type: currentType, date, category, amount, note };
        transactions.push(newTx);
        if(isSheetsConnected()) await sheetsRequest('add', newTx);
      }
      saveTransactions();
      closeModal();
      renderAll();
      updateSheetsStatusUI(isSheetsConnected() ? 'บันทึกล่าสุดลง Google Sheets แล้ว' : undefined);
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
      if(isSheetsConnected()) await sheetsRequest('delete', {id: editingId});
      transactions = transactions.filter(t=>t.id!==editingId);
      saveTransactions();
      closeModal();
      renderAll();
      updateSheetsStatusUI(isSheetsConnected() ? 'ลบรายการจาก Google Sheets แล้ว' : undefined);
    }catch(e){
      alert('ลบไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ Google Sheets');
    }
  }

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
        newRows.push({ id: uid(), type:'income', date: dateStr, category:'เงินเดือน', amount: Number(data.income)||0, note:'นำเข้าจากแผนงบ' });
      }
      data.expenses.forEach(e=>{
        newRows.push({ id: uid(), type:'expense', date: dateStr, category: e.name || 'อื่นๆ', amount: Number(e.amount)||0, note:'นำเข้าจากแผนงบ' });
      });
      if(data.monthlySaving){
        newRows.push({ id: uid(), type:'expense', date: dateStr, category:'เงินเก็บ', amount: Number(data.monthlySaving)||0, note:'นำเข้าจากแผนงบ' });
      }
    } else if(Array.isArray(data)){
      data.forEach(item=>{
        if(item && item.type && item.amount){
          newRows.push({ id: uid(), type: item.type, date: item.date || dateStr, category: item.category || 'อื่นๆ', amount: Number(item.amount)||0, note: item.note || 'นำเข้า' });
        }
      });
    } else {
      alert('ไม่พบข้อมูลที่ระบบรู้จักในไฟล์นี้');
      return;
    }

    const confirmBtn = document.getElementById('confirmImportBtn');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'กำลังนำเข้า...';
    try{
      transactions.push(...newRows);
      if(isSheetsConnected()){
        for(const row of newRows) await sheetsRequest('add', row);
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

  function bindClick(id, handler){
    const el = document.getElementById(id);
    if(el) el.addEventListener('click', handler);
  }

  bindClick('prevMonth', ()=>{
    currentMonth--;
    if(currentMonth < 0){ currentMonth = 11; currentYear--; }
    renderAll();
  });
  bindClick('nextMonth', ()=>{
    currentMonth++;
    if(currentMonth > 11){ currentMonth = 0; currentYear++; }
    renderAll();
  });

  bindClick('openAddBtn', openAddModal);
  bindClick('openAddBtnDesktop', openAddModal);
  bindClick('mobileAddBtn', openAddModal);
  bindClick('closeModalBtn', closeModal);
  bindClick('saveTxBtn', saveTx);
  bindClick('deleteTxBtn', deleteTx);
  bindClick('typeExpenseBtn', ()=>setTypeUI('expense'));
  bindClick('typeIncomeBtn', ()=>setTypeUI('income'));

  document.getElementById('txModalBackdrop').addEventListener('click', e=>{ if(e.target.id==='txModalBackdrop') closeModal(); });

  bindClick('exportBtn', exportData);
  bindClick('importBtn', openImportModal);
  bindClick('closeImportBtn', closeImportModal);
  document.getElementById('importModalBackdrop').addEventListener('click', e=>{ if(e.target.id==='importModalBackdrop') closeImportModal(); });
  bindClick('confirmImportBtn', ()=>{
    const text = document.getElementById('importTextarea').value.trim();
    if(!text){ alert('กรุณาวางข้อมูล JSON หรือเลือกไฟล์ก่อน'); return; }
    tryImportBudgetJSON(text);
  });
  document.getElementById('importFileInput').addEventListener('change', e=>{
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => { document.getElementById('importTextarea').value = reader.result; };
    reader.readAsText(file);
  });

  bindClick('sheetsSettingsBtn', ()=>{
    document.getElementById('sheetsUrlInput').value = sheetsUrl;
    document.getElementById('sheetsModalBackdrop').classList.add('open');
  });
  bindClick('closeSheetsModalBtn', ()=>document.getElementById('sheetsModalBackdrop').classList.remove('open'));
  document.getElementById('sheetsModalBackdrop').addEventListener('click', e=>{
    if(e.target.id==='sheetsModalBackdrop') document.getElementById('sheetsModalBackdrop').classList.remove('open');
  });
  bindClick('connectSheetsBtn', async ()=>{
    const url = document.getElementById('sheetsUrlInput').value.trim();
    if(!url){ alert('กรุณาวาง Web app URL ก่อน'); return; }
    const btn = document.getElementById('connectSheetsBtn');
    btn.disabled = true;
    btn.textContent = 'กำลังทดสอบ...';
    const previousUrl = sheetsUrl;
    sheetsUrl = url;
    try{
      const res = await sheetsRequest('ping');
      if(!res || !res.ok) throw new Error('bad_response');
      localStorage.setItem(SHEETS_URL_KEY, url);
      await refreshFromSheetsIfConnected();
      updateSheetsStatusUI('เชื่อมต่อ Google Sheets สำเร็จ');
      document.getElementById('sheetsModalBackdrop').classList.remove('open');
      renderAll();
    }catch(e){
      sheetsUrl = previousUrl;
      alert('เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบ URL และตั้งค่า Deploy เป็น Anyone');
    }finally{
      btn.disabled = false;
      btn.textContent = 'ทดสอบและเชื่อมต่อ';
    }
  });
  bindClick('disconnectSheetsBtn', ()=>{
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
