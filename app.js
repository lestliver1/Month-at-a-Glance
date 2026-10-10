const STORAGE_KEY = "month-at-a-glance-events-v1";

const monthTitle = document.querySelector("#monthTitle");
const calendarGrid = document.querySelector("#calendarGrid");
const eventDialog = document.querySelector("#eventDialog");
const eventForm = document.querySelector("#eventForm");
const eventIdInput = document.querySelector("#eventId");
const eventNameInput = document.querySelector("#eventName");
const eventDateInput = document.querySelector("#eventDate");
const eventStartTimeInput = document.querySelector("#eventStartTime");
const eventEndTimeInput = document.querySelector("#eventEndTime");
const eventSpanInput = document.querySelector("#eventSpan");
const eventRepeatInput = document.querySelector("#eventRepeat");
const skipDatesSection = document.querySelector("#skipDatesSection");
const skipDateInput = document.querySelector("#skipDate");
const addSkipDateButton = document.querySelector("#addSkipDateButton");
const skipDateList = document.querySelector("#skipDateList");
const dialogTitle = document.querySelector("#dialogTitle");
const dialogEyebrow = document.querySelector("#dialogEyebrow");
const deleteEventButton = document.querySelector("#deleteEventButton");
const nameError = document.querySelector("#nameError");
const timeError = document.querySelector("#timeError");
const toast = document.querySelector("#toast");
const shareDialog = document.querySelector("#shareDialog");
const shareForm = document.querySelector("#shareForm");
const shareEventList = document.querySelector("#shareEventList");
const shareLinkResult = document.querySelector("#shareLinkResult");
const shareLinkInput = document.querySelector("#shareLink");

let activeMonth = startOfMonth(new Date());
let events = loadEvents();
let toastTimer;
let skippedDates = [];
let isSharedView = false;

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function loadEvents() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveEvents() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

function encodeSharePayload(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeSharePayload(value) {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    return payload?.v === 1 && Array.isArray(payload.events) ? payload : null;
  } catch {
    return null;
  }
}

function loadSharedView() {
  const payload = decodeSharePayload(new URLSearchParams(window.location.search).get("share") || "");
  if (!payload) return false;
  events = payload.events.filter((event) => event && typeof event.name === "string" && typeof event.date === "string");
  isSharedView = true;
  document.body.classList.add("shared-view");
  document.querySelector(".footer-note").textContent = "Read-only shared calendar";
  return true;
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function daysBetween(start, end) {
  return Math.round((end - start) / 86400000);
}

function occurrenceRange(event, start) {
  const span = event.span || "day";
  if (span === "whole-month") {
    return { start: new Date(start.getFullYear(), start.getMonth(), 1), end: endOfMonth(start) };
  }
  if (span === "until-month-end") return { start, end: endOfMonth(start) };
  return { start, end: start };
}

function monthlyOccurrenceStart(event, target) {
  const start = parseDateKey(event.date);
  const monthsApart = (target.getFullYear() - start.getFullYear()) * 12 + target.getMonth() - start.getMonth();
  if (monthsApart < 0) return null;
  const candidateMonth = new Date(start.getFullYear(), start.getMonth() + monthsApart, 1);
  const day = event.span === "whole-month" ? 1 : Math.min(start.getDate(), endOfMonth(candidateMonth).getDate());
  return new Date(candidateMonth.getFullYear(), candidateMonth.getMonth(), day);
}

function isSkipped(event, occurrenceStart) {
  return (event.skipDates || []).includes(toDateKey(occurrenceStart));
}

function eventOccursOn(event, date) {
  const start = parseDateKey(event.date);
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (target < start) return false;
  if (event.repeat === "none") {
    const range = occurrenceRange(event, start);
    return target >= range.start && target <= range.end;
  }
  if (event.repeat === "weekly") {
    const elapsedDays = Math.round((target - start) / 86400000);
    const occurrenceStart = new Date(start);
    occurrenceStart.setDate(start.getDate() + Math.floor(elapsedDays / 7) * 7);
    const range = occurrenceRange(event, occurrenceStart);
    return !isSkipped(event, occurrenceStart) && target >= range.start && target <= range.end;
  }
  const occurrenceStart = monthlyOccurrenceStart(event, target);
  if (!occurrenceStart) return false;
  const range = occurrenceRange(event, occurrenceStart);
  return !isSkipped(event, occurrenceStart) && target >= range.start && target <= range.end;
}

function eventsForDate(date) {
  return events
    .filter((event) => eventOccursOn(event, date))
    .sort((a, b) => (a.startTime || a.time).localeCompare(b.startTime || b.time) || a.name.localeCompare(b.name));
}

function formatTime(time) {
  const [hour, minute] = time.split(":").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(2000, 0, 1, hour, minute));
}

function eventTimeRange(event) {
  const startTime = event.startTime || event.time;
  const endTime = event.endTime || startTime;
  return startTime === endTime ? formatTime(startTime) : `${formatTime(startTime)}–${formatTime(endTime)}`;
}

function renderCalendar() {
  monthTitle.textContent = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(activeMonth);

  calendarGrid.replaceChildren();
  const firstVisible = new Date(activeMonth);
  firstVisible.setDate(1 - activeMonth.getDay());
  const todayKey = toDateKey(new Date());

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(firstVisible);
    date.setDate(firstVisible.getDate() + index);
    const dateKey = toDateKey(date);
    const dayEvents = eventsForDate(date);
    const isOutside = date.getMonth() !== activeMonth.getMonth();

    const cell = document.createElement("article");
    cell.className = "day-cell";
    if (isOutside) cell.classList.add("outside-month");
    if (dateKey === todayKey) cell.classList.add("today");
    cell.setAttribute("aria-label", new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(date));

    const header = document.createElement("div");
    header.className = "day-header";

    const number = document.createElement("span");
    number.className = "day-number";
    number.textContent = date.getDate();

    header.append(number);
    if (!isSharedView) {
      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.className = "add-day-button";
      addButton.textContent = "+";
      addButton.setAttribute("aria-label", `Add event on ${new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(date)}`);
      addButton.addEventListener("click", () => openNewEvent(dateKey));
      header.append(addButton);
    }
    cell.append(header);

    const list = document.createElement("div");
    list.className = "event-list";
    const visibleEvents = dayEvents.slice(0, 3);

    visibleEvents.forEach((event) => {
      const chip = document.createElement(isSharedView ? "div" : "button");
      if (!isSharedView) chip.type = "button";
      chip.className = `event-chip ${event.repeat !== "none" ? "recurring" : ""}`;
      chip.title = `${eventTimeRange(event)} — ${event.name}${event.repeat !== "none" ? ` (${event.repeat})` : ""}`;
      chip.innerHTML = `<span class="event-time"></span><span class="event-name"></span>`;
      chip.querySelector(".event-time").textContent = eventTimeRange(event);
      chip.querySelector(".event-name").textContent = event.name;
      if (!isSharedView) chip.addEventListener("click", () => openEditEvent(event.id));
      list.append(chip);
    });

    if (dayEvents.length > visibleEvents.length) {
      const more = document.createElement("div");
      more.className = "more-count";
      more.textContent = `+${dayEvents.length - visibleEvents.length} more`;
      list.append(more);
    }

    cell.append(list);
    calendarGrid.append(cell);
  }
}

function openNewEvent(dateKey = toDateKey(new Date())) {
  eventForm.reset();
  eventIdInput.value = "";
  eventDateInput.value = dateKey;
  eventStartTimeInput.value = "09:00";
  eventEndTimeInput.value = "10:00";
  eventSpanInput.value = "day";
  eventRepeatInput.value = "none";
  skippedDates = [];
  dialogTitle.textContent = "Add an event";
  dialogEyebrow.textContent = "Plan your day";
  deleteEventButton.hidden = true;
  nameError.textContent = "";
  timeError.textContent = "";
  updateSkipDatesUI();
  eventDialog.showModal();
  requestAnimationFrame(() => eventNameInput.focus());
}

function openEditEvent(id) {
  const event = events.find((item) => item.id === id);
  if (!event) return;
  eventIdInput.value = event.id;
  eventNameInput.value = event.name;
  eventDateInput.value = event.date;
  eventStartTimeInput.value = event.startTime || event.time;
  eventEndTimeInput.value = event.endTime || event.startTime || event.time;
  eventSpanInput.value = event.span || "day";
  eventRepeatInput.value = event.repeat;
  skippedDates = [...(event.skipDates || [])];
  dialogTitle.textContent = "Edit event";
  dialogEyebrow.textContent = "Update your plan";
  deleteEventButton.hidden = false;
  nameError.textContent = "";
  timeError.textContent = "";
  updateSkipDatesUI();
  eventDialog.showModal();
  requestAnimationFrame(() => eventNameInput.focus());
}

function closeDialog() {
  eventDialog.close();
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("visible");
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2200);
}

function formatDateLabel(dateKey) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(parseDateKey(dateKey));
}

function openShareDialog() {
  shareLinkResult.hidden = true;
  shareLinkInput.value = "";
  shareEventList.replaceChildren();
  if (!events.length) {
    const empty = document.createElement("p");
    empty.className = "share-empty";
    empty.textContent = "Add an event before creating a shared calendar.";
    shareEventList.append(empty);
  } else {
    events
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || a.time).localeCompare(b.startTime || b.time))
      .forEach((event) => {
        const row = document.createElement("div");
        row.className = "share-event-row";
        const details = document.createElement("div");
        details.innerHTML = '<div class="share-event-name"></div><div class="share-event-meta"></div>';
        details.querySelector(".share-event-name").textContent = event.name;
        details.querySelector(".share-event-meta").textContent = `${formatDateLabel(event.date)} · ${eventTimeRange(event)}`;
        const visibility = document.createElement("select");
        visibility.dataset.eventId = event.id;
        visibility.setAttribute("aria-label", `Sharing setting for ${event.name}`);
        visibility.innerHTML = '<option value="show">Show details</option><option value="disguise">Disguise as Busy</option><option value="hide">Hide from link</option>';
        row.append(details, visibility);
        shareEventList.append(row);
      });
  }
  shareDialog.showModal();
}

function createShareLink() {
  const choices = new Map([...shareEventList.querySelectorAll("select")].map((select) => [select.dataset.eventId, select.value]));
  const sharedEvents = events.flatMap((event) => {
    const choice = choices.get(event.id) || "show";
    if (choice === "hide") return [];
    return [{ ...event, name: choice === "disguise" ? "Busy" : event.name }];
  });
  const payload = encodeSharePayload({ v: 1, events: sharedEvents });
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("share", payload);
  shareLinkInput.value = url.toString();
  shareLinkResult.hidden = false;
  shareLinkInput.focus();
  shareLinkInput.select();
}

function updateSkipDatesUI() {
  const repeats = eventRepeatInput.value !== "none";
  skipDatesSection.hidden = !repeats;
  skipDateList.replaceChildren();
  skippedDates.sort().forEach((dateKey) => {
    const chip = document.createElement("span");
    chip.className = "skip-date-chip";
    chip.textContent = formatDateLabel(dateKey);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.setAttribute("aria-label", `Stop skipping ${formatDateLabel(dateKey)}`);
    remove.textContent = "×";
    remove.addEventListener("click", () => {
      skippedDates = skippedDates.filter((item) => item !== dateKey);
      updateSkipDatesUI();
    });
    chip.append(remove);
    skipDateList.append(chip);
  });
}

eventForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = eventNameInput.value.trim();
  if (!name) {
    nameError.textContent = "Please add a short event name.";
    eventNameInput.focus();
    return;
  }
  if (!eventDateInput.value || !eventStartTimeInput.value || !eventEndTimeInput.value) return;
  if (eventEndTimeInput.value <= eventStartTimeInput.value) {
    timeError.textContent = "End time must be later than start time.";
    eventEndTimeInput.focus();
    return;
  }
  timeError.textContent = "";

  const id = eventIdInput.value;
  const selectedDate = parseDateKey(eventDateInput.value);
  const eventDate = eventSpanInput.value === "whole-month"
    ? toDateKey(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1))
    : eventDateInput.value;
  const savedEvent = {
    id: id || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
    name,
    date: eventDate,
    time: eventStartTimeInput.value,
    startTime: eventStartTimeInput.value,
    endTime: eventEndTimeInput.value,
    span: eventSpanInput.value,
    repeat: eventRepeatInput.value,
    skipDates: eventRepeatInput.value === "none" ? [] : [...skippedDates],
  };

  if (id) {
    events = events.map((item) => item.id === id ? savedEvent : item);
  } else {
    events.push(savedEvent);
  }

  saveEvents();
  activeMonth = startOfMonth(parseDateKey(savedEvent.date));
  renderCalendar();
  closeDialog();
  showToast(id ? "Event updated" : "Event added");
});

deleteEventButton.addEventListener("click", () => {
  const id = eventIdInput.value;
  if (!id) return;
  events = events.filter((event) => event.id !== id);
  saveEvents();
  renderCalendar();
  closeDialog();
  showToast("Event deleted");
});

document.querySelector("#newEventButton").addEventListener("click", () => openNewEvent());
document.querySelector("#shareButton").addEventListener("click", openShareDialog);
document.querySelector("#closeShareDialogButton").addEventListener("click", () => shareDialog.close());
document.querySelector("#cancelShareButton").addEventListener("click", () => shareDialog.close());
shareForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!events.length) return;
  createShareLink();
});
document.querySelector("#copyShareLinkButton").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(shareLinkInput.value);
    showToast("Read-only link copied");
  } catch {
    shareLinkInput.focus();
    shareLinkInput.select();
    showToast("Select and copy the link");
  }
});
document.querySelector("#closeDialogButton").addEventListener("click", closeDialog);
document.querySelector("#cancelButton").addEventListener("click", closeDialog);
eventRepeatInput.addEventListener("change", updateSkipDatesUI);
addSkipDateButton.addEventListener("click", () => {
  const dateKey = skipDateInput.value;
  if (!dateKey || skippedDates.includes(dateKey)) return;
  skippedDates.push(dateKey);
  skipDateInput.value = "";
  updateSkipDatesUI();
});
document.querySelector("#previousMonth").addEventListener("click", () => {
  activeMonth = new Date(activeMonth.getFullYear(), activeMonth.getMonth() - 1, 1);
  renderCalendar();
});
document.querySelector("#nextMonth").addEventListener("click", () => {
  activeMonth = new Date(activeMonth.getFullYear(), activeMonth.getMonth() + 1, 1);
  renderCalendar();
});
document.querySelector("#todayButton").addEventListener("click", () => {
  activeMonth = startOfMonth(new Date());
  renderCalendar();
});

eventDialog.addEventListener("click", (event) => {
  if (event.target === eventDialog) closeDialog();
});
shareDialog.addEventListener("click", (event) => {
  if (event.target === shareDialog) shareDialog.close();
});

loadSharedView();

if (!isSharedView && document.modelContext?.registerTool) {
  const register = (tool) => Promise.resolve(document.modelContext.registerTool(tool)).catch(() => {});
  register({
    name: "create_calendar_event",
    title: "Create calendar event",
    description: "Create an event in the monthly planner and update the visible calendar.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 60 },
        date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        startTime: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
        endTime: { type: "string", pattern: "^\\d{2}:\\d{2}$" },
        span: { type: "string", enum: ["day", "until-month-end", "whole-month"] },
        repeat: { type: "string", enum: ["none", "weekly", "monthly"] },
        skipDates: { type: "array", items: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" } },
      },
      required: ["name", "date", "startTime", "endTime", "span", "repeat"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute(input) {
      if (!input || typeof input.name !== "string" || !input.name.trim() ||
          !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{2}:\d{2}$/.test(input.startTime) ||
          !/^\d{2}:\d{2}$/.test(input.endTime) || input.endTime <= input.startTime ||
          !["day", "until-month-end", "whole-month"].includes(input.span) || !["none", "weekly", "monthly"].includes(input.repeat)) {
        throw new Error("Invalid event details");
      }
      const createdDate = input.span === "whole-month"
        ? toDateKey(new Date(parseDateKey(input.date).getFullYear(), parseDateKey(input.date).getMonth(), 1))
        : input.date;
      const created = { ...input, date: createdDate, time: input.startTime, skipDates: input.repeat === "none" ? [] : (input.skipDates || []), name: input.name.trim(), id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) };
      events.push(created);
      saveEvents();
      activeMonth = startOfMonth(parseDateKey(created.date));
      renderCalendar();
      return { id: created.id, status: "created" };
    },
  });
}

renderCalendar();
