// In-memory cache for tasks
let taskCache = {};

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
  delete taskCache[taskId];
};

module.exports = {
  getNoteTags,
  countSubtasks,
  addHistoryLog,
  moveTaskToStatus
};
