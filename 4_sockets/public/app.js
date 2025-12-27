const API_UPLOAD = '/api/upload';
const API_AUTH_REGISTER = '/api/auth/register';
const API_AUTH_LOGIN = '/api/auth/login';
const API_AUTH_LOGOUT = '/api/auth/logout';

// DOM elements
const taskForm = document.getElementById('taskForm');
const tasksList = document.getElementById('tasksList');
const filterButtons = document.querySelectorAll('.filter-btn');
let currentFilter = 'all';

// auth UI elements
const loginModal = document.getElementById('loginModal');
const loginForm = document.getElementById('loginForm');
const loginCancel = document.getElementById('loginCancel');
const loginError = document.getElementById('loginError');

const registerModal = document.getElementById('registerModal');
const registerForm = document.getElementById('registerForm');
const registerCancel = document.getElementById('registerCancel');
const registerError = document.getElementById('registerError');
const registerSuccess = document.getElementById('registerSuccess');

const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const logoutBtn = document.getElementById('logoutBtn');

// State
let _pendingLoginResolve = null;
let socket = null;

// Set login state
function setLoginState(isLoggedIn) {
  loginBtn.style.display = isLoggedIn ? 'none' : 'inline-block';
  registerBtn.style.display = isLoggedIn ? 'none' : 'inline-block';
  logoutBtn.style.display = isLoggedIn ? 'inline-block' : 'none';
}

// Prompt login modal
function promptLogin() {
  if (_pendingLoginResolve) {
    return new Promise((resolve) => {
      const prev = _pendingLoginResolve;
      _pendingLoginResolve = (v) => { prev(v); resolve(v); };
    });
  } 
  
  return new Promise((resolve) => {
    _pendingLoginResolve = resolve;
    loginError.style.display = 'none';
    loginForm.reset();
    loginModal.style.display = 'flex';
    document.getElementById('loginUsername').focus();
  });
}

// Hide login modal
function hideLoginModal(ok = false) {
  loginModal.style.display = 'none';
  if (_pendingLoginResolve) {
    _pendingLoginResolve(ok);
    _pendingLoginResolve = null;
  }
}

// Connect to Socket.IO
function connectSocket() {
  if (socket) {
    try { 
      socket.disconnect(); 
    } catch (e) {
      console.warn('Error disconnecting socket:', e);
    }
  }
  
  socket = io({ 
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
  });

  socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
    renderTasks();
  });

  // real-time updates from other tabs
  socket.on('taskCreated', (data) => {
    // можно оптимально добавить только новую задачу в DOM,
    // но безопаснее просто перерендерить список:
    renderTasks();
  });

  socket.on('taskUpdated', (data) => {
    renderTasks();
  });

  socket.on('taskDeleted', (data) => {
    renderTasks();
  });

  socket.on('connect_error', async (err) => {
    console.warn('Socket connection error:', err.message);
    if (err.message === 'Unauthorized') {
      setLoginState(false);
      const ok = await promptLogin();
      if (ok) {
        connectSocket();
      }
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
  });

  return socket;
}

// Socket emit with timeout and retry
function socketEmit(event, payload = {}, retry = true) {
  return new Promise((resolve, reject) => {
    if (!socket || !socket.connected) {
      connectSocket();
      setTimeout(() => {
        if (!socket.connected) {
          reject(new Error('Socket not connected'));
          return;
        }
        executeEmit();
      }, 500);
    } else {
      executeEmit();
    }

    function executeEmit() {
      socket.timeout(10000).emit(event, payload, async (err, response) => {
        if (err) {
          if (err === 'Unauthorized' || (response && response.error === 'Unauthorized')) {
            if (retry) {
              const ok = await promptLogin();
              if (ok) {
                connectSocket();
                try {
                  const r2 = await socketEmit(event, payload, false);
                  return resolve(r2);
                } catch (e2) {
                  return reject(e2);
                }
              } else {
                setLoginState(false);
                return reject(new Error('Unauthorized'));
              }
            } else {
              setLoginState(false);
              return reject(new Error('Unauthorized'));
            }
          }
          return reject(new Error(err || 'Socket error'));
        }
        
        if (response && response.error) {
          return reject(new Error(response.error));
        }
        
        return resolve(response);
      });
    }
  });
}

// Format date
function formatDate(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  return d.toLocaleString('ru-RU');
}

// Create task element
function createTaskElement(task) {
  const tmpl = document.getElementById('taskTemplate');
  const el = tmpl.content.firstElementChild.cloneNode(true);

  el.dataset.id = task.id;
  el.querySelector('.task-title').textContent = task.title;
  el.querySelector('.task-desc').textContent = task.description || '';
  el.querySelector('.due-date').textContent = task.dueDate ? 
    `Дата завершения: ${new Date(task.dueDate).toLocaleDateString('ru-RU')}` : '';
  el.querySelector('.task-status').textContent = task.completed ? 'Завершено' : 'В процессе';
  el.querySelector('.task-date').textContent = `Создано: ${formatDate(task.createdAt)}`;

  const toggleBtn = el.querySelector('.btn-toggle');
  toggleBtn.textContent = task.completed ? '✓' : '○';
  toggleBtn.classList.toggle('completed', task.completed);
  toggleBtn.addEventListener('click', () => toggleTask(task.id, el));

  const deleteBtn = el.querySelector('.btn-delete');
  deleteBtn.addEventListener('click', () => deleteTask(task.id, el));

  // Attachments
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

// Fetch tasks
async function fetchTasks() {
  try {
    const response = await socketEmit('getTasks', { filter: currentFilter });
    return response.tasks || [];
  } catch (err) {
    console.error('Failed to fetch tasks:', err);
    return [];
  }
}

// Render tasks
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

// Create task
taskForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('title').value.trim();
  if (!title) { 
    alert('Название задачи обязательно'); 
    return; 
  }
  
  const description = document.getElementById('description').value || '';
  const dueDate = document.getElementById('dueDate').value || '';
  const files = document.getElementById('attachments').files;

  try {
    let attachments = [];
    
    // Upload files if any
    if (files.length > 0) {
      const fd = new FormData();
      fd.append('title', title);
      fd.append('description', description);
      fd.append('dueDate', dueDate);
      
      for (let i = 0; i < Math.min(files.length, 5); i++) {
        fd.append('attachments', files[i]);
      }

      const upRes = await fetch(API_UPLOAD, {
        method: 'POST',
        body: fd,
        credentials: 'include'
      });
      
      if (!upRes.ok) {
        const err = await upRes.json().catch(() => ({ error: 'Ошибка' }));
        alert('Ошибка загрузки файлов: ' + (err.error || upRes.status));
        return;
      }
      
      const js = await upRes.json();
      attachments = js.attachments || [];
    }
    
    // Create task via socket
    const payload = {
      title,
      description,
      dueDate: dueDate || null,
      attachments
    };
    
    const resp = await socketEmit('createTask', payload);
    taskForm.reset();
    await renderTasks();
  } catch (err) {
    console.error(err);
    alert('Ошибка при создании задачи: ' + err.message);
  }
});

// Toggle task
async function toggleTask(id, element) {
  try {
    const resp = await socketEmit('toggleTask', { id });
    const updated = resp.task;
    const newEl = createTaskElement(updated);
    element.replaceWith(newEl);
  } catch (err) { 
    console.error(err);
    alert('Не удалось переключить статус: ' + err.message); 
  }
}

// Delete task
async function deleteTask(id, element) {
  if (!confirm('Удалить задачу?')) return;
  try {
    await socketEmit('deleteTask', { id });
    element.remove();
  } catch (err) { 
    console.error(err);
    alert('Ошибка удаления: ' + err.message); 
  }
}

// Filters
filterButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    filterButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderTasks();
  });
});

// Login form
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.style.display = 'none';
  
  const form = new FormData(loginForm);
  const body = { 
    username: form.get('username'), 
    password: form.get('password') 
  };
  
  try {
    const res = await fetch(API_AUTH_LOGIN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'include'
    });
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Ошибка' }));
      loginError.textContent = err.error || 'Ошибка входа';
      loginError.style.display = 'block';
      return;
    }
    
    hideLoginModal(true);
    setLoginState(true);
    connectSocket();
    await renderTasks();
  } catch (err) {
    loginError.textContent = 'Ошибка сети';
    loginError.style.display = 'block';
  }
});

loginCancel.addEventListener('click', () => hideLoginModal(false));
loginBtn.addEventListener('click', () => promptLogin());

// Register form
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
  const body = { 
    username: f.get('username'), 
    password: f.get('password') 
  };
  
  try {
    const res = await fetch(API_AUTH_REGISTER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Ошибка' }));
      registerError.textContent = err.error || 'Ошибка регистрации';
      registerError.style.display = 'block';
      return;
    }
    
    registerSuccess.textContent = 'Успешно. Вход...';
    registerSuccess.style.display = 'block';

    // Auto login after registration
    const loginRes = await fetch(API_AUTH_LOGIN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'include'
    });
    
    if (loginRes.ok) {
      registerModal.style.display = 'none';
      setLoginState(true);
      if (_pendingLoginResolve) { 
        _pendingLoginResolve(true); 
        _pendingLoginResolve = null; 
      }
      
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

// Logout
logoutBtn.addEventListener('click', async () => {
  try { 
    await fetch(API_AUTH_LOGOUT, { 
      method: 'POST', 
      credentials: 'include' 
    }); 
  } catch (_) {}
  
  setLoginState(false);
  if (socket) {
    try { 
      socket.disconnect(); 
    } catch (e) {}
  }
  
  await renderTasks();
});

// Initialize
(async () => {
  try {
    // Initial state
    setLoginState(false);
    
    // Try to connect socket (will prompt login if not authenticated)
    connectSocket();
  } catch (err) {
    console.log('Initialization failed:', err);
  }
})();