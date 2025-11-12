const API_BASE = '/api/tasks';
const taskForm = document.getElementById('taskForm');
const tasksList = document.getElementById('tasksList');
const filterButtons = document.querySelectorAll('.filter-btn');
let currentFilter = 'all';

async function fetchTasks() {
  const res = await fetch(`${API_BASE}?filter=${currentFilter}`);
  if (!res.ok) {
    console.error('Failed to load tasks');
    return [];
  }
  return res.json();
}

function formatDate(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  return d.toLocaleString('ru-RU');
}

function createTaskElement(task) {
  const tmpl = document.getElementById('taskTemplate');
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

taskForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData();
  const title = document.getElementById('title').value.trim();
  if (!title) {
    alert('Название задачи обязательно');
    return;
  }
  fd.append('title', title);
  fd.append('description', document.getElementById('description').value || '');
  fd.append('dueDate', document.getElementById('dueDate').value || '');

  const files = document.getElementById('attachments').files;
  for (let i = 0; i < Math.min(files.length, 5); i++) {
    fd.append('attachments', files[i]);
  }

  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      body: fd
    });
    if (!res.ok) {
      const err = await res.json().catch(()=>({error:'error'}));
      alert('Ошибка: ' + (err.error || res.status));
      return;
    }
    // clear form
    taskForm.reset();
    await renderTasks();
  } catch (err) {
    console.error(err);
    alert('Ошибка при создании задачи');
  }
});

async function toggleTask(id, element) {
  try {
    const res = await fetch(`${API_BASE}/${id}/toggle`, { method: 'PATCH' });
    if (!res.ok) {
      alert('Не удалось переключить статус');
      return;
    }
    const updated = await res.json();
    // обновим элемент на странице
    const newEl = createTaskElement(updated);
    element.replaceWith(newEl);
  } catch (err) {
    console.error(err);
  }
}

async function deleteTask(id, element) {
  if (!confirm('Удалить задачу?')) return;
  try {
    const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      alert('Ошибка удаления');
      return;
    }
    element.remove();
  } catch (err) {
    console.error(err);
  }
}

// filters
filterButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    filterButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderTasks();
  });
});

// initial load
renderTasks();
