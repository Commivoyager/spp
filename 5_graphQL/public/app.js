const API_BASE = '/graphql';
const taskForm = document.getElementById('taskForm');
const tasksList = document.getElementById('tasksList');
const filterButtons = document.querySelectorAll('.filter-btn');
let currentFilter = 'all';

// Auth UI elements
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

let _pendingLoginResolve = null;

function setLoginState(isLoggedIn) {
  loginBtn.style.display = isLoggedIn ? 'none' : '';
  registerBtn.style.display = isLoggedIn ? 'none' : '';
  logoutBtn.style.display = isLoggedIn ? '' : 'none';
}

setLoginState(false);

// GraphQL helper function
async function graphqlFetch(query, variables = {}, retry = true) {
  const opts = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ query, variables }),
  };

  try {
    const res = await fetch(API_BASE, opts);
    
    if (res.status === 401) {
      const ok = await promptLogin();
      if (ok && retry) {
        return graphqlFetch(query, variables, false);
      } else {
        setLoginState(false);
        throw new Error('Unauthorized');
      }
    }

    const result = await res.json();
    
    if (result.errors) {
      throw new Error(result.errors[0].message);
    }
    
    return result.data;
  } catch (err) {
    throw err;
  }
}

// Показ модального окна логина
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

function hideLoginModal(ok = false) {
  loginModal.style.display = 'none';
  if (_pendingLoginResolve) {
    _pendingLoginResolve(ok);
    _pendingLoginResolve = null;
  }
}

// Отправка формы логина
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.style.display = 'none';
  
  const form = new FormData(loginForm);
  const username = form.get('username');
  const password = form.get('password');

  const query = `
    mutation Login($username: String!, $password: String!) {
      login(username: $username, password: $password) {
        message
      }
    }
  `;

  try {
    await graphqlFetch(query, { username, password }, false);
    hideLoginModal(true);
    setLoginState(true);
    await renderTasks();
  } catch (err) {
    loginError.textContent = err.message || 'Ошибка входа';
    loginError.style.display = 'block';
  }
});

loginCancel.addEventListener('click', () => hideLoginModal(false));
loginBtn.addEventListener('click', () => promptLogin().then(ok => { if (!ok) {  } }));

// Register UI
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
  const username = f.get('username');
  const password = f.get('password');

  const registerQuery = `
    mutation Register($username: String!, $password: String!) {
      register(username: $username, password: $password) {
        message
      }
    }
  `;

  const loginQuery = `
    mutation Login($username: String!, $password: String!) {
      login(username: $username, password: $password) {
        message
      }
    }
  `;

  try {
    await graphqlFetch(registerQuery, { username, password }, false);
    registerSuccess.textContent = 'Успешно. Вход...';
    registerSuccess.style.display = 'block';

    // Auto-login after registration
    try {
      await graphqlFetch(loginQuery, { username, password }, false);
      registerModal.style.display = 'none';
      setLoginState(true);
      if (_pendingLoginResolve) {
        _pendingLoginResolve(true);
        _pendingLoginResolve = null;
      }
      await renderTasks();
    } catch (loginErr) {
      registerSuccess.style.display = 'none';
      registerError.textContent = 'Зарегистрировано, но не удалось войти.';
      registerError.style.display = 'block';
    }
  } catch (err) {
    registerError.textContent = err.message || 'Ошибка регистрации';
    registerError.style.display = 'block';
  }
});

// Logout
logoutBtn.addEventListener('click', async () => {
  const query = `
    mutation {
      logout {
        message
      }
    }
  `;
  
  try {
    await graphqlFetch(query);
  } catch (_) {}
  
  setLoginState(false);
  await renderTasks();
});

// Fetch tasks
async function fetchTasks() {
  const query = `
    query Tasks($filter: String) {
      tasks(filter: $filter) {
        id
        title
        description
        dueDate
        completed
        createdAt
        updatedAt
        attachments {
          filename
          originalName
          path
        }
        ownerId
      }
    }
  `;

  const data = await graphqlFetch(query, { filter: currentFilter });
  return data.tasks || [];
}

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

  // File attachments
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
      
      // Add remove button for each attachment
      const removeBtn = document.createElement('button');
      removeBtn.textContent = '×';
      removeBtn.className = 'btn-remove-attachment';
      removeBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await removeAttachment(task.id, att.filename);
      });
      li.appendChild(removeBtn);
      
      attachmentsList.appendChild(li);
    });
  }

  // Add attachment upload form
  const uploadForm = document.createElement('form');
  uploadForm.className = 'attachment-upload';
  uploadForm.innerHTML = `
    <input type="file" class="file-input" multiple>
    <button type="submit" class="btn btn-small">Добавить файл</button>
  `;
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = uploadForm.querySelector('.file-input');
    await uploadAttachment(task.id, fileInput.files);
    fileInput.value = '';
  });
  el.querySelector('.task-meta').after(uploadForm);

  if (task.completed) el.classList.add('completed');

  return el;
}

// Upload attachment
async function uploadAttachment(taskId, files) {
  if (!files.length) return;
  
  const formData = new FormData();
  for (let i = 0; i < Math.min(files.length, 5); i++) {
    formData.append('attachments', files[i]);
  }
  
  try {
    const res = await fetch(`/api/tasks/${taskId}/upload`, {
      method: 'POST',
      body: formData,
      credentials: 'include'
    });
    
    if (!res.ok) throw new Error('Upload failed');
    
    await renderTasks();
  } catch (err) {
    console.error('Upload error:', err);
    alert('Ошибка при загрузке файлов');
  }
}

// Remove attachment (использует отдельную мутацию removeAttachment)
async function removeAttachment(taskId, filename) {
  if (!confirm('Удалить файл?')) return;

  const mutation = `
    mutation RemoveAttachment($taskId: ID!, $filename: String!) {
      removeAttachment(taskId: $taskId, filename: $filename) {
        id
        attachments {
          filename
          originalName
          path
        }
        updatedAt
      }
    }
  `;

  try {
    const result = await graphqlFetch(mutation, { taskId, filename });
    if (!result || !result.removeAttachment) {
      throw new Error('Сервер не вернул обновлённую задачу');
    }
    // Перерисовать список задач, чтобы отобразить изменения
    await renderTasks();
  } catch (err) {
    console.error('Remove attachment error:', err);
    alert('Ошибка при удалении файла: ' + (err.message || err));
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

  const query = `
    mutation CreateTask($input: TaskInput!) {
      createTask(input: $input) {
        id
        title
        description
        dueDate
        completed
        createdAt
        attachments {
          filename
        }
      }
    }
  `;

  try {
    const result = await graphqlFetch(query, {
      input: { title, description, dueDate }
    });

    // Upload files if any
    if (files.length > 0) {
      const taskId = result.createTask.id;
      await uploadAttachment(taskId, files);
    }

    taskForm.reset();
    await renderTasks();
  } catch (err) {
    alert('Ошибка: ' + err.message);
  }
});

// Toggle task
async function toggleTask(id, element) {
  const query = `
    mutation ToggleTask($id: ID!) {
      toggleTask(id: $id) {
        id
        title
        description
        dueDate
        completed
        updatedAt
        attachments {
          filename
          originalName
          path
        }
      }
    }
  `;

  try {
    const result = await graphqlFetch(query, { id });
    const newEl = createTaskElement(result.toggleTask);
    element.replaceWith(newEl);
  } catch (err) {
    alert('Не удалось переключить статус: ' + err.message);
  }
}

// Delete task
async function deleteTask(id, element) {
  if (!confirm('Удалить задачу?')) return;
  
  const query = `
    mutation DeleteTask($id: ID!) {
      deleteTask(id: $id)
    }
  `;

  try {
    await graphqlFetch(query, { id });
    element.remove();
  } catch (err) {
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

// Initialize
(async () => {
  try {
    await renderTasks();
  } catch (_) {}
})();