const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

const dataFile = path.join(__dirname, 'data', 'tasks.json');
const uploadsDir = path.join(__dirname, 'uploads');

// ensure uploads dir exists
if (!fsSync.existsSync(uploadsDir)) {
  fsSync.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safeName = `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;
    cb(null, safeName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5 MB
});

// middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// serve SPA static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// 
async function readTasks() {
  try {
    const content = await fs.readFile(dataFile, 'utf8');
    return JSON.parse(content);
  } catch (err) {
    return [];
  }
}

async function writeTasks(tasks) {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });
  await fs.writeFile(dataFile, JSON.stringify(tasks, null, 2), 'utf8');
}

// API
// GET /api/tasks?filter=all|active|completed
app.get('/api/tasks', async (req, res) => {
  try {
    const filter = req.query.filter || 'all';
    const tasks = await readTasks();
    let result = tasks;
    if (filter === 'active') result = tasks.filter(t => !t.completed);
    if (filter === 'completed') result = tasks.filter(t => t.completed);
    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// single task
app.get('/api/tasks/:id', async (req, res) => {
  const id = req.params.id;
  const tasks = await readTasks();
  const task = tasks.find(t => t.id === id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

// POST create task (multipart/form-data, attachments field allowed)
app.post('/api/tasks', upload.array('attachments', 5), async (req, res) => {
  try {
    const { title, description, dueDate } = req.body;
    if (!title || title.trim() === '') {
      return res.status(400).json({ error: 'Title is required' });
    }
    const tasks = await readTasks();
    const files = req.files || [];

    const newTask = {
      id: uuidv4(),
      title: title.trim(),
      description: description ? description.trim() : '',
      dueDate: dueDate || null,
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      attachments: files.map(f => ({
        filename: f.filename,
        originalName: f.originalname,
        path: `/uploads/${f.filename}`
      }))
    };

    tasks.push(newTask);
    await writeTasks(tasks);

    res.status(201).json(newTask);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// PUT
// { title, description, dueDate, completed }
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { title, description, dueDate, completed } = req.body;
    const tasks = await readTasks();
    const idx = tasks.findIndex(t => t.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Task not found' });

    if (title && typeof title === 'string') tasks[idx].title = title.trim();
    if (typeof description === 'string') tasks[idx].description = description.trim();
    tasks[idx].dueDate = dueDate || null;
    if (typeof completed === 'boolean') tasks[idx].completed = completed;

    tasks[idx].updatedAt = new Date().toISOString();
    await writeTasks(tasks);

    res.status(200).json(tasks[idx]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// PATCH
app.patch('/api/tasks/:id/toggle', async (req, res) => {
  try {
    const id = req.params.id;
    const tasks = await readTasks();
    const task = tasks.find(t => t.id === id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    task.completed = !task.completed;
    task.updatedAt = new Date().toISOString();
    await writeTasks(tasks);
    res.json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to toggle task' });
  }
});

// DELETE task
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const tasks = await readTasks();
    const idx = tasks.findIndex(t => t.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Task not found' });

    const [removed] = tasks.splice(idx, 1);

    // disk
    if (removed.attachments && removed.attachments.length > 0) {
      for (const att of removed.attachments) {
        const filePath = path.join(uploadsDir, path.basename(att.filename));
        try {
          await fs.unlink(filePath);
        } catch (err) {
          console.warn('Could not delete file', filePath, err.message);
        }
      }
    }

    await writeTasks(tasks);
    res.status(200).json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// fallback: serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
