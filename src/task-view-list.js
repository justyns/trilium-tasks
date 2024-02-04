const $tasksList = api.$container.find(".tasks-view-list");
const statuses = ["Backlog", "Todo", "In Progress", "Done", "Archived"];

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
  await renderTaskList();
};

const createTaskItem = async (task, status, index) => {
  const taskLink = await api.createLink(task.noteId, { showTooltip: true });
  const taskLinkHtml = taskLink.prop("outerHTML");
  let $taskItem = $(
    `<li class="${index % 2 === 0 ? "even" : "odd"}">${taskLinkHtml}</li>`,
  );

  const statusButtons = {
    Backlog: ["Todo"],
    Todo: ["In Progress", "Backlog"],
    "In Progress": ["Todo", "Done"],
    Done: ["Todo", "Archived"],
    Archived: ["Todo"],
  };

  statusButtons[status].forEach((buttonStatus) => {
    const $button = $(
      `<button class="btn btn-sm btn-primary">${buttonStatus}</button>`,
    );
    $button.on("click", () =>
      moveTaskToStatus(task.noteId, buttonStatus, status),
    );
    $taskItem.append($button);
  });

  return $taskItem;
};

const createStatusList = async (status) => {
  const $statusHeader = $(`<h3>${status}</h3>`);
  const $statusList = $(`<ul class="status-list" id="${status}-list"></ul>`);

  const tasks = await api.searchForNotes(
    `note.parents.labels.tasksStatus="${status}"`,
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

renderTaskList();
