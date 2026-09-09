/* ===================== Elements ===================== */
const taskList       = document.getElementById('taskList');
const addTaskBtn      = document.getElementById('addTask');       // add task first button
const createTaskForm  = document.getElementById('createTask');    // create task container
const openForm        = document.getElementById('openForm');      // add task second button
const createTitle     = document.getElementById('myTitle');       // task title input
const createComment   = document.getElementById('myComment');     // task comment input
const createDeadline  = document.getElementById('deadline');      // task deadline input
const createCategory  = document.getElementById('category');      // task category select
const closeTask       = document.getElementById('closeTask');     // close task form button
const saveTask        = document.getElementById('saveTask');      // save task button (add or edit)
const percentValue    = document.getElementById('percentValue');  // progress percentage
const modalBackdrop   = document.getElementById('modalBackdrop'); // backdrop behind the create-task modal

const headNavBtns = document.querySelectorAll('.headNavBtn'); // Tasks/Completed x Personal/Professional
const taskCatBtns = document.querySelectorAll('.taskCatBtn'); // Today / Overdue

/* ===================== State ===================== */
let tasks = [];      // { id, title, comment, deadline, category, completed }
let nextId = 1;
let editId = null;   // id of task currently being edited, null = creating new

// Matches the classes already marked "active" in the HTML
let filters = {
  status: 'all',          // 'all' (Tasks board - shows every task) | 'completed'
  category: 'personal',   // 'personal' | 'professional'
  time: 'today'            // 'today' | 'overdue'
};

/* ===================== Persistence (localStorage) ===================== */
const STORAGE_KEY = 'doWithWonda:tasks:v1';

function saveState(){
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks, nextId, filters }));
  } catch (e) {
    // localStorage can throw in private-browsing modes or when full -
    // task-taking still works for the current session either way.
    console.error('Could not save tasks:', e);
  }
}

function loadState(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const data = JSON.parse(raw);
    if (Array.isArray(data.tasks)) tasks = data.tasks;
    if (typeof data.nextId === 'number') nextId = data.nextId;
    if (data.filters) filters = { ...filters, ...data.filters };
  } catch (e) {
    console.error('Could not load saved tasks:', e);
  }
}

// After loading saved filters, the active-button highlighting in the HTML
// (which only reflects the hardcoded defaults) needs to be brought back
// in sync with whatever was actually restored.
function syncFilterButtons(){
  headNavBtns.forEach(btn => {
    const heading = btn.closest('.headCategory')
      .querySelector('.headings').textContent.trim().toLowerCase();
    const btnStatus = heading === 'completed' ? 'completed' : 'all';
    const btnCategory = btn.textContent.trim().toLowerCase();

    btn.classList.toggle('active', btnStatus === filters.status && btnCategory === filters.category);
  });

  taskCatBtns.forEach(btn => {
    btn.classList.toggle('active', btn.textContent.trim().toLowerCase() === filters.time);
  });
}

/* ===================== Open / close create-task form ===================== */
function openModal(){
  createTaskForm.classList.add('show');
  modalBackdrop.classList.add('show');
}

function closeModal(){
  createTaskForm.classList.remove('show');
  modalBackdrop.classList.remove('show');
  resetForm();
  editId = null;
}

addTaskBtn.addEventListener('click', () => {
  editId = null;
  resetForm();
  openModal();
});

openForm.addEventListener('click', () => {
  editId = null;
  resetForm();
  openModal();
});

closeTask.addEventListener('click', closeModal);

// Clicking outside the modal (on the backdrop) closes it too
modalBackdrop.addEventListener('click', closeModal);

/* ===================== Filter controls ===================== */

// The 4 headNavBtns (Tasks:Personal, Tasks:Professional, Completed:Personal,
// Completed:Professional) act as one combined toggle - only one is active
// across all of them at a time.
headNavBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    headNavBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const heading = btn.closest('.headCategory')
      .querySelector('.headings').textContent.trim().toLowerCase();

    filters.status = heading === 'completed' ? 'completed' : 'all';
    filters.category = btn.textContent.trim().toLowerCase();

    saveState();
    renderTasks();
  });
});

// Today / Overdue - single group, one active at a time
taskCatBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    taskCatBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filters.time = btn.textContent.trim().toLowerCase();
    saveState();
    renderTasks();
  });
});

/* ===================== Create / update a task ===================== */
function addTodo(){
  const title = createTitle.value.trim();
  const comment = createComment.value.trim();
  const deadline = createDeadline.value;
  const category = createCategory.value;

  if (!title || !comment) { // checks if empty
    return;
  }
  if (!category) {
    createCategory.focus();
    return;
  }

  if (editId !== null) {
    // Editing an existing task - update it in place
    const task = tasks.find(t => t.id === editId);
    if (task) {
      task.title = title;
      task.comment = comment;
      task.deadline = deadline;
      task.category = category;
    }
    editId = null;
  } else {
    // Creating a new task
    tasks.push({
      id: nextId++,
      title,
      comment,
      deadline,
      category,
      completed: false
    });
  }

  createTaskForm.classList.remove('show');
  modalBackdrop.classList.remove('show');
  resetForm();
  saveState();
  renderTasks();
}

saveTask.addEventListener('click', addTodo); // Save task button handler

/* ===================== Helpers ===================== */

// Buckets a deadline against today's date. There's no "pending" bucket -
// anything not yet overdue (today, a future date, or no deadline at all)
// counts as "today".
function getTimeBucket(deadlineStr){
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!deadlineStr) return 'today';

  const due = new Date(deadlineStr);
  due.setHours(0, 0, 0, 0);

  return due.getTime() < today.getTime() ? 'overdue' : 'today';
}

// Basic escaping since task title/comment are user input rendered via innerHTML
function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function resetForm(){
  createTitle.value = '';
  createComment.value = '';
  createDeadline.value = '';
  createCategory.value = '';
}

/* ===================== Render ===================== */
function renderTasks(){
  const visible = tasks.filter(t =>
    (filters.status === 'completed' ? t.completed : true) &&
    t.category === filters.category &&
    getTimeBucket(t.deadline) === filters.time
  );

  taskList.innerHTML = '';

  if (visible.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'emptyState';
    empty.textContent = 'No tasks here yet.';
    taskList.appendChild(empty);
  } else {
    visible.forEach(task => {
      const el = document.createElement('div');
      el.className = 'todoContainer';
      el.innerHTML = `
        <div class="todo">
          <div class="todoDetailsWrapper">
            <div class="inputCheck"><input type="checkbox" ${task.completed ? 'checked' : ''}></div>
            <div class="inputText">
              <p class="myTask">${escapeHtml(task.title)}</p>
              <span class="taskDesc description">${escapeHtml(task.comment)}</span>
            </div>
          </div>
        </div>

        <div class="btnContainer">
          <button type="button" class="modify editBtn">edit</button>
          <button type="button" class="modify delBtn">del</button>
        </div>
      `;

      el.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
        task.completed = e.target.checked;
        saveState();
        // Only re-renders the task out of view when unchecking it while
        // looking at the Completed board - it always stays on the Tasks board.
        renderTasks();
      });

      el.querySelector('.editBtn').addEventListener('click', () => {
        editId = task.id;
        createTitle.value = task.title;
        createComment.value = task.comment;
        createDeadline.value = task.deadline || '';
        createCategory.value = task.category;
        openModal();
      });

      el.querySelector('.delBtn').addEventListener('click', () => {
        tasks = tasks.filter(t => t.id !== task.id);
        saveState();
        renderTasks();
      });

      taskList.appendChild(el);
    });
  }

  updateUI();
}

/* ===================== Progress calculation ===================== */
// Completion rate is based on all tasks in the current category + time
// bucket (regardless of status filter), so it reflects real progress
// rather than always reading 0%/100% depending on which tab is open.
function updateUI(){
  const bucketTasks = tasks.filter(t =>
    t.category === filters.category &&
    getTimeBucket(t.deadline) === filters.time
  );
  const completedCount = bucketTasks.filter(t => t.completed).length;

  percentValue.textContent = bucketTasks.length
    ? Math.round((completedCount / bucketTasks.length) * 100 * 100) / 100 + '%'
    : '0%';
}

/* ===================== Initial render ===================== */
loadState();
syncFilterButtons();
renderTasks();