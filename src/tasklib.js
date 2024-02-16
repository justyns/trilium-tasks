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

const addHistoryLog = (noteId, message) => {
  // This function runs on the backend, so it can't use async/await.
  const note = api.getNote(noteId);
  let noteContent = note.getContent();
  let historyIndex = noteContent.indexOf("<h2>History</h2>");
  const date = new Date();
  const timestamp = date.toISOString();
  message = `<strong>${timestamp}</strong>: ${message}`;

  if (historyIndex === -1) {
    noteContent += "\n<p></p>\n<h2>History</h2>\n<ul>\n";
    noteContent += `<li>${message}</li>\n</ul>\n`;
  } else {
    // Find the last </ul> tag in the history section
    let historyEndIndex = noteContent.indexOf("</ul>", historyIndex);
    if (historyEndIndex !== -1) {
      // Insert the new log entry before the closing </ul> tag in the history section
      noteContent =
        noteContent.substring(0, historyEndIndex) +
        `<li>${message}</li>\n` +
        noteContent.substring(historyEndIndex);
    }
  }

  note.setContent(noteContent);
};

const addTaskLog = async (noteId, message) => {
  const note = await api.getNote(noteId);
  let noteContent = await note.getContent();
  let notesIndex = noteContent.indexOf("<h2>Notes</h2>");
  const date = new Date();
  const timestamp = date.toISOString();
  message = `<strong>${timestamp}</strong>: ${message}`;

  if (notesIndex === -1) {
    noteContent += "\n<p></p>\n<h2>Notes</h2>\n<ul>\n";
    noteContent += `<li>${message}</li>\n</ul>\n`;
  } else {
    // Find the last </ul> tag in the notes section
    let notesEndIndex = noteContent.indexOf("</ul>", notesIndex);
    if (notesEndIndex !== -1) {
      // Insert the new log entry before the closing </ul> tag in the notes section
      noteContent =
        noteContent.substring(0, notesEndIndex) +
        `<li>${message}</li>\n` +
        noteContent.substring(notesEndIndex);
    }
  }

  await api.runOnBackend(
    (noteId, noteContent) => {
      const note = api.getNote(noteId);
      note.setContent(noteContent);
    },
    [noteId, noteContent],
  );
};

const moveTaskToStatus = async (taskId, newStatus, currentStatus) => {
  const statusNote = await api.searchForNote(`#tasksStatus="${newStatus}"`);
  let oldStatusNote;
  
  if (currentStatus === "Archived") {
    const taskNote = await api.getNote(taskId);
    oldStatusNote = taskNote.getParentNotes()[0]; // This will get the month note which is the direct parent of the task
  } else {
    oldStatusNote = await api.searchForNote(`#tasksStatus="${currentStatus}"`);
  }
  console.log("old status", oldStatusNote, "new status", newStatus, "current status", currentStatus);

  if (newStatus === "Archived") {
    await archiveTask(taskId, currentStatus);
  } else {
    await api.runOnBackend(
      (noteId, newStatusNoteId, oldStatusNoteId) => {
        api.toggleNoteInParent(true, noteId, newStatusNoteId);
        api.toggleNoteInParent(false, noteId, oldStatusNoteId);
      },
      [taskId, statusNote.noteId, oldStatusNote.noteId],
    );
    await api.waitUntilSynced();
    api.showMessage(`Task status set to ${newStatus}`);
  }
  taskCache.del(taskId);
};

const archiveTask = async (taskId, currentStatus) => {
  const archiveNote = await api.searchForNote(`#tasksStatus="Archived"`);
  const oldStatusNote = await api.searchForNote(
    `#tasksStatus="${currentStatus}"`,
  );

  const date = new Date();
  const year = date.getFullYear();
  const month = date.getMonth();

  // Check if the year folder exists under the archive note
  let yearNote = await api.searchForNote(`#archiveYear="${year}"`, archiveNote.noteId);
  if (!yearNote) {
    // If the year folder doesn't exist, create it
    yearNote = await api.runOnBackend(
      (parentNoteId, title) => {
        const note = api.createTextNote(parentNoteId, title, "");
        note.note.setLabel("archiveYear", title);
        return note.note.noteId;
      },
      [archiveNote.noteId, year.toString()],
    );
  } else {
    yearNote = yearNote.noteId;
  }

  // Check if the month folder exists under the year note
  let monthNote = await api.searchForNote(`#archiveMonth="${month}"`, yearNote);
  if (!monthNote) {
    // If the month folder doesn't exist, create it
    monthNote = await api.runOnBackend(
      (parentNoteId, title) => {
        const note = api.createTextNote(parentNoteId, title, "");
        note.note.setLabel("archiveMonth", title);
        return note.note.noteId;
      },
      [yearNote, month.toString()],
    );
  } else {
    monthNote = monthNote.noteId;
  }

  // Move the task to the month folder
  await api.runOnBackend(
    (noteId, newStatusNoteId, oldStatusNoteId) => {
      api.toggleNoteInParent(true, noteId, newStatusNoteId);
      api.toggleNoteInParent(false, noteId, oldStatusNoteId);
    },
    [taskId, monthNote, oldStatusNote.noteId],
  );
  await api.waitUntilSynced();
  api.showMessage(`Task archived to ${year}/${month}`);
  // Invalidate cache for this note id
  taskCache.del(taskId);
};


class TaskCache {
  constructor() {
    this.memoryCache = {}; // In-memory cache

    window.addEventListener("storage", (event) => {
      if (event.storageArea === localStorage && event.key) {
        // Invalidate the in-memory cache for the key that changed
        delete this.memoryCache[event.key];
        console.log(
          `Cache for ${event.key} invalidated due to update in another session.`,
        );
      }
    });
  }

  del(key) {
    this.memoryCache[key] = null;
    localStorage.removeItem(key);
  }

  // Adds or updates an item in the cache with a TTL
  set(key, value, ttl) {
    const now = new Date().getTime();
    // Turn ttl into seconds
    const expireAt = now + ttl * 1000;

    // Store value along with expiration time
    const item = { value, expireAt };
    this.memoryCache[key] = item;

    // Also update Local Storage
    localStorage.setItem(key, JSON.stringify(item));
    // console.log("Stored in cache with TTL:", key);
  }

  // Retrieves an item from the cache, considering its TTL
  get(key) {
    const item = this.memoryCache[key];
    const now = new Date().getTime();

    if (item && now < item.expireAt) {
      // console.log("Retrieved from memory cache:", key);
      return item.value;
    }

    // TODO: This is broken for now
    return null;
    // Try Local Storage if not in memory or expired
    const storedItem = localStorage.getItem(key);
    if (storedItem) {
      const parsedItem = JSON.parse(storedItem);
      if (now < parsedItem.expireAt) {
        // console.log("Retrieved from Local Storage:", key);
        return parsedItem.value;
      } else {
        // Expired in Local Storage, remove it
        localStorage.removeItem(key);
      }
    }

    // Item is expired or not found
    return null;
  }
}

let taskCache = new TaskCache();

module.exports = {
  getNoteTags,
  countSubtasks,
  addHistoryLog,
  moveTaskToStatus,
  taskCache,
  addTaskLog,
};
