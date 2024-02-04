const $tasksList = api.$container.find(".tasks-view-list");
const $addTaskButton = $("#add-task-button");
const $newTaskInput = $("#new-task-input");
const statuses = ["In Progress", "Todo", "Backlog", "Done"];

// In-memory cache for tasks
let taskCache = {};

const moveTaskToStatus = async (taskId, newStatus, currentStatus) => {
  const statusNote = await api.searchForNote(`#tasksStatus="${newStatus}"`);
  const oldStatusNote = await api.searchForNote(
    `#tasksStatus="${currentStatus}"`,
  );
  await api.runOnBackend(
    (noteId, newStatusNoteId, oldStatusNoteId) => {
      api.toggleNoteInParent(true, noteId, newStatusNoteId);
      api.toggleNoteInParent(false, noteId, oldStatusNoteId);
    },
    [taskId, statusNote.noteId, oldStatusNote.noteId],
  );
  await api.waitUntilSynced();
  api.showMessage(`Task status set to ${newStatus}`);
  // Invalidate cache for this note id
  delete taskCache[taskId];
  await renderTaskList();
};

const createTaskItem = async (task, status, index) => {
  // Check cache first
  if (taskCache[task.noteId]) {
    return taskCache[task.noteId];
  }

  const taskLink = await api.createLink(task.noteId, { showTooltip: true });
  const taskLinkHtml = taskLink.prop("outerHTML");
  const taskMetaData = await task.getMetadata();
  const dateCreated = new Date(taskMetaData.dateCreated);
  const dateModified = new Date(taskMetaData.dateModified);
  const formattedDateCreated = `${dateCreated.toLocaleDateString()} ${dateCreated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  const formattedDateModified = `${dateModified.toLocaleDateString()} ${dateModified.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  let $taskItem = $(
    `<li class="task-item ${index % 2 === 0 ? "even" : "odd"} ${status}">
      <div class="task-content">${taskLinkHtml}</div>
      <div class="task-metadata">
        <div>Created: ${formattedDateCreated}</div>
        <div>Modified: ${formattedDateModified}</div>
      </div>
      <div class="task-buttons"></div>
    </li>`,
  );
  const statusButtons = {
    Backlog: ["Todo"],
    Todo: ["In Progress", "Backlog"],
    "In Progress": ["Todo", "Done"],
    Done: ["Todo", "Archived"],
    Archived: ["Todo"],
  };

  const $taskButtons = $taskItem.find(".task-buttons");
  statusButtons[status].forEach((buttonStatus) => {
    const $button = $(
      `<button class="btn btn-sm btn-primary" style="margin-right: 5px;">${buttonStatus}</button>`,
    );
    $button.on("click", () =>
      moveTaskToStatus(task.noteId, buttonStatus, status),
    );
    $taskButtons.append($button);
  });

  // Cache the task item
  taskCache[task.noteId] = $taskItem;

  return $taskItem;
};

const createStatusList = async (status) => {
  const $statusHeader = $(`<h3>${status}</h3>`);
  const $statusList = $(`<ul class="status-list" id="${status}-list"></ul>`);

  const tasks = await api.searchForNotes(
    `note.parents.labels.tasksStatus="${status}" orderBy note.dateModified desc`,
  );
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    const $taskItem = await createTaskItem(task, status, i);
    $statusList.append($taskItem);
  }

  return [$statusHeader, $statusList];
};

const renderTaskList = async () => {
  $tasksList.empty();
  for (let i = 0; i < statuses.length; i++) {
    const status = statuses[i];
    const [$statusHeader, $statusList] = await createStatusList(status);
    $tasksList.append($statusHeader, $statusList);
  }
};

const createNewTask = async () => {
  const taskTitle = $newTaskInput.val();
  if (taskTitle) {
    const parentNote = await api.searchForNote('#tasksStatus="Backlog"');
    const parentNoteId = parentNote.noteId;
    const content = "";
    const newTask = await api.runOnBackend(
      (parentNoteId, taskTitle, content) => {
        return api.createTextNote(parentNoteId, taskTitle, content);
      },
      [parentNoteId, taskTitle, content],
    );
    $newTaskInput.val("");
    // Invalidate cache
    taskCache = {};
    await renderTaskList();
  } else {
    api.showMessage("Please enter a task name");
  }
};

$addTaskButton.on("click", createNewTask);
$newTaskInput.on("keypress", function (e) {
  if (e.which == 13) {
    createNewTask();
  }
});

renderTaskList();
