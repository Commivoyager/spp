const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const methodOverride = require('method-override');



const app = express();
const PORT = process.env.PORT || 3000;
const fsp = fs.promises;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

// парсинг форм
app.use(express.urlencoded({ extended: true }));

// парсинг
app.use(express.json()); 

// PUT/DELETE
app.use(methodOverride(function (req, res) {
  if (req.body && typeof req.body === 'object' && '_method' in req.body) {
    const method = req.body._method;
    delete req.body._method;
    return method;
  }
  if (req.query && '_method' in req.query) {
    return req.query._method;
  }
}));

// статика
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Настройка EJS
// движок шаблонов
app.set('view engine', 'ejs');

// папка с шаблонами
app.set('views', path.join(__dirname, 'views'));



const dataFile = path.join(__dirname, 'data', 'tasks.json');

async function readTasks() {
  try {
    const data = await fs.readFile(dataFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // файла нет
    return [];
  }
}

async function writeTasks(tasks) {
  try {
    await fs.mkdir(path.dirname(dataFile), { recursive: true });
    await fs.writeFile(dataFile, JSON.stringify(tasks, null, 2));
  } catch (error) {
    console.error('Error writing tasks:', error);
    throw error;
  }
}

// регистрация
app.get('/', async (req, res) => {
  try {
    const tasks = await readTasks();
    const filter = req.query.filter || 'all';
    
    let filteredTasks = tasks;
    if (filter === 'active') {
      filteredTasks = tasks.filter(task => !task.completed);
    } else if (filter === 'completed') {
      filteredTasks = tasks.filter(task => task.completed);
    }

    res.render('index', { 
      tasks: filteredTasks,
      currentFilter: filter
    });
  } catch (error) {
    console.error('Error loading tasks:', error);
    res.status(500).send('Error loading tasks');
  }
});

app.post('/tasks', upload.array('attachments', 5), async (req, res) => {
  try {
    const { title, description, dueDate } = req.body;
    const tasks = await readTasks();
    
    const newTask = {
      id: uuidv4(),
      title,
      description: description || '',
      dueDate: dueDate || null,
      completed: false,
      createdAt: new Date().toISOString(),
      attachments: req.files ? req.files.map(file => ({
        filename: file.filename,
        originalName: file.originalname,
        path: file.path
      })) : []
    };

    tasks.push(newTask);
    await writeTasks(tasks);
    
    res.redirect('/');
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).send('Error creating task');
  }
});

app.put('/tasks/:id/toggle', async (req, res) => {
  try {
    const tasks = await readTasks();
    const task = tasks.find(t => t.id === req.params.id);
    
    if (task) {
      task.completed = !task.completed;
      task.updatedAt = new Date().toISOString();
      await writeTasks(tasks);
    }
    
    res.redirect('/');
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).send('Error updating task');
  }
});

app.delete('/tasks/:id', async (req, res) => {
  try {
    const tasks = await readTasks();
    const taskIndex = tasks.findIndex(t => t.id === req.params.id);
    
    if (taskIndex !== -1) {
      // файлы вложений
      const task = tasks[taskIndex];
      if (task.attachments) {
      for (const attachment of task.attachments) {
        try {
          await fsp.unlink(attachment.path);
        } catch (err) {
          console.error('Error deleting file:', err);
      }
  }
}
      
      tasks.splice(taskIndex, 1);
      await writeTasks(tasks);
    }
    
    res.redirect('/');
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).send('Error deleting task');
  }
});

// запуск сервера
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!require('fs').existsSync(uploadsDir)) {
    require('fs').mkdirSync(uploadsDir, { recursive: true });
  }
});