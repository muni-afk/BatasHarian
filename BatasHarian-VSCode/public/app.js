(function () {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const state = { user: null, data: null, toastTimer: null };
  const idr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
  const fmt = (n) => idr.format(Number(n) || 0).replace(/\u00a0/g, ' ');
  const num = (v) => Number(String(v || '').replace(/[^0-9]/g, '')) || 0;
  const isoLocal = (d = new Date()) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  const daysInMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const monthKey = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  const shortDate = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  const categories = { Makanan: '◒', Transportasi: '↗', Belanja: '◇', Tagihan: '▤', Hiburan: '♫', Kesehatan: '✚', Pendidikan: '▧', Lainnya: '◌' };
  const categoryClass = (s) => 'cat-' + String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

  function toast(message, error = false) {
    const el = $('#toast'); el.textContent = message; el.classList.toggle('error', error); el.classList.add('show');
    clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
  }
  async function request(path = '/finance', options = {}) {
    const response = await fetch('/api' + path, { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
    let body = {};
    try { body = await response.json(); } catch (_) {}
    if (response.status === 401) { location.replace('/login?next=' + encodeURIComponent(location.pathname + location.hash)); throw new Error('Silakan masuk kembali.'); }
    if (!response.ok) throw new Error(body.error || 'Permintaan gagal. Coba lagi.');
    return body;
  }
  function showModal(id) {
    const el = $('#' + id); if (!el) return; el.hidden = false; document.body.style.overflow = 'hidden';
    if (id === 'expenseModal') { $('#expenseDate').value = isoLocal(); $('#expenseError').textContent = ''; setTimeout(() => $('#expenseAmount').focus(), 40); }
    if (id === 'budgetModal') { $('#budgetAmount').value = String(state.data ? state.data.monthlyBudget : 3000000); updateBudgetPreview(); $('#budgetError').textContent = ''; setTimeout(() => $('#budgetAmount').focus(), 40); }
  }
  function closeModals() { $$('.modal-backdrop').forEach(el => { el.hidden = true; }); document.body.style.overflow = ''; }
  function updateBudgetPreview() { $('#budgetPreview').textContent = fmt(Math.floor(num($('#budgetAmount').value) / daysInMonth())); }
  function setGreeting(name) {
    const date = new Date();
    $('#todayLabel').textContent = date.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
    $('#year').textContent = date.getFullYear();
    const h = date.getHours(); const greet = h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
    $('#helloName').textContent = greet + ', ' + name;
  }
  async function init() {
    try {
      const sessionResponse = await fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' });
      if (!sessionResponse.ok) { location.replace('/login?next=' + encodeURIComponent(location.pathname + location.hash)); return; }
      const session = await sessionResponse.json(); state.user = session.user;
      const fullName = state.user.name || (state.user.email ? state.user.email.split('@')[0] : 'Akun saya');
      $('#userName').textContent = fullName; $('#userEmail').textContent = state.user.email || 'Akun BatasHarian';
      $('#avatar').textContent = (fullName.trim()[0] || 'U').toUpperCase();
      setGreeting(fullName);
      await loadData();
      $('#app').setAttribute('aria-busy', 'false');
    } catch (error) { $('#app').setAttribute('aria-busy', 'false'); toast(error.message || 'Tidak dapat memuat data akun.', true); }
  }
  async function loadData() { state.data = await request(); render(); }
  function render() {
    const data = state.data; const now = new Date(); const dailyBudget = Math.floor(data.monthlyBudget / daysInMonth(now));
    const remaining = Math.max(0, data.monthlyBudget - data.spentMonth);
    const monthPct = Math.min(100, Math.round(data.monthlyBudget > 0 ? data.spentMonth / data.monthlyBudget * 100 : 0));
    const dayRemain = Math.max(0, dailyBudget - data.spentToday);
    $('#dailyLimit').textContent = fmt(dailyBudget);
    $('#dailyHint').textContent = data.spentToday > dailyBudget ? 'Batas terlewati ' + fmt(data.spentToday - dailyBudget) : 'Sisa ruang belanja ' + fmt(dayRemain);
    $('#dailyHint').previousElementSibling.classList.toggle('status-warning', data.spentToday > dailyBudget);
    $('#spentToday').textContent = fmt(data.spentToday);
    $('#todayFoot').textContent = data.spentToday === 0 ? 'Belum ada pengeluaran hari ini' : data.spentToday > dailyBudget ? 'Melewati batas harian' : Math.round(data.spentToday / Math.max(1, dailyBudget) * 100) + '% dari batas harian digunakan';
    $('#remainingBudget').textContent = fmt(remaining); $('#remainingPercent').textContent = Math.max(0, 100 - monthPct) + '%';
    $('#remainingBar').style.width = Math.max(0, 100 - monthPct) + '%'; $('#monthPercent').textContent = monthPct + '%';
    $('#budgetRing').style.background = 'conic-gradient(#36784d 0% ' + monthPct + '%, #eaf0e7 ' + monthPct + '% 100%)';
    $('#ringSpent').textContent = fmt(data.spentMonth); $('#ringLeft').textContent = fmt(remaining); $('#monthlyBudget').textContent = fmt(data.monthlyBudget);
    $('#budgetNote').textContent = data.spentMonth > data.monthlyBudget ? 'Anggaran terlampaui ' + fmt(data.spentMonth - data.monthlyBudget) + '. Atur prioritas untuk sisa bulan ini.' : monthPct >= 80 ? 'Anggaran mulai menipis. Pilih pengeluaran berikutnya dengan bijak.' : 'Satu keputusan kecil hari ini bisa bikin beda.';
    renderWeek(data.expenses); renderExpenses();
  }
  function renderWeek(expenses) {
    const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    const days = Array.from({ length: 7 }, (_, i) => { const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i); const key = isoLocal(date); return { key, date, total: 0, today: key === isoLocal(now) }; });
    const map = Object.fromEntries(days.map(d => [d.key, d]));
    expenses.forEach(e => { if (map[e.spent_on]) map[e.spent_on].total += Number(e.amount); });
    const max = Math.max(1, ...days.map(d => d.total));
    $('#weekTotal').textContent = fmt(days.reduce((sum, d) => sum + d.total, 0));
    $('#chartNote').textContent = days.some(d => d.total > 0) ? 'Jaga ritmemu tetap stabil' : 'Mulai catat pengeluaranmu';
    const chart = $('#weekChart'); chart.replaceChildren();
    days.forEach(d => {
      const col = document.createElement('div'); col.className = 'chart-column'; col.title = d.date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' }) + ': ' + fmt(d.total);
      const slot = document.createElement('div'); slot.className = 'chart-barslot';
      const bar = document.createElement('div'); bar.className = 'chart-bar' + (d.today ? ' today' : ''); bar.style.height = (d.total > 0 ? Math.max(5, d.total / max * 100) : 3) + '%';
      bar.setAttribute('aria-label', fmt(d.total) + ' pada ' + d.key); slot.append(bar);
      const label = document.createElement('span'); label.className = 'chart-day' + (d.today ? ' today' : ''); label.textContent = d.date.toLocaleDateString('id-ID', { weekday: 'short' }).replace('.', '');
      col.append(slot, label); chart.append(col);
    });
  }
  function renderExpenses() {
    const body = $('#expenseRows'); const query = ($('#searchExpense').value || '').trim().toLowerCase();
    const thisMonth = state.data.expenses.filter(e => e.spent_on.startsWith(monthKey()));
    const filtered = thisMonth.filter(e => (e.note + ' ' + e.category + ' ' + e.amount).toLowerCase().includes(query));
    body.replaceChildren();
    if (!filtered.length) {
      const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 5; td.className = 'empty-row';
      const title = document.createElement('div'); title.className = 'empty-state-title'; title.textContent = query ? 'Transaksi tidak ditemukan' : 'Belum ada pengeluaran bulan ini';
      const hint = document.createElement('div'); hint.textContent = query ? 'Coba kata kunci yang lain.' : 'Catat pengeluaran pertamamu untuk mulai memantau anggaran.';
      td.append(title, hint); tr.append(td); body.append(tr);
    } else filtered.slice(0, 60).forEach(e => {
      const tr = document.createElement('tr');
      const nameTd = document.createElement('td'); const name = document.createElement('div'); name.className = 'expense-name';
      const symbol = document.createElement('span'); symbol.className = 'expense-symbol'; symbol.textContent = categories[e.category] || '◌';
      const description = document.createElement('span'); description.className = 'expense-description';
      const strong = document.createElement('strong'); strong.textContent = e.note || e.category;
      const small = document.createElement('small'); small.textContent = e.note ? e.category : 'Pengeluaran pribadi'; description.append(strong, small); name.append(symbol, description); nameTd.append(name);
      const catTd = document.createElement('td'); const pill = document.createElement('span'); pill.className = 'category-pill ' + categoryClass(e.category); pill.textContent = e.category; catTd.append(pill);
      const dateTd = document.createElement('td'); dateTd.textContent = shortDate(e.spent_on);
      const amountTd = document.createElement('td'); amountTd.className = 'amount-cell'; amountTd.textContent = '− ' + fmt(e.amount);
      const actionTd = document.createElement('td'); const del = document.createElement('button'); del.type = 'button'; del.className = 'delete-row'; del.textContent = '×'; del.title = 'Hapus transaksi'; del.setAttribute('aria-label', 'Hapus ' + (e.note || e.category)); del.addEventListener('click', () => deleteExpense(e)); actionTd.append(del);
      tr.append(nameTd, catTd, dateTd, amountTd, actionTd); body.append(tr);
    });
    $('#expenseCount').textContent = filtered.length + ' transaksi' + (query ? ' ditemukan' : '');
  }
  async function deleteExpense(expense) {
    if (!confirm('Hapus pengeluaran ' + (expense.note || expense.category) + ' sebesar ' + fmt(expense.amount) + '?')) return;
    try { await request('/finance', { method: 'DELETE', body: JSON.stringify({ id: expense.id }) }); await loadData(); toast('Pengeluaran berhasil dihapus.'); }
    catch (error) { toast(error.message, true); }
  }
  async function saveExpense(event) {
    event.preventDefault(); const errorEl = $('#expenseError'); errorEl.textContent = '';
    const amount = num($('#expenseAmount').value); const category = $('#expenseCategory').value; const spentOn = $('#expenseDate').value; const note = $('#expenseNote').value.trim();
    if (!amount) { errorEl.textContent = 'Nominal harus lebih dari Rp0.'; return; }
    if (!spentOn) { errorEl.textContent = 'Pilih tanggal transaksi.'; return; }
    const button = $('#saveExpense'); button.disabled = true; button.textContent = 'Menyimpan…';
    try { await request('/finance', { method: 'POST', body: JSON.stringify({ action: 'add_expense', amount, category, spentOn, note }) }); closeModals(); $('#expenseForm').reset(); await loadData(); toast('Pengeluaran berhasil dicatat.'); }
    catch (error) { errorEl.textContent = error.message; }
    finally { button.disabled = false; button.innerHTML = 'Simpan pengeluaran <span>↗</span>'; }
  }
  async function saveBudget(event) {
    event.preventDefault(); const errorEl = $('#budgetError'); errorEl.textContent = '';
    const monthlyBudget = num($('#budgetAmount').value);
    if (monthlyBudget < 10000) { errorEl.textContent = 'Anggaran minimal Rp10.000.'; return; }
    const button = $('#saveBudget'); button.disabled = true; button.textContent = 'Menyimpan…';
    try { await request('/finance', { method: 'POST', body: JSON.stringify({ action: 'set_budget', monthlyBudget }) }); closeModals(); await loadData(); toast('Anggaran bulanan diperbarui.'); }
    catch (error) { errorEl.textContent = error.message; }
    finally { button.disabled = false; button.innerHTML = 'Simpan anggaran <span>↗</span>'; }
  }
  function wireEvents() {
    $('#addExpenseTop').addEventListener('click', () => showModal('expenseModal'));
    $('#addExpenseSecondary').addEventListener('click', () => showModal('expenseModal'));
    $('#editBudget').addEventListener('click', () => showModal('budgetModal'));
    $('#expenseForm').addEventListener('submit', saveExpense); $('#budgetForm').addEventListener('submit', saveBudget);
    $('#budgetAmount').addEventListener('input', updateBudgetPreview); $('#searchExpense').addEventListener('input', renderExpenses);
    $$('[data-close]').forEach(btn => btn.addEventListener('click', closeModals));
    $$('.modal-backdrop').forEach(backdrop => backdrop.addEventListener('click', e => { if (e.target === backdrop) closeModals(); }));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModals(); $('.sidebar').classList.remove('sidebar-open'); } });
    $('#signOut').addEventListener('click', async () => { if (!confirm('Keluar dari akun BatasHarian?')) return; try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); location.href = '/login'; } catch (error) { toast('Gagal keluar dari akun.', true); } });
    $('#mobileMenu').addEventListener('click', () => $('.sidebar').classList.toggle('sidebar-open'));
    $$('.nav-item').forEach(link => link.addEventListener('click', () => $('.sidebar').classList.remove('sidebar-open')));
  }
  wireEvents(); init();
})();
