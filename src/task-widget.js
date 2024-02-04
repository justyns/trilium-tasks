class TaskControlWidget extends api.NoteContextAwareWidget {
    constructor() {
        super();
        this.taskStatuses = ['Backlog', 'Todo', 'In Progress', 'Done', 'Archived'];
        this.tagsRootLabel = 'tasksTagsRoot';
        this.taskRootLabel = 'tasksRoot';
    }

    get position() { return 99; }
    get parentWidget() { return "center-pane"; }

    isEnabled() {
      api.log("isEnabled?");
      return true;
      // return super.isEnabled() && this.shouldShow();
    }

    async doRender() {
        const widgetStyles = "padding: 10px; border-top: 1px solid var(--main-border-color); contain: none;";
        this.$widget = $(`<div style="${widgetStyles}" id="task-control-widget">`);
        // Create buttons for each task status
        this.taskStatuses.forEach(status => {
            const $button = $(`<button class="btn btn-sm btn-primary">${status}</button>`);
            $button.on('click', () => this.setTaskStatus(status));
            this.$widget.append($button);
        });

        // Create button for tag selection
        const $tagButton = $(`<button class="btn btn-sm btn-primary">Tags</button>`);
        $tagButton.on('click', () => this.selectTags());
        this.$widget.append($tagButton);
        this.$widget.append($('</div>'));

        return this.$widget;
    }

    async setTaskStatus(status) {
        const activeNote = api.getActiveContextNote();
        const statusNote = await api.searchForNote(`#tasksStatus="${status}"`);
        console.log(`Cloning ${activeNote.noteId} to ${statusNote}`);
        const oldStatusId = await this.note.getOwnedRelationValue('taskStatus');
        console.log(`Old status: ${oldStatusId}`);
        // note.setRelation("taskStatus", parentNote.noteId);
        // await api.setAttribute(noteId, 'taskStatus', status);
        await api.runOnBackend((noteId, newStatusNoteId, oldStatusId) => {
          // note.cloneTo(newStatusNoteId);
          // Not sure if cloneTo does something different, but we'd need to delete the old branch anyway
          api.toggleNoteInParent(true, noteId, newStatusNoteId);
          api.toggleNoteInParent(false, noteId, oldStatusId);
        }, [activeNote.noteId, statusNote.noteId, oldStatusId])
        await api.waitUntilSynced();
        api.showMessage(`Task status set to ${status}`);
    }

    async selectTags() {
        const tagsRootNote = await this.getTagsRootNote();
        if (!tagsRootNote) {
            api.showError("Tags root note not found.");
            return;
        }

        const tags = await api.searchForNotes(`note.ancestors.noteId = ${tagsRootNote.noteId} and note.noteId != ${tagsRootNote.noteId} `)
        const tagOptions = tags.map(tag => tag.title).join(', ');
        var tagMapping = {};
        tags.forEach(tag => {
            tagMapping[tag.title] = tag.noteId;
        });
        console.log("Tag Mapping: ", tagMapping);
        console.log("Found tags: " + tagOptions);

        const selectedTags = await api.showPromptDialog({
            title: "Select Tags",
            message: "Choose tags:",
            defaultValue: tagOptions
        });

        if (selectedTags) {
            const selectedTagList = selectedTags.split(',').map(tag => tag.trim());
            var newTagIds = [];
            selectedTagList.forEach(tag => {
                const tagNoteId = tagMapping[tag];
                if (tagNoteId) {
                    newTagIds.push(tagNoteId);
                }
            });
            api.runOnBackend((noteId, newTagIds) => {
                const note = api.getNote(noteId);
                const existingTags = note.getRelations('tag').map(rel => rel.targetNoteId);

                const tagsToAdd = newTagIds.filter(id => !existingTags.includes(id));
                const tagsToRemove = existingTags.filter(id => !newTagIds.includes(id));

                tagsToRemove.forEach(tagNoteId => {
                    note.removeRelation('tag', tagNoteId);
                });
                tagsToAdd.forEach(tagNoteId => {
                    note.addRelation('tag', tagNoteId);
                });
            }, [this.note.noteId, newTagIds]);
            api.showMessage(`Tags set to ${selectedTagList.join(', ')}`);
        }
    }

    async shouldShow() {
        const activeNoteId = api.getActiveContextNote();
        api.log("active note id: " + activeNoteId);
        const isUnderTaskRoot = await this.isNoteUnderTaskRoot(activeNoteId);
        return isUnderTaskRoot;
    }

    async isNoteUnderTaskRoot(noteId) {
        const notePath = await api.getNotePath(noteId);
        api.log("notePath: " + notePath);
        return notePath.some(note => note.labels.includes(this.taskRootLabel));
    }

    async getTagsRootNote() {
        const tagsRootNotes = await api.searchForNotes("#tasksTagsRoot");
        return tagsRootNotes.length > 0 ? tagsRootNotes[0] : null;
    }
}

module.exports = new TaskControlWidget();
