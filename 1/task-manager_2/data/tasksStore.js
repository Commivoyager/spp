const fs = require('fs').promises;
const path = require('path');

const dataFile = path.join(__dirname, '..', 'data', 'tasks.json');

async function readTasks() {
  try {
    const data = await fs.readFile(dataFile, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

async function writeTasks(tasks) {
  try {
    await fs.mkdir(path.dirname(dataFile), { recursive: true });
    await fs.writeFile(dataFile, JSON.stringify(tasks, null, 2));
  } catch (err) {
    throw err;
  }
}

module.exports = { readTasks, writeTasks };
