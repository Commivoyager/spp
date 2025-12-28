// Express — HTTP-сервер и система middleware
const express = require('express');
// Работа с путями файлов
const path = require('path');
// Асинхронная работа с файловой системой (promises API)
const fs = require('fs').promises;
// Синхронный fs — нужен для проверок существования папок/файлов
const fsSync = require('fs');
// Multer — загрузка файлов (multipart/form-data)
const multer = require('multer');
// UUID — генерация уникальных идентификаторов
const { v4: uuidv4 } = require('uuid');
// JSON Web Token — создание и проверка JWT
const jwt = require('jsonwebtoken');
// Bcrypt — хеширование и проверка паролей
const bcrypt = require('bcrypt');
// Парсинг cookies (нужно для чтения httpOnly JWT)
const cookieParser = require('cookie-parser');
// Crypto — генерация случайного секретного ключа для JWT
const crypto = require('crypto');
// GraphQL HTTP handler для Express
const { createHandler } = require('graphql-http/lib/use/express');
// GraphQL — построение схемы (SDL -> executable schema)
const { buildSchema } = require('graphql');

// Создание Express-приложения
const app = express();
const PORT = process.env.PORT || 3000;

const dataDir = path.join(__dirname, 'data');
// Файл с задачами
const dataFile = path.join(dataDir, 'tasks.json');
const usersFile = path.join(dataDir, 'users.json');
const uploadsDir = path.join(__dirname, 'uploads');
const secretFile = path.join(dataDir, 'jwt-secret.txt');

const JWT_EXPIRES = '15m';

// GraphQL схема
const schema = buildSchema(`
  type Attachment {
    filename: String!
    originalName: String
    path: String!
  }

  type Task {
    id: ID!
    title: String!
    description: String
    dueDate: String
    completed: Boolean!
    createdAt: String!
    updatedAt: String
    attachments: [Attachment!]!
    ownerId: ID!
  }

  type AuthPayload {
    message: String!
  }

  type Query {
    tasks(filter: String): [Task!]!
    task(id: ID!): Task
  }

  input TaskInput {
    title: String!
    description: String
    dueDate: String
  }

  input TaskUpdateInput {
    title: String
    description: String
    dueDate: String
    completed: Boolean
  }

  type Mutation {
    createTask(input: TaskInput!): Task!
    updateTask(id: ID!, input: TaskUpdateInput!): Task!
    deleteTask(id: ID!): Boolean!
    toggleTask(id: ID!): Task!
    register(username: String!, password: String!): AuthPayload!
    login(username: String!, password: String!): AuthPayload!
    logout: AuthPayload!
    removeAttachment(taskId: ID!, filename: String!): Task!
  }
`);

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

// Ensure dirs
if (!fsSync.existsSync(uploadsDir)) fsSync.mkdirSync(uploadsDir, { recursive: true });
if (!fsSync.existsSync(dataDir)) fsSync.mkdirSync(dataDir, { recursive: true });

// Multer configuration 
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uid = req.user ? req.user.id : 'anonymous';
    const userDir = path.join(uploadsDir, uid);
    try {
      if (!fsSync.existsSync(userDir)) fsSync.mkdirSync(userDir, { recursive: true });
    } catch (e) {}
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`);
  }
});

const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Middlewares
// Для разбиения json-тела запроса 
app.use(express.json());
// разбор данных html-форм
app.use(express.urlencoded({ extended: true }));
// парсинг заголовка Cookie
app.use(cookieParser());
// раздача статических файлов
app.use(express.static(path.join(__dirname, 'public')));

// Disable caching for API
// От устаревших данных, нормальной авторизации
app.use('/graphql', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Helper functions
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

async function getJwtSecret() {
  try {
    const secret = await fs.readFile(secretFile, 'utf8');
    if (secret && secret.trim().length >= 32) return secret.trim();
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
// проверка наличия и валидности jwt
async function authMiddleware(req, res, next) {
  try {
    // jwt из кук
    const token = req.cookies && req.cookies.token;
    
    // Allow GraphQL introspection and auth mutations without token
    // без токена можно получить схему/залогиниться
    if (req.body && req.body.query) {
      const query = req.body.query;
      // Allow introspection query
      if (query.includes('__schema') || query.includes('IntrospectionQuery')) {
        return next();
      }
      // Allow register and login mutations without token
      if (query.includes('mutation') && 
          (query.includes('register') || query.includes('login'))) {
        return next();
      }
    }
    
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const JWT_SECRET = app.locals.JWT_SECRET;
    jwt.verify(token, JWT_SECRET, (err, payload) => {
      if (err) {
        const msg = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
        return res.status(401).json({ error: msg });
      }
      req.user = { id: payload.id, username: payload.username };
      next();
    });
  } catch (err) {
    console.error('Auth error', err);
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// GraphQL resolvers
const rootValue = {
  // Queries
  tasks: async ({ filter }, context) => {
    if (!context.user) throw new Error('Unauthorized');
    
    const tasks = await readTasks();
    let result = tasks.filter(t => t.ownerId === context.user.id);
    
    if (filter === 'active') result = result.filter(t => !t.completed);
    if (filter === 'completed') result = result.filter(t => t.completed);
    
    return result;
  },

  task: async ({ id }, context) => {
    if (!context.user) throw new Error('Unauthorized');
    
    const tasks = await readTasks();
    const task = tasks.find(t => t.id === id && t.ownerId === context.user.id);
    if (!task) throw new Error('Task not found');
    
    return task;
  },

  // Mutations
  createTask: async ({ input }, context) => {
    if (!context.user) throw new Error('Unauthorized');
    
    const { title, description, dueDate } = input;
    if (!title || title.trim() === '') {
      throw new Error('Title is required');
    }

    const tasks = await readTasks();
    const newTask = {
      id: uuidv4(),
      ownerId: context.user.id,
      title: title.trim(),
      description: description ? description.trim() : '',
      dueDate: dueDate || null,
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      attachments: [] // Файлы обрабатываются отдельно через конечную точку REST
    };

    tasks.push(newTask);
    await writeTasks(tasks);
    return newTask;
  },

  updateTask: async ({ id, input }, context) => {
    if (!context.user) throw new Error('Unauthorized');
    
    const { title, description, dueDate, completed } = input;
    const tasks = await readTasks();
    const idx = tasks.findIndex(t => t.id === id && t.ownerId === context.user.id);
    
    if (idx === -1) throw new Error('Task not found');

    if (title && typeof title === 'string') tasks[idx].title = title.trim();
    if (typeof description === 'string') tasks[idx].description = description.trim();
    tasks[idx].dueDate = dueDate || null;
    if (typeof completed === 'boolean') tasks[idx].completed = completed;
    tasks[idx].updatedAt = new Date().toISOString();
    
    await writeTasks(tasks);
    return tasks[idx];
  },

  deleteTask: async ({ id }, context) => {
    if (!context.user) throw new Error('Unauthorized');
    
    const tasks = await readTasks();
    const idx = tasks.findIndex(t => t.id === id && t.ownerId === context.user.id);
    
    if (idx === -1) throw new Error('Task not found');

    // удаление элементов из массива
    const [removed] = tasks.splice(idx, 1);

    // Clean up files
    if (removed.attachments && removed.attachments.length > 0) {
      for (const att of removed.attachments) {
        const filePath = path.join(uploadsDir, removed.ownerId, att.filename);
        try { await fs.unlink(filePath); } catch (err) { 
          console.warn('Could not delete file', filePath, err.message); 
        }
      }
    }

    await writeTasks(tasks);
    return true;
  },

  toggleTask: async ({ id }, context) => {
    if (!context.user) throw new Error('Unauthorized');
    
    const tasks = await readTasks();
    const task = tasks.find(t => t.id === id && t.ownerId === context.user.id);
    
    if (!task) throw new Error('Task not found');
    
    task.completed = !task.completed;
    task.updatedAt = new Date().toISOString();
    await writeTasks(tasks);
    
    return task;
  },

  // Auth mutations
  register: async ({ username, password }) => {
    if (!username || !password) {
      throw new Error('Username and password required');
    }

    const users = await readUsers();
    if (users.find(u => u.username === username)) {
      throw new Error('User already exists');
    }

    const hash = await bcrypt.hash(password, 10);
    const newUser = {
      id: uuidv4(),
      username,
      passwordHash: hash,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    await writeUsers(users);
    
    return { message: 'Registered successfully' };
  },

  login: async ({ username, password }, { res }) => {
    if (!username || !password) {
      throw new Error('Username and password required');
    }

    const users = await readUsers();
    const user = users.find(u => u.username === username);
    if (!user) throw new Error('Invalid credentials');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new Error('Invalid credentials');

    const token = jwt.sign(
      { id: user.id, username: user.username },
      app.locals.JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    const cookieMs = expiryToMs(JWT_EXPIRES);
    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: cookieMs,
      secure: process.env.NODE_ENV === 'production'
    });

    return { message: 'Login successful' };
  },

  logout: async (args, { res }) => {
    res.clearCookie('token');
    return { message: 'Logged out' };
  }, 

  removeAttachment: async ({ taskId, filename }, { user }) => {
    if (!user) throw new Error('Unauthorized');
    const tasks = await readTasks();
    const idx = tasks.findIndex(t => t.id === taskId && t.ownerId === user.id);
    if (idx === -1) throw new Error('Task not found');

    const task = tasks[idx];
    task.attachments = (task.attachments || []).filter(a => a.filename !== filename);

    // попытка удалить файл с диска
    const filePath = path.join(uploadsDir, user.id, filename);
    try { await fs.unlink(filePath); } catch (e) {  }

    task.updatedAt = new Date().toISOString();
    await writeTasks(tasks);
    return task;
  }

};

// REST endpoints for file upload
// загрузка и отдача файлов, привязанных к задачам
// в теле лямбды работа с метаданными - загрузка бинарных файлов 
// происходит через multer middleware
app.post('/api/tasks/:id/upload', authMiddleware, upload.array('attachments', 5), async (req, res) => {
  try {
    const { id } = req.params;
    const tasks = await readTasks();
    const task = tasks.find(t => t.id === id && t.ownerId === req.user.id);
    
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const files = req.files || [];
    const attachments = files.map(f => ({
      filename: f.filename,
      originalName: f.originalname,
      path: `/api/uploads/${req.user.id}/${f.filename}`
    }));

    if (!task.attachments) task.attachments = [];
    task.attachments.push(...attachments);
    task.updatedAt = new Date().toISOString();
    
    await writeTasks(tasks);
    res.status(200).json({ attachments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

app.get('/api/uploads/:userId/:filename', authMiddleware, async (req, res) => {
  try {
    const { userId, filename } = req.params;
    if (!req.user || req.user.id !== userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

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

// GraphQL endpoint
// Подключение JWT-аутентификации
app.use('/graphql', authMiddleware);
app.use('/graphql', (req, res, next) => {
  // Add user to GraphQL context
  // GraphQL-сервер, встроенный в Express
  createHandler({
    schema,
    rootValue,
    // для доступа из резолверов к контексту
    context: { 
      user: req.user,
      res: res
    },
    formatError: (error) => {
      console.error('GraphQL Error:', error);
      return {
        message: error.message,
        locations: error.locations,
        path: error.path
      };
    }
  })(req, res, next);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// для отдачи статики при обращении не к API
app.get(/^\/(?!api|graphql|health).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

(async () => {
  try {
    const secret = await getJwtSecret();
    app.locals.JWT_SECRET = secret;
    app.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
      console.log(`GraphQL endpoint: http://localhost:${PORT}/graphql`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
})();