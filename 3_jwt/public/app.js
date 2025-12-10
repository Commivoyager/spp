const API_BASE = '/api/tasks';
// Получение элемента формы из HTML для обработки отправки
const taskForm = document.getElementById('taskForm');
// получение в контейнер (из <ul>) для отображения списка задач
const tasksList = document.getElementById('tasksList');
// найти все кнопки (эл-нты класса .filter-btn)
const filterButtons = document.querySelectorAll('.filter-btn');
let currentFilter = 'all';

// auth UI elements
// модальное окно входа
const loginModal = document.getElementById('loginModal');
const loginForm = document.getElementById('loginForm');
const loginCancel = document.getElementById('loginCancel');
// эл-нт для отображения ошибок
const loginError = document.getElementById('loginError');

const registerModal = document.getElementById('registerModal');
const registerForm = document.getElementById('registerForm');
const registerCancel = document.getElementById('registerCancel');
const registerError = document.getElementById('registerError');
// эл-нт сообщения об успешной регистрации
const registerSuccess = document.getElementById('registerSuccess');

const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const logoutBtn = document.getElementById('logoutBtn');

// ожидание результата логина
let _pendingLoginResolve = null;

function setLoginState(isLoggedIn) {
  loginBtn.style.display = isLoggedIn ? 'none' : '';
  registerBtn.style.display = isLoggedIn ? 'none' : '';
  logoutBtn.style.display = isLoggedIn ? '' : 'none';
}

setLoginState(false);

// универсальный fetch с куки, retry
async function apiFetch(url, opts = {}, retry = true) {
  opts = Object.assign({}, opts); // клон, чтобы не мутировать внешний объект
  opts.credentials = 'include';
  try {
    const res = await fetch(url, opts);
    if (res.status === 401) {
      const ok = await promptLogin();
      if (ok && retry)
      {
         return apiFetch(url, opts, false);
      }
      else{
        setLoginState(false);
        throw new Error('Unauthorized');
      }
    }
    return res;
  } catch (err) {
    throw err;
  }
}

// показать модальное окно логина либо дождаться ответа 
function promptLogin() {
  // прооверка, открыто ли модальное окно
  if (_pendingLoginResolve) {
    return new Promise((resolve) => {
      const prev = _pendingLoginResolve;
      _pendingLoginResolve = (v) => { prev(v); resolve(v); };
    });
  } 
  return new Promise((resolve) => {
    _pendingLoginResolve = resolve;
    loginError.style.display = 'none';
    // сброс формы
    loginForm.reset();
    loginModal.style.display = 'flex';
    // показывается модальное окно
    document.getElementById('loginUsername').focus();
  });
}
function hideLoginModal(ok = false) {
  loginModal.style.display = 'none';
  if (_pendingLoginResolve) {
    _pendingLoginResolve(ok);
    _pendingLoginResolve = null;
  }
}

// login form submit
loginForm.addEventListener('submit', async (e) => {
  // отмена стандартной перезагрузки страницы по форме
  e.preventDefault();
  loginError.style.display = 'none';
  // сбор данных из формы
  const form = new FormData(loginForm);
  const body = { username: form.get('username'), password: form.get('password') };
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'include'
    });
    if (!res.ok) {
      // попытка чтения json с ошибкой
      const err = await res.json().catch(()=>({error:'Ошибка'}));
      loginError.textContent = err.error || 'Ошибка входа';
      // чтобы стал видимым
      loginError.style.display = 'block';
      return;
    }
    hideLoginModal(true);
    // обновить UI
    setLoginState(true);
    await renderTasks();
  } catch (err) {
    loginError.textContent = 'Ошибка сети';
    loginError.style.display = 'block';
  }
});
loginCancel.addEventListener('click', () => hideLoginModal(false));
// then - обработка результата
loginBtn.addEventListener('click', () => promptLogin().then(ok => { if (!ok) { /**/ } }));

// register UI
registerBtn.addEventListener('click', () => {
  registerError.style.display = 'none';
  registerSuccess.style.display = 'none';
  registerForm.reset();
  registerModal.style.display = 'flex';
  document.getElementById('regUsername').focus();
});
registerCancel.addEventListener('click', () => registerModal.style.display = 'none');

registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  registerError.style.display = 'none';
  registerSuccess.style.display = 'none';
  const f = new FormData(registerForm);
  const body = { username: f.get('username'), password: f.get('password') };
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json().catch(()=>({error:'Ошибка'}));
      registerError.textContent = err.error || 'Ошибка регистрации';
      registerError.style.display = 'block';
      return;
    }
    registerSuccess.textContent = 'Успешно. Вход...';
    registerSuccess.style.display = 'block';

    // Авто-вход после регистрации
    const loginRes = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'include'
    });
    if (loginRes.ok) {
      registerModal.style.display = 'none';
      setLoginState(true);
      if (_pendingLoginResolve) { _pendingLoginResolve(true); _pendingLoginResolve = null; }
      await renderTasks();
    } else {
      registerSuccess.style.display = 'none';
      registerError.textContent = 'Зарегистрировано, но не удалось автоматически войти.';
      registerError.style.display = 'block';
    }
  } catch (err) {
    registerError.textContent = 'Ошибка сети';
    registerError.style.display = 'block';
  }
});

// logout
logoutBtn.addEventListener('click', async () => {
  try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch (_) {}
  setLoginState(false);
  await renderTasks();
});



//
// извлечение данных
async function fetchTasks() {
  // реализованная функция для авторизированных запросов
  const res = await apiFetch(`/api/tasks?filter=${currentFilter}`);
  if (!res.ok) {
    console.error('Failed to load tasks', res.status);
    return [];
  }

  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    // если пришло не JSON — покажем тело для отладки и вернём пустой массив
    const text = await res.text().catch(()=>null);
    console.error('Expected JSON from /api/tasks but got:', ct, text);
    return [];
  }

  try {
    return await res.json();
  } catch (e) {
    console.error('JSON parse error for /api/tasks', e);
    return [];
  }
}

function formatDate(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  return d.toLocaleString('ru-RU');
}

// создание DOM‑элемента задачи
function createTaskElement(task) {
  // берётся html шаблон задачи 
  const tmpl = document.getElementById('taskTemplate');
  // копия первого дочернего эл-нта
  const el = tmpl.content.firstElementChild.cloneNode(true);

  el.dataset.id = task.id;
  el.querySelector('.task-title').textContent = task.title;
  el.querySelector('.task-desc').textContent = task.description || '';
  el.querySelector('.due-date').textContent = task.dueDate ? `Дата завершения: ${new Date(task.dueDate).toLocaleDateString('ru-RU')}` : '';
  el.querySelector('.task-status').textContent = task.completed ? 'Завершено' : 'В процессе';
  el.querySelector('.task-date').textContent = `Создано: ${formatDate(task.createdAt)}`;

  const toggleBtn = el.querySelector('.btn-toggle');
  toggleBtn.textContent = task.completed ? '✓' : '○';
  toggleBtn.classList.toggle('completed', task.completed);
  toggleBtn.addEventListener('click', () => toggleTask(task.id, el));

  const deleteBtn = el.querySelector('.btn-delete');
  deleteBtn.addEventListener('click', () => deleteTask(task.id, el));

  // создание ссылок для файлов
  const attachmentsList = el.querySelector('.attachments-list');
  attachmentsList.innerHTML = '';
  if (task.attachments && task.attachments.length) {
    task.attachments.forEach(att => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = att.path;
      a.download = att.originalName || att.filename;
      a.textContent = `📎 ${att.originalName || att.filename}`;
      li.appendChild(a);
      attachmentsList.appendChild(li);
    });
  }

  if (task.completed) el.classList.add('completed');

  return el;
}

async function renderTasks() {
  tasksList.innerHTML = '<p>Загрузка...</p>';
  try {
    const tasks = await fetchTasks();
    tasksList.innerHTML = '';
    if (tasks.length === 0) {
      tasksList.innerHTML = '<p>Задачи не найдены.</p>';
      return;
    }
    tasks.forEach(task => {
      const node = createTaskElement(task);
      tasksList.appendChild(node);
    });
  } catch (err) {
    tasksList.innerHTML = '<p>Ошибка загрузки задач.</p>';
    console.error(err);
  }
}

// create task
taskForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData();
  const title = document.getElementById('title').value.trim();
  if (!title) { alert('Название задачи обязательно'); return; }
  fd.append('title', title);
  fd.append('description', document.getElementById('description').value || '');
  fd.append('dueDate', document.getElementById('dueDate').value || '');

  const files = document.getElementById('attachments').files;
  for (let i = 0; i < Math.min(files.length, 5); i++) fd.append('attachments', files[i]);

  try {
    const res = await apiFetch(API_BASE, { method: 'POST', body: fd });
    if (!res.ok) {
      const err = await res.json().catch(()=>({error:'error'}));
      alert('Ошибка: ' + (err.error || res.status));
      return;
    }
    taskForm.reset();
    await renderTasks();
  } catch (err) {
    console.error(err);
    alert('Ошибка при создании задачи');
  }
});

async function toggleTask(id, element) {
  try {
    const res = await apiFetch(`${API_BASE}/${id}/toggle`, { method: 'PATCH' });
    if (!res.ok) { alert('Не удалось переключить статус'); return; }
    const updated = await res.json();
    const newEl = createTaskElement(updated);
    element.replaceWith(newEl);
  } catch (err) { console.error(err); }
}

async function deleteTask(id, element) {
  if (!confirm('Удалить задачу?')) return;
  try {
    const res = await apiFetch(`${API_BASE}/${id}`, { method: 'DELETE' });
    if (!res.ok) { alert('Ошибка удаления'); return; }
    element.remove();
  } catch (err) { console.error(err); }
}

// filters
filterButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    // css стиль active
    filterButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderTasks();
  });
});


(async () => {
  // если не зарегистрирован => модальное окно логина
  try {
    await renderTasks();
  } catch (_) {}
})();
