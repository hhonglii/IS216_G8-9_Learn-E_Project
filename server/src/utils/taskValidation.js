// Checks a group's task board before it is saved: each task needs a title and a
// known status; an evidence link must be http(s); an owner must be in the group;
// an existing task's id must belong to the group and appear once. Returns one
// { field, message } per problem; an empty list means the tasks are fine.
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
// adds single entry of field, message to problem list
const addProblem = (details, field, message) => details.push({ field, message });
const statuses = ["todo", "in-progress", "done"];
export function validateTasks(tasks, group) {
    const details = [];
    const seen = new Set();
    if (!Array.isArray(tasks)) {
        return [{field: "tasks", message: "Reload the page, then try again."}];
    } tasks.forEach((task, index) => {
        const path = `tasks.${index}`;
        if(!isObject(task)) {
            addProblem(details, path, "Reload the page, then try again.");
            return;
        }
    if (typeof task.title !== "string" || task.title.trim().length === 0) {
        addProblem(details, `${path}.title`, "Give the task a title.");
    }
    if (!statuses.includes(task.status)) {
        addProblem(details, `${path}.status`, "Choose To do, In progress or Done.");
    }
    if (task.evidenceUrl !== undefined && task.evidenceUrl !== null && task.evidenceUrl !== "") {
        if (typeof task.evidenceUrl !== "string" || !(task.evidenceUrl.startsWith("http://") || task.evidenceUrl.startsWith("https://"))) {
            addProblem(details, `${path}.evidenceUrl`, "Evidence links must start with http:// or https://.");
        }
    }
    if (task.ownerId !== undefined && task.ownerId !== null && task.ownerId !== "") {
        const isGroupMember = group.memberIds.some((memberId) => String(memberId) === String(task.ownerId));
        if (!isGroupMember) {
            addProblem(details, `${path}.ownerId`, "Choose an owner from this group.");
        }
    }
    if (task.id !== undefined) {
        const belongsToGroup = group.tasks.some((existing) => String(existing._id) === String(task.id));
        if (!belongsToGroup) {
            addProblem(details, `${path}.id`, "This task isn't in your group any more. Reload the page, then try again.");
        } else if (seen.has(String(task.id))) {
            addProblem(details, `${path}.id`, "This task appears twice. Reload the page, then try again.");
        } seen.add(String(task.id));
    }
    });
    return details
}