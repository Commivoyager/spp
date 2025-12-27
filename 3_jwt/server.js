const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'tasks.json');
const usersFile = path.join(dataDir, 'users.json');
const uploadsDir = path.join(__dirname, 'uploads');
const secretFile = path.join(dataDir, 'jwt-secret.txt');

const JWT_EXPIRES = '15s';

function expiryToMs(exp) {
  if (typeof exp === 'number') return exp * 1000;
  if (typeof exp === 'string') {
    const m = exp.match(/^(\d+)(s|m|h)?$/);
    if (!m) return 60 * 1000;
    const val = Number(m[1]);
    const unit = m[2] || 's';
    switch (unit) {
      case 's': return val * 1000;
      case 'm': return val * 60 * 1000;
      case 'h': return val * 60 * 60 * 1000;
      default: return val * 1000;
    }
  }
  return 60 * 1000;
}

// ensure dirs
if (!fsSync.existsSync(uploadsDir)) fsSync.mkdirSync(uploadsDir, { recursive: true });
if (!fsSync.existsSync(dataDir)) fsSync.mkdirSync(dataDir, { recursive: true });

// multer — middleware для Express: сохраняем в uploads/<userId>/...
// настройка хранения файлов на диске
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // req.user должен быть установлен authMiddleware перед вызовом multer
    const uid = (req && req.user && req.user.id) ? req.user.id : 'anonymous';
    const userDir = path.join(uploadsDir, uid);
    try {
      if (!fsSync.existsSync(userDir)) fsSync.mkdirSync(userDir, { recursive: true });
    } catch (e) {
      // ignore
    }
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`);
  }
});

// app.post('/upload', ...
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// middlewares
// psrsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));


// disable caching for API
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});



async function readJsonSafe(file) {
  try {
    const content = await fs.readFile(file, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    return [];
  }
}
async function writeJsonSafe(file, obj) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(obj, null, 2), 'utf8');
}

async function readTasks() { return readJsonSafe(dataFile); }
async function writeTasks(tasks) { return writeJsonSafe(dataFile, tasks); }

async function readUsers() { return readJsonSafe(usersFile); }
async function writeUsers(users) { return writeJsonSafe(usersFile, users); }

// 128 symbols
async function getJwtSecret() {
  try {
    const secret = await fs.readFile(secretFile, 'utf8');
    if (secret && secret.trim().length >= 32) return secret.trim();
    // else regenerate
  } catch (e) {}
  const newSecret = crypto.randomBytes(64).toString('hex');
  await fs.mkdir(path.dirname(secretFile), { recursive: true });
  await fs.writeFile(secretFile, newSecret, 'utf8');
  if (process.platform !== 'win32') {
    try { await fs.chmod(secretFile, 0o600); } catch (_) {}
  }
  return newSecret;
}

// Auth middleware
function makeAuthMiddleware(JWT_SECRET) {
  return function authMiddleware(req, res, next) {
    try {
      const token = req.cookies && req.cookies.token;
      if (!token) return res.status(401).json({ error: 'Unauthorized' });

      jwt.verify(token, JWT_SECRET, (err, payload) => {
        if (err) {
          const msg = (err.name === 'TokenExpiredError') ? 'Token expired' : 'Invalid token';
          return res.status(401).json({ error: msg });
        }
        // для последующих handler-ов (multer, handlers)
        req.user = { id: payload.id, username: payload.username };
        next();
      });
    } catch (err) {
      console.error('Auth error', err);
      res.status(401).json({ error: 'Unauthorized' });
    }
  };
}


app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });

    const users = await readUsers();
    if (users.find(u => u.username === username)) return res.status(409).json({ error: 'User exists' });

    const hash = await bcrypt.hash(password, 10);
    const newUser = { id: uuidv4(), username, passwordHash: hash, createdAt: new Date().toISOString() };
    users.push(newUser);
    await writeUsers(users);
    res.status(201).json({ message: 'Registered' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });

    const users = await readUsers();
    const user = users.find(u => u.username === username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, username: user.username }, app.locals.JWT_SECRET, { expiresIn: JWT_EXPIRES });
    const cookieMs = expiryToMs(JWT_EXPIRES);

    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: cookieMs,
      secure: process.env.NODE_ENV === 'production'
    });

    res.json({ message: 'OK' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

function mountProtectedRoutes() {
  const authMiddleware = makeAuthMiddleware(app.locals.JWT_SECRET);
  // protect API tasks
  app.use('/api/tasks', authMiddleware);

  app.get('/uploads/:userId/:filename', authMiddleware, async (req, res) => {
    try {
      const { userId, filename } = req.params;
      if (!req.user || req.user.id !== userId) return res.status(403).json({ error: 'Forbidden' });

      const filePath = path.join(uploadsDir, userId, filename);
      try {
        await fs.access(filePath);
        return res.sendFile(filePath);
      } catch (e) {
        return res.status(404).json({ error: 'Not found' });
      }
    } catch (err) {
      console.error('Error serving upload', err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/tasks', async (req, res) => {
    try {
      const filter = req.query.filter || 'all';
      const tasks = await readTasks();
      let result = tasks.filter(t => t.ownerId === req.user.id);
      if (filter === 'active') result = result.filter(t => !t.completed);
      if (filter === 'completed') result = result.filter(t => t.completed);
      res.status(200).json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/tasks/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const tasks = await readTasks();
      const task = tasks.find(t => t.id === id && t.ownerId === req.user.id);
      if (!task) return res.status(404).json({ error: 'Task not found' });
      res.json(task);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/tasks', upload.array('attachments', 5), async (req, res) => {
    try {
      const { title, description, dueDate } = req.body;
      if (!title || title.trim() === '') return res.status(400).json({ error: 'Title is required' });

      const tasks = await readTasks();
      const files = req.files || [];
      const newTask = {
        id: uuidv4(),
        ownerId: req.user.id, // bind owner
        title: title.trim(),
        description: description ? description.trim() : '',
        dueDate: dueDate || null,
        completed: false,
        createdAt: new Date().toISOString(),
        updatedAt: null,
        attachments: files.map(f => ({
          filename: f.filename,
          originalName: f.originalname,
          path: `/uploads/${req.user.id}/${f.filename}`
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

  app.put('/api/tasks/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const { title, description, dueDate, completed } = req.body;
      const tasks = await readTasks();
      const idx = tasks.findIndex(t => t.id === id && t.ownerId === req.user.id);
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

  app.patch('/api/tasks/:id/toggle', async (req, res) => {
    try {
      const id = req.params.id;
      const tasks = await readTasks();
      const task = tasks.find(t => t.id === id && t.ownerId === req.user.id);
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

  app.delete('/api/tasks/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const tasks = await readTasks();
      const idx = tasks.findIndex(t => t.id === id && t.ownerId === req.user.id);
      if (idx === -1) return res.status(404).json({ error: 'Task not found' });

      const [removed] = tasks.splice(idx, 1);

      // disk cleanup in user's uploads folder
      if (removed.attachments && removed.attachments.length > 0) {
        for (const att of removed.attachments) {
          const filePath = path.join(uploadsDir, removed.ownerId, att.filename);
          try { await fs.unlink(filePath); } catch (err) { console.warn('Could not delete file', filePath, err.message); }
        }
      }

      await writeTasks(tasks);
      res.status(200).json({ message: 'Deleted' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete task' });
    }
  });
}

app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});




(async () => {
  try {
    const secret = await getJwtSecret();
    app.locals.JWT_SECRET = secret;
    mountProtectedRoutes();
    app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();
