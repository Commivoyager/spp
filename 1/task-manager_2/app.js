const apiBase = '/api';

const taskForm = document.getElementById('taskForm');
const tasksContainer = document.getElementById('tasks');
let currentFilter = 'all';

async function fetchTasks() {
  const res = await fetch(`${apiBase}/tasks?filter=${currentFilter}`);
  if (!res.ok) {
    console.error('Ошибка при получении задач', res.status);
    return [];
  }
  return res.json();
}

function renderTask(t) {
  const div = document.createElement('div');
  div.className = 'task' + (t.completed ? ' completed' : '');
  div.innerHTML = `
    <h3>${escapeHtml(t.title)}</h3>
    ${t.description ? `<p>${escapeHtml(t.description)}</p>` : ''}
    <div class="meta">
      ${t.dueDate ? `<span>Срок: ${new Date(t.dueDate).toLocaleDateString()}</span> | ` : ''}
      <span>${t.completed ? 'Завершено' : 'В процессе'}</span>
      | Создано: ${new Date(t.createdAt).toLocaleString()}
    </div>
    ${t.attachments && t.attachments.length ? `<div>Вложения: ${t.attachments.map(a => `<a href="/uploads/${a.filename}" download="${a.originalName}">${escapeHtml(a.originalName)}</a>`).join(', ')}</div>` : ''}
    <div style="margin-top:8px">
      <button data-action="toggle" data-id="${t.id}">${t.completed ? 'Сделать активной' : 'Отметить как готово'}</button>
      <button data-action="delete" data-id="${t.id}">Удалить</button>
    </div>
  `;
  return div;
}

function escapeHtml(s) {
  if (!s) return '';
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function loadAndRender() {
  tasksContainer.innerHTML = '<p>Загрузка...</p>';
  const tasks = await fetchTasks();
  tasksContainer.innerHTML = '';
  if (!tasks.length) {
    tasksContainer.innerHTML = '<p>Задачи не найдены.</p>';
    return;
  }
  tasks.forEach(t => tasksContainer.appendChild(renderTask(t)));
}

taskForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(taskForm);
  const res = await fetch(`${apiBase}/tasks`, { method: 'POST', body: fd });
  if (res.status === 201) {
    taskForm.reset();
    await loadAndRender();
  } else {
    const err = await res.json().catch(()=>({error:'Ошибка'}));
    alert('Ошибка: ' + (err.error || res.statusText));
  }
});

tasksContainer.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;

  if (action === 'toggle') {
    // Получим задачу, обновим completed
    const tRes = await fetch(`${apiBase}/tasks/${id}`);
    if (!tRes.ok) { alert('Не найдено'); return; }
    const task = await tRes.json();
    const form = new FormData();
    form.append('completed', (!task.completed).toString());
    const put = await fetch(`${apiBase}/tasks/${id}`, { method: 'PUT', body: form });
    if (put.ok) await loadAndRender();
  }

  if (action === 'delete') {
    if (!confirm('Удалить задачу?')) return;
    const del = await fetch(`${apiBase}/tasks/${id}`, { method: 'DELETE' });
    if (del.ok) await loadAndRender();
  }
});

// фильтры
document.querySelectorAll('.filter').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.filter').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    loadAndRender();
  });
});

// initial
loadAndRender();
