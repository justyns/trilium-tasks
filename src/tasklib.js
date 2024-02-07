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

const addHistoryLog = (note, message) => {
  let noteContent = note.getContent();
  let historyIndex = noteContent.indexOf("<h2>History</h2>");

  if (historyIndex === -1) {
    noteContent += "\n<p></p>\n<h2>History</h2>\n<ul>\n";
  } else {
    // Find the last </ul> tag if it exists
    let lastIndex = noteContent.lastIndexOf("</ul>");
    if (lastIndex !== -1) {
      // Remove the closing </ul> tag
      noteContent = noteContent.substring(0, lastIndex);
    }
  }

  noteContent += `<li>${message}</li>\n`;

  // Always ensure the closing </ul> tag is present
  if (!noteContent.endsWith("</ul>\n")) {
    noteContent += "</ul>\n";
  }

  note.setContent(noteContent);
};

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
  delete taskCache.del(taskId);
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
    const expireAt = now + (ttl * 1000);

    // Store value along with expiration time
    const item = { value, expireAt };
    this.memoryCache[key] = item;

    // Also update Local Storage
    localStorage.setItem(key, JSON.stringify(item));
    console.log("Stored in cache with TTL:", key);
  }

  // Retrieves an item from the cache, considering its TTL
  get(key) {
    const item = this.memoryCache[key];
    const now = new Date().getTime();

    if (item && now < item.expireAt) {
      console.log("Retrieved from memory cache:", key);
      return item.value;
    }

    // TODO: This is broken for now
    return null;
    // Try Local Storage if not in memory or expired
    const storedItem = localStorage.getItem(key);
    if (storedItem) {
      const parsedItem = JSON.parse(storedItem);
      if (now < parsedItem.expireAt) {
        console.log("Retrieved from Local Storage:", key);
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
};
