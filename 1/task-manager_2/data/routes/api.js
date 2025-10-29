// routes/api.js
const express = require('express');
const { readTasks, writeTasks } = require('../data/tasksStore');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// GET /api/tasks?filter=all|active|completed
router.get('/tasks', async (req, res) => {
  try {
    const tasks = await readTasks();
    const filter = req.query.filter || 'all';
    let result = tasks;
    if (filter === 'active') result = tasks.filter(t => !t.completed);
    if (filter === 'completed') result = tasks.filter(t => t.completed);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/tasks/:id
router.get('/tasks/:id', async (req, res) => {
  try {
    const tasks = await readTasks();
    const t = tasks.find(x => x.id === req.params.id);
    if (!t) return res.status(404).json({ error: 'Task not found' });
    res.json(t);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/tasks (multipart/form-data)
router.post('/tasks', upload.array('attachments', 5), async (req, res) => {
  try {
    const { title, description, dueDate } = req.body;
    if (!title || title.trim() === '') {
      return res.status(400).json({ error: 'Title is required' });
    }
    const tasks = await readTasks();
    const newTask = {
      id: uuidv4(),
      title: title.trim(),
      description: description || '',
      dueDate: dueDate || null,
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      attachments: (req.files || []).map(f => ({
        filename: f.filename,
        originalName: f.originalname,
        path: f.path
      }))
    };
    tasks.push(newTask);
    await writeTasks(tasks);
    res.status(201).json(newTask);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/tasks/:id - обновить поля (title, description, dueDate, completed)
// Для добавления файлов можно отправить multipart/form-data (поля + files)
router.put('/tasks/:id', upload.array('attachments', 5), async (req, res) => {
  try {
    const tasks = await readTasks();
    const idx = tasks.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Task not found' });

    const task = tasks[idx];
    const { title, description, dueDate, completed } = req.body;
    if (typeof title !== 'undefined') task.title = title;
    if (typeof description !== 'undefined') task.description = description;
    if (typeof dueDate !== 'undefined') task.dueDate = dueDate || null;
    if (typeof completed !== 'undefined') task.completed = (completed === 'true' || completed === true);

    if (req.files && req.files.length) {
      task.attachments = task.attachments.concat(req.files.map(f => ({
        filename: f.filename,
        originalName: f.originalname,
        path: f.path
      })));
    }

    task.updatedAt = new Date().toISOString();
    tasks[idx] = task;
    await writeTasks(tasks);
    res.json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/tasks/:id
router.delete('/tasks/:id', async (req, res) => {
  try {
    const tasks = await readTasks();
    const idx = tasks.findIndex(t => t.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Task not found' });

    const task = tasks[idx];
    // удаляем файлы вложений (если существуют)
    if (task.attachments && task.attachments.length) {
      for (const a of task.attachments) {
        try {
          if (a.path) await fs.unlink(a.path);
        } catch (err) {
          console.warn('Не удалось удалить файл:', a.path, err.message);
        }
      }
    }

    tasks.splice(idx, 1);
    await writeTasks(tasks);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
