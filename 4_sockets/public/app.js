const API_UPLOAD = '/api/upload';
const API_AUTH_REGISTER = '/api/auth/register';
const API_AUTH_LOGIN = '/api/auth/login';
const API_AUTH_LOGOUT = '/api/auth/logout';

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
let socket = null;


// показать модальное окно логина либо дождаться ответа 
function promptLogin() {
  // если модальное окно открыто
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

function connectSocket() {
  // для избежания дублирующих соединений
  if (socket) try { socket.close(); } catch (e) {}
  // включает куки для рукопожатия
  socket = io({ withCredentials: true });

  socket.on('connect', () => {
    // при успешном коннекте - просто лог 
    console.log('socket connected', socket.id);
  });

  socket.on('connect_error', async (err) => {
    console.warn('socket connect_error', err && err.message);
    if (err && err.message === 'Unauthorized') {
      // когда пользователь не авторизирован
      const ok = await promptLogin();
      if (ok) {
        // after login, re-create socket connection
        connectSocket();
      }
    } else {
      // other errors: log
      console.error('Socket error', err);
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('socket disconnected', reason);
  });

  return socket;
}

function socketEmit(event, payload = {}, retry = true) {
  return new Promise((resolve, reject) => {
    if (!socket || socket.disconnected) {
      connectSocket();
    }
    try {
      // отправка события отправляем событие event с данными payload
      // сервер должен вызвать callback и передать response
      socket.timeout(10000).emit(event, payload, async (response) => {
        if (!response) return reject(new Error('No response'));
        if (response.error) {
          if (response.error === 'Unauthorized' || response.code === 401) {
            if (retry) {
              const ok = await promptLogin();
              if (ok) {
                // reconnect and retry once
                connectSocket();
                try {
                  const r2 = await socketEmit(event, payload, false);
                  return resolve(r2);
                } catch (e2) {
                  return reject(e2);
                }
              } else {
                return reject(new Error('Unauthorized'));
              }
            } else {
              return reject(new Error('Unauthorized'));
            }
          }
          return reject(new Error(response.error || 'Error'));
        }
        // успешное завершение с ответом
        return resolve(response);
      });
    } catch (err) {
      // отклонение Promise
      reject(err);
    }
  });
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
    const resp = await socketEmit('getTasks', { filter: currentFilter });
    if (!resp.ok) {
      tasksList.innerHTML = '<p>Ошибка загрузки задач.</p>';
      return;
    }
    const tasks = resp.tasks || [];
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
  const title = document.getElementById('title').value.trim();
  if (!title) { alert('Название задачи обязательно'); return; }
  const fd = new FormData();
  fd.append('title', title);
  fd.append('description', document.getElementById('description').value || '');
  fd.append('dueDate', document.getElementById('dueDate').value || '');

  const files = document.getElementById('attachments').files;
  for (let i = 0; i < Math.min(files.length, 5); i++) fd.append('attachments', files[i]);

  try {
    // отправка файлов
    let attachments = [];
    if (files.length > 0) {
      const upRes = await fetch(API_UPLOAD, {
        method: 'POST',
        body: fd,
        credentials: 'include'
      });
      if (!upRes.ok) {
        const err = await upRes.json().catch(()=>({error:'Ошибка'}));
        alert('Ошибка загрузки файлов: ' + (err.error || upRes.status));
        return;
      }
      const js = await upRes.json();
      attachments = js.attachments || [];
    } else {
      // no files, still prepare payload
      attachments = [];
    }
    
    // созднание таски через сокет
    const payload = {
      title,
      description: document.getElementById('description').value || '',
      dueDate: document.getElementById('dueDate').value || null,
      attachments
    };
    const resp = await socketEmit('createTask', payload);
    if (!resp.ok) {
      alert('Ошибка: ' + (resp.error || 'Не удалось создать задачу'));
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
    const resp = await socketEmit('toggleTask', { id });
    if (!resp.ok) { alert('Не удалось переключить статус'); return; }
    const updated = resp.task;
    const newEl = createTaskElement(updated);
    element.replaceWith(newEl);
  } catch (err) { console.error(err); }
}

async function deleteTask(id, element) {
  if (!confirm('Удалить задачу?')) return;
  try {
    const resp = await socketEmit('deleteTask', { id });
    if (!resp.ok) { alert('Ошибка удаления'); return; }
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


// login form submit
loginForm.addEventListener('submit', async (e) => {
  // отмена стандартной перезагрузки страницы по форме
  e.preventDefault();
  loginError.style.display = 'none';
  // сбор данных из формы
  const form = new FormData(loginForm);
  const body = { username: form.get('username'), password: form.get('password') };
  try {
    const res = await fetch(API_AUTH_LOGIN, {
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
    loginBtn.style.display = 'none';
    registerBtn.style.display = 'none';
    logoutBtn.style.display = '';
    connectSocket();
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
    const res = await fetch(API_AUTH_REGISTER, {
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
    const loginRes = await fetch(API_AUTH_LOGIN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'include'
    });
    if (loginRes.ok) {
      registerModal.style.display = 'none';
      loginBtn.style.display = 'none';
      registerBtn.style.display = 'none';
      logoutBtn.style.display = '';
      // для ожидающих Promise - успешное завершение
      if (_pendingLoginResolve) { _pendingLoginResolve(true); _pendingLoginResolve = null; }
      
      connectSocket();
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
  try {
    await fetch(API_AUTH_LOGOUT, { method: 'POST', credentials: 'include' });
  } catch (_) {}
  loginBtn.style.display = '';
  registerBtn.style.display = '';
  logoutBtn.style.display = 'none';
  if (socket) try { socket.close(); } catch (e) {}
  await renderTasks();
});


(async () => {
  // если не зарегистрирован => модальное окно логина
  try {
    await renderTasks();
  } catch (_) {}
})();
