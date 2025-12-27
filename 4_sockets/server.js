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
const http = require('http');
const { Server } = require('socket.io');
const cookie = require('cookie');

const app = express();
<<<<<<< HEAD
=======
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000',
    credentials: true
  }
});

>>>>>>> mb_bug
const PORT = process.env.PORT || 3000;

const dataDir = path.join(__dirname, 'data');
const dataFile = path.join(dataDir, 'tasks.json');
const usersFile = path.join(dataDir, 'users.json');
const uploadsDir = path.join(__dirname, 'uploads');
const secretFile = path.join(dataDir, 'jwt-secret.txt');

const JWT_EXPIRES = '1h';

<<<<<<< HEAD
=======
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

>>>>>>> mb_bug
// ensure dirs
if (!fsSync.existsSync(uploadsDir)) fsSync.mkdirSync(uploadsDir, { recursive: true });
if (!fsSync.existsSync(dataDir)) fsSync.mkdirSync(dataDir, { recursive: true });

<<<<<<< HEAD
// multer — middleware для Express: сохраняем в uploads/<userId>/...
// настройка хранения файлов на диске
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // req.user должен быть установлен authMiddleware перед вызовом multer
=======
// multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
>>>>>>> mb_bug
    const uid = (req && req.user && req.user.id) ? req.user.id : 'anonymous';
    const userDir = path.join(uploadsDir, uid);
    try {
      if (!fsSync.existsSync(userDir)) fsSync.mkdirSync(userDir, { recursive: true });
<<<<<<< HEAD
    } catch (e) {
      // ignore
    }
=======
    } catch (e) {}
>>>>>>> mb_bug
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`);
  }
});

<<<<<<< HEAD
// app.post('/upload', ...
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// middlewares
// psrsers
=======
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// middlewares
>>>>>>> mb_bug
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

<<<<<<< HEAD

=======
>>>>>>> mb_bug
// disable caching for API
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

<<<<<<< HEAD


=======
>>>>>>> mb_bug
async function readJsonSafe(file) {
  try {
    const content = await fs.readFile(file, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    return [];
  }
}
<<<<<<< HEAD
=======

>>>>>>> mb_bug
async function writeJsonSafe(file, obj) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(obj, null, 2), 'utf8');
}

async function readTasks() { return readJsonSafe(dataFile); }
async function writeTasks(tasks) { return writeJsonSafe(dataFile, tasks); }

async function readUsers() { return readJsonSafe(usersFile); }
async function writeUsers(users) { return writeJsonSafe(usersFile, users); }

<<<<<<< HEAD
// 128 symbols
=======
>>>>>>> mb_bug
async function getJwtSecret() {
  try {
    const secret = await fs.readFile(secretFile, 'utf8');
    if (secret && secret.trim().length >= 32) return secret.trim();
<<<<<<< HEAD
    // else regenerate
=======
>>>>>>> mb_bug
  } catch (e) {}
  const newSecret = crypto.randomBytes(64).toString('hex');
  await fs.mkdir(path.dirname(secretFile), { recursive: true });
  await fs.writeFile(secretFile, newSecret, 'utf8');
  if (process.platform !== 'win32') {
    try { await fs.chmod(secretFile, 0o600); } catch (_) {}
  }
  return newSecret;
}

<<<<<<< HEAD
// Auth middleware
=======
// Auth middleware for Express
>>>>>>> mb_bug
function makeAuthMiddleware(JWT_SECRET) {
  return function authMiddleware(req, res, next) {
    try {
      const token = req.cookies && req.cookies.token;
      if (!token) return res.status(401).json({ error: 'Unauthorized' });

      jwt.verify(token, JWT_SECRET, (err, payload) => {
        if (err) return res.status(401).json({ error: 'Invalid token' });
        req.user = { id: payload.id, username: payload.username };
        next();
      });
    } catch (err) {
      console.error('Auth error', err);
      res.status(401).json({ error: 'Unauthorized' });
    }
  };
}

<<<<<<< HEAD
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
=======
// Auth routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
>>>>>>> mb_bug

    const users = await readUsers();
    if (users.find(u => u.username === username)) return res.status(409).json({ error: 'User exists' });

    const hash = await bcrypt.hash(password, 10);
<<<<<<< HEAD
    const newUser = { id: uuidv4(), username, passwordHash: hash, createdAt: new Date().toISOString() };
=======
    const newUser = { 
      id: uuidv4(), 
      username, 
      passwordHash: hash, 
      createdAt: new Date().toISOString() 
    };
>>>>>>> mb_bug
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
<<<<<<< HEAD
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
=======
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
>>>>>>> mb_bug

    const users = await readUsers();
    const user = users.find(u => u.username === username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

<<<<<<< HEAD
    const token = jwt.sign({ id: user.id, username: user.username }, app.locals.JWT_SECRET, { expiresIn: JWT_EXPIRES });
=======
    const token = jwt.sign({ 
      id: user.id, 
      username: user.username 
    }, app.locals.JWT_SECRET, { 
      expiresIn: JWT_EXPIRES 
    });
    const cookieMs = expiryToMs(JWT_EXPIRES);
>>>>>>> mb_bug

    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
<<<<<<< HEAD
      maxAge: 60 * 60 * 1000 // 1h
      // secure: true // HTTPS
    });

    res.json({ message: 'OK' });
=======
      maxAge: cookieMs,
      secure: process.env.NODE_ENV === 'production'
    });

    res.json({ message: 'OK', user: { username: user.username } });
>>>>>>> mb_bug
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

<<<<<<< HEAD
function mountProtectedRoutes() {
  const authMiddleware = makeAuthMiddleware(app.locals.JWT_SECRET);
  // protect API tasks
  app.post('/api/upload', authMiddleware, upload.array('attachments', 5), async (req, res) => {
        try {
          const files = req.files || [];
          const attachments = files.map(f => ({
            filename: f.filename,
            originalName: f.originalname,
            path: `/uploads/${req.user.id}/${f.filename}`
          }));
          res.json({ attachments });
        } catch (err) {
          console.error('Upload error', err);
          res.status(500).json({ error: 'Upload failed' });
        }
      });
  
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

  // socket auth middleware (reads cookie from handshake header)
      io.use((socket, next) => {
        try {
          const raw = socket.handshake.headers.cookie || '';
          const parsed = cookie.parse(raw || '');
          const token = parsed.token;
          if (!token) return next(new Error('Unauthorized'));
          jwt.verify(token, JWT_SECRET, (err, payload) => {
            if (err) return next(new Error('Unauthorized'));
            socket.user = { id: payload.id, username: payload.username };
            next();
          });
        } catch (err) {
          return next(new Error('Unauthorized'));
        }
      });
  
      // Socket handlers
      io.on('connection', (socket) => {
        // convenience
        const uid = socket.user.id;
  
        // helper to send tasks list based on filter
        async function sendTasks(filter, cb) {
          try {
            let tasks = await readTasks();
            tasks = tasks.filter(t => t.ownerId === uid);
            if (filter === 'active') tasks = tasks.filter(t => !t.completed);
            if (filter === 'completed') tasks = tasks.filter(t => t.completed);
            cb && cb(null, tasks);
          } catch (err) {
            console.error('sendTasks error', err);
            cb && cb({ error: 'Server error' });
          }
        }
  
        // list
        socket.on('getTasks', (payload = {}, cb) => {
          const filter = payload.filter || 'all';
          sendTasks(filter, (err, tasks) => {
            if (err) return cb({ error: err.error || 'Server error' });
            cb({ ok: true, tasks });
          });
        });
  
        // get single
        socket.on('getTask', async (payload = {}, cb) => {
          try {
            const id = payload.id;
            const tasks = await readTasks();
            const task = tasks.find(t => t.id === id && t.ownerId === uid);
            if (!task) return cb({ error: 'Not found', code: 404 });
            cb({ ok: true, task });
          } catch (err) {
            console.error(err);
            cb({ error: 'Server error' });
          }
        });
  
        // create (attachments should be array with {filename, originalName, path})
        socket.on('createTask', async (payload = {}, cb) => {
          try {
            const { title, description, dueDate, attachments } = payload;
            if (!title || title.trim() === '') return cb({ error: 'Title is required', code: 400 });
  
            const tasks = await readTasks();
            const newTask = {
              id: uuidv4(),
              ownerId: uid,
              title: title.trim(),
              description: description ? description.trim() : '',
              dueDate: dueDate || null,
              completed: false,
              createdAt: new Date().toISOString(),
              updatedAt: null,
              attachments: Array.isArray(attachments) ? attachments : []
            };
            tasks.push(newTask);
            await writeTasks(tasks);
            cb({ ok: true, task: newTask });
          } catch (err) {
            console.error('createTask error', err);
            cb({ error: 'Failed to create task' });
          }
        });
  
        // update
        socket.on('updateTask', async (payload = {}, cb) => {
          try {
            const { id, title, description, dueDate, completed } = payload;
            const tasks = await readTasks();
            const idx = tasks.findIndex(t => t.id === id && t.ownerId === uid);
            if (idx === -1) return cb({ error: 'Task not found', code: 404 });
            if (title && typeof title === 'string') tasks[idx].title = title.trim();
            if (typeof description === 'string') tasks[idx].description = description.trim();
            tasks[idx].dueDate = dueDate || null;
            if (typeof completed === 'boolean') tasks[idx].completed = completed;
            tasks[idx].updatedAt = new Date().toISOString();
            await writeTasks(tasks);
            cb({ ok: true, task: tasks[idx] });
          } catch (err) {
            console.error('updateTask error', err);
            cb({ error: 'Failed to update task' });
          }
        });
  
        // toggle
        socket.on('toggleTask', async (payload = {}, cb) => {
          try {
            const { id } = payload;
            const tasks = await readTasks();
            const task = tasks.find(t => t.id === id && t.ownerId === uid);
            if (!task) return cb({ error: 'Task not found', code: 404 });
            task.completed = !task.completed;
            task.updatedAt = new Date().toISOString();
            await writeTasks(tasks);
            cb({ ok: true, task });
          } catch (err) {
            console.error('toggleTask error', err);
            cb({ error: 'Failed to toggle task' });
          }
        });
  
        // delete
        socket.on('deleteTask', async (payload = {}, cb) => {
          try {
            const { id } = payload;
            const tasks = await readTasks();
            const idx = tasks.findIndex(t => t.id === id && t.ownerId === uid);
            if (idx === -1) return cb({ error: 'Task not found', code: 404 });
            const [removed] = tasks.splice(idx, 1);
  
            if (removed.attachments && removed.attachments.length > 0) {
              for (const att of removed.attachments) {
                const filePath = path.join(uploadsDir, removed.ownerId, att.filename);
                try { await fs.unlink(filePath); } catch (err) { console.warn('Could not delete file', filePath, err.message); }
              }
            }
  
            await writeTasks(tasks);
            cb({ ok: true, message: 'Deleted' });
          } catch (err) {
            console.error('deleteTask error', err);
            cb({ error: 'Failed to delete task' });
          }
        });
  
        // optional: client may request current user info
        socket.on('whoami', (payload, cb) => {
          cb({ ok: true, user: socket.user });
        });
  
        socket.on('disconnect', (reason) => {
          // nothing special
        });
      });
}




=======
// Protected REST routes for file uploads
app.post('/api/upload', makeAuthMiddleware(app.locals.JWT_SECRET), upload.array('attachments', 5), async (req, res) => {
  try {
    const files = req.files || [];
    const attachments = files.map(f => ({
      filename: f.filename,
      originalName: f.originalname,
      path: `/uploads/${req.user.id}/${f.filename}`
    }));
    res.json({ attachments });
  } catch (err) {
    console.error('Upload error', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.get('/uploads/:userId/:filename', makeAuthMiddleware(app.locals.JWT_SECRET), async (req, res) => {
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

// Serve index.html for all non-API routes
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO authentication middleware
io.use((socket, next) => {
  try {
    const raw = socket.handshake.headers.cookie;
    if (!raw) return next(new Error('Unauthorized'));
    
    const parsed = cookie.parse(raw);
    const token = parsed.token;
    if (!token) return next(new Error('Unauthorized'));
    
    jwt.verify(token, app.locals.JWT_SECRET, (err, payload) => {
      if (err) return next(new Error('Unauthorized'));
      socket.user = { id: payload.id, username: payload.username };
      next();
    });
  } catch (err) {
    return next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  const uid = socket.user.id;
  console.log(`User ${socket.user.username} connected`);

  socket.join(uid);

  async function sendTasks(filter, callback) {
    try {
      let tasks = await readTasks();
      tasks = tasks.filter(t => t.ownerId === uid);
      if (filter === 'active') tasks = tasks.filter(t => !t.completed);
      if (filter === 'completed') tasks = tasks.filter(t => t.completed);
      callback(null, tasks);
    } catch (err) {
      console.error('sendTasks error', err);
      callback({ error: 'Server error' });
    }
  }

  socket.on('getTasks', (payload = {}, callback) => {
    const filter = payload.filter || 'all';
    sendTasks(filter, (err, tasks) => {
      if (err) return callback({ error: err.error || 'Server error' });
      callback({ tasks });
    });
  });

  socket.on('createTask', async (payload = {}, callback) => {
    try {
      const { title, description, dueDate, attachments } = payload;
      if (!title || title.trim() === '') return callback({ error: 'Title is required' });

      const tasks = await readTasks();
      const newTask = {
        id: uuidv4(),
        ownerId: uid,
        title: title.trim(),
        description: description ? description.trim() : '',
        dueDate: dueDate || null,
        completed: false,
        createdAt: new Date().toISOString(),
        updatedAt: null,
        attachments: Array.isArray(attachments) ? attachments : []
      };
      tasks.push(newTask);
      await writeTasks(tasks);

      // reply to the caller
      callback({ task: newTask });

      // notify all sockets (tabs) of this user
      io.to(uid).emit('taskCreated', { task: newTask });
    } catch (err) {
      console.error('createTask error', err);
      callback({ error: 'Failed to create task' });
    }
  });

  socket.on('updateTask', async (payload = {}, callback) => {
    try {
      const { id, title, description, dueDate, completed } = payload;
      const tasks = await readTasks();
      const idx = tasks.findIndex(t => t.id === id && t.ownerId === uid);
      if (idx === -1) return callback({ error: 'Task not found' });
      if (title && typeof title === 'string') tasks[idx].title = title.trim();
      if (typeof description === 'string') tasks[idx].description = description.trim();
      tasks[idx].dueDate = dueDate || null;
      if (typeof completed === 'boolean') tasks[idx].completed = completed;
      tasks[idx].updatedAt = new Date().toISOString();
      await writeTasks(tasks);

      callback({ task: tasks[idx] });
      io.to(uid).emit('taskUpdated', { task: tasks[idx] });
    } catch (err) {
      console.error('updateTask error', err);
      callback({ error: 'Failed to update task' });
    }
  });

  socket.on('toggleTask', async (payload = {}, callback) => {
    try {
      const { id } = payload;
      const tasks = await readTasks();
      const task = tasks.find(t => t.id === id && t.ownerId === uid);
      if (!task) return callback({ error: 'Task not found' });
      task.completed = !task.completed;
      task.updatedAt = new Date().toISOString();
      await writeTasks(tasks);

      callback({ task });
      io.to(uid).emit('taskUpdated', { task }); // reuse 'taskUpdated' event
    } catch (err) {
      console.error('toggleTask error', err);
      callback({ error: 'Failed to toggle task' });
    }
  });

  socket.on('deleteTask', async (payload = {}, callback) => {
    try {
      const { id } = payload;
      const tasks = await readTasks();
      const idx = tasks.findIndex(t => t.id === id && t.ownerId === uid);
      if (idx === -1) return callback({ error: 'Task not found' });
      const [removed] = tasks.splice(idx, 1);

      if (removed.attachments && removed.attachments.length > 0) {
        for (const att of removed.attachments) {
          const filePath = path.join(uploadsDir, removed.ownerId, att.filename);
          try {
            await fs.unlink(filePath);
          } catch (err) {
            console.warn('Could not delete file', filePath, err.message);
          }
        }
      }

      await writeTasks(tasks);
      callback({ message: 'Deleted' });

      // notify all user's tabs
      io.to(uid).emit('taskDeleted', { id: removed.id });
    } catch (err) {
      console.error('deleteTask error', err);
      callback({ error: 'Failed to delete task' });
    }
  });

  // optional: endpoint for client to ask "whoami"
  socket.on('whoami', (payload, callback) => {
    callback({ user: socket.user });
  });

  socket.on('disconnect', (reason) => {
    console.log(`User ${socket.user?.username} disconnected: ${reason}`);
  });
});


// Initialize server
>>>>>>> mb_bug
(async () => {
  try {
    const secret = await getJwtSecret();
    app.locals.JWT_SECRET = secret;
<<<<<<< HEAD
    mountProtectedRoutes();
    app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
=======
    server.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
      console.log(`Socket.IO server running`);
    });
>>>>>>> mb_bug
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
<<<<<<< HEAD
})();
=======
})();
>>>>>>> mb_bug
