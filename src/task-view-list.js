const $tasksList = api.$container.find(".tasks-view-list");
const $addTaskButton = $("#add-task-button");
const $newTaskInput = $("#new-task-input");
const statuses = ["In Progress", "Todo", "Backlog", "Done"];

// tasklib needs to be a child note (clone)
// TODO: Can I require/import a note from somewhere else instead?
// const tasklib = require("./tasklib");

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

// TODO: Re-use this and the code in task-widget.js instead of duplicating
const changeTaskTags = async (taskId) => {
  const tagsRootNotes = await api.searchForNotes("#tasksTagsRoot");
  console.log("tagsRootNotes: ", tagsRootNotes);
  const tagsRootNote = tagsRootNotes[0];
  if (!tagsRootNote) {
    api.showError("Tags root note not found.");
    return;
  }

  const tags = await api.searchForNotes(
    `note.ancestors.noteId = ${tagsRootNote.noteId} and note.noteId != ${tagsRootNote.noteId} `,
  );
  const tagMapping = {};
  tags.forEach((tag) => {
    tagMapping[tag.title] = tag.noteId;
  });

  const existingTags = await getNoteTags(taskId);

  // Create a new dialog for tag selection
  const availableTags = tags.map((tag) => tag.title).join(", ");
  const $dialog = $(`
    <div class="modal" tabindex="-1" role="dialog">
      <div class="modal-dialog" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Select Tags</h5>
            <button type="button" class="close" data-dismiss="modal" aria-label="Close">
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div class="modal-body">
            <p>Available tags: ${availableTags}</p>
            <p>Please pick one or more tags.</p>
            <input class="form-control" id="tag-autocomplete" type="text" placeholder="Start typing to search tags...">
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-primary" id="save-tags">Save changes</button>
            <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
          </div>
        </div>
      </div>
    </div>
  `);
  // Initialize autocomplete on the input field
  // TODO: Figure out how to re-use the built-in autocomplete?
  $dialog.find("#tag-autocomplete").autocomplete({
    source: function (request, response) {
      // Use the previously found tags for autocomplete
      const autocompleteData = tags
        .filter((tag) => tag.title.includes(request.term))
        .map((tag) => ({
          label: tag.title,
          value: tag.noteId,
        }));

      // Call the response function with the autocomplete data
      response(autocompleteData);
    },
    select: function (event, ui) {
      // When a tag is selected, set the value of the input field to the tag's title
      $(this).val(ui.item.label);
      return false;
    },
  });

  // Set the input field to show the existing tags by default
  $dialog.find("#tag-autocomplete").val(existingTags.join(", "));

  // When the save button is clicked, update the tags
  $dialog.find("#save-tags").on("click", async () => {
    const selectedTags = $dialog
      .find("#tag-autocomplete")
      .val()
      .split(",")
      .map((tag) => tag.trim());
    var newTagIds = [];
    selectedTags.forEach((tag) => {
      const tagNoteId = tagMapping[tag];
      if (tagNoteId) {
        newTagIds.push(tagNoteId);
      }
    });

    api.runOnBackend(
      (noteId, newTagIds) => {
        const note = api.getNote(noteId);
        const existingTagIds = note
          .getRelations("tag")
          .map((rel) => rel.targetNoteId);

        const tagsToAdd = newTagIds.filter(
          (id) => !existingTagIds.includes(id),
        );
        const tagsToRemove = existingTagIds.filter(
          (id) => !newTagIds.includes(id),
        );

        tagsToRemove.forEach((tagNoteId) => {
          note.removeRelation("tag", tagNoteId);
        });
        tagsToAdd.forEach((tagNoteId) => {
          note.addRelation("tag", tagNoteId);
        });
      },
      [taskId, newTagIds],
    );
    api.showMessage(`Tags set to ${selectedTags.join(", ")}`);
    // Invalidate cache for this note id
    delete taskCache[taskId];
    await renderTaskList();

    // Close the dialog
    $dialog.modal("hide");
  });

  // Show the dialog
  $dialog.modal("show");
};

const countSubtasks = async (noteId) => {
  const note = await api.getNote(noteId);
  let noteContent = await note.getContent();

  const checkedRegex = /<input[^>]*type="checkbox"[^>]*checked[^>]*>/g;
  const uncheckedRegex = /<input[^>]*type="checkbox"[^>]*>/g;

  const checkedCount = (noteContent.match(checkedRegex) || []).length;
  const uncheckedCount =
    (noteContent.match(uncheckedRegex) || []).length - checkedCount;

  return { checkedCount, uncheckedCount };
};

const getNoteTags = async (noteId) => {
  const note = await api.getNote(noteId);
  const tagIds = await note.getOwnedRelations("tag");
  const tags = [];

  for (const tag of tagIds) {
    const tagNote = await api.getNote(tag.value);
    tags.push(tagNote.title);
  }

  return tags;
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

  // Get subtask counts
  const { checkedCount, uncheckedCount } = await countSubtasks(task.noteId);
  const subtaskCountHtml =
    checkedCount + uncheckedCount > 0
      ? `<div>Subtasks: ${checkedCount}/${checkedCount + uncheckedCount}</div>`
      : "";

  // Get task tags
  const tags = await getNoteTags(task.noteId);
  const tagsHtml = tags.length > 0 ? `<div>Tags: ${tags.join(", ")}</div>` : "";

  let $taskItem = $(
    `<li class="task-item ${index % 2 === 0 ? "even" : "odd"} ${status}">
      <div class="task-content">${taskLinkHtml}</div>
      <div class="task-metadata">
        <div>Created: ${formattedDateCreated}</div>
        <div>Modified: ${formattedDateModified}</div>
        ${subtaskCountHtml}
        ${tagsHtml}
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
      `<button class="btn btn-sm btn-primary task-button" style="margin-right: 5px;" data-task-id="${task.noteId}" data-new-status="${buttonStatus}" data-current-status="${status}">${buttonStatus}</button>`,
    );
    $taskButtons.append($button);
  });

  const $tagButton = $(
    `<button class="btn btn-sm btn-primary task-button-tags" style="margin-right: 5px;" data-task-id="${task.noteId}">Tags</button>`,
  );
  $taskButtons.append($tagButton);

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
$tasksList.on("click", ".task-button", function () {
  const taskId = $(this).data("task-id");
  const newStatus = $(this).data("new-status");
  const currentStatus = $(this).data("current-status");
  moveTaskToStatus(taskId, newStatus, currentStatus);
});
$tasksList.on("click", ".task-button-tags", function () {
  const taskId = $(this).data("task-id");
  changeTaskTags(taskId);
});

renderTaskList();
