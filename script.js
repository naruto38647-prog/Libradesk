"use strict";

/* LibraDesk: browser-based library management system */
const STORAGE_KEY = "libradesk_data_v1";
const SESSION_KEY = "libradesk_session_v2";
const LOAN_DAYS = 14;
const FINE_PER_DAY = 5;

let data = loadData();
let editingBookId = null;
let editingMemberId = null;
let noticeTimer = null;
let currentMemberId = null;

function emptyData() {
  return {
    books: [],
    members: [],
    transactions: [],
    audit: [],
    nextBookId: 1,
    nextMemberId: 1,
    nextTransactionId: 1
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();

    const saved = JSON.parse(raw);

    if (
      !saved ||
      !Array.isArray(saved.books) ||
      !Array.isArray(saved.members) ||
      !Array.isArray(saved.transactions)
    ) {
      throw new Error("Invalid library data format");
    }

    const result = emptyData();

    result.books = saved.books
      .filter(book => book && book.id != null)
      .map(book => ({
        ...book,
        id: String(book.id),
        title: String(book.title || ""),
        author: String(book.author || ""),
        category: String(book.category || ""),
        copies: Math.max(0, Math.floor(Number(book.copies) || 0)),
        isbn: String(book.isbn || ""),
        publisher: String(book.publisher || ""),
        year: String(book.year || ""),
        shelf: String(book.shelf || "")
      }));

    result.members = saved.members
      .filter(member => member && member.id != null)
      .map(member => ({
        ...member,
        id: String(member.id),
        name: String(member.name || ""),
        email: String(member.email || ""),
        phone: String(member.phone || ""),
        password: String(member.password || "")
      }));

    result.transactions = saved.transactions
      .filter(transaction => transaction && transaction.id != null)
      .map(transaction => ({
        ...transaction,
        id: String(transaction.id),
        bookId: String(transaction.bookId),
        memberId: String(transaction.memberId),
        issueDate: String(transaction.issueDate || todayString()),
        dueDate: String(transaction.dueDate || todayString()),
        returnDate: transaction.returnDate || null,
        fine: Math.max(0, Number(transaction.fine) || 0)
      }));

    result.audit = Array.isArray(saved.audit)
      ? saved.audit.slice(-500)
      : [];

    const nextNumber = (prefix, ids, savedNext) =>
      Math.max(
        ids.reduce((max, id) => {
          const match = String(id).match(
            new RegExp("^" + prefix + "(\\d+)$")
          );
          return match ? Math.max(max, Number(match[1])) : max;
        }, 0) + 1,
        Math.floor(Number(savedNext) || 1),
        1
      );

    result.nextBookId = nextNumber(
      "B",
      result.books.map(book => book.id),
      saved.nextBookId
    );

    result.nextMemberId = nextNumber(
      "M",
      result.members.map(member => member.id),
      saved.nextMemberId
    );

    result.nextTransactionId = nextNumber(
      "T",
      result.transactions.map(transaction => transaction.id),
      saved.nextTransactionId
    );

    return result;
  } catch (error) {
    console.error("Library data could not be loaded:", error);

    alert(
      "LibraDesk could not read the saved data. " +
      "Your old data has not intentionally been deleted. " +
      "Check the browser console before making changes."
    );

    return emptyData();
  }
}

function recordAudit(action, details) {
  if (!Array.isArray(data.audit)) {
    data.audit = [];
  }

  data.audit.push({
    id: "A" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    time: new Date().toISOString(),
    action: String(action),
    details: String(details || "")
  });

  data.audit = data.audit.slice(-500);
}

function saveData(action, details) {
  const previousAudit = Array.isArray(data.audit)
    ? data.audit.slice()
    : [];

  if (action) {
    recordAudit(action, details);
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    data.audit = previousAudit;

    console.error("Library data could not be saved:", error);

    showNotice(
      "Could not save changes. Check browser storage space.",
      true
    );

    return false;
  }
}

function makeId(prefix, number) {
  return prefix + String(number).padStart(3, "0");
}

function getBook(id) {
  return data.books.find(book => book.id === String(id));
}

function getMember(id) {
  return data.members.find(member => member.id === String(id));
}

function activeLoans() {
  return data.transactions.filter(transaction => !transaction.returnDate);
}

function activeLoanCount(bookId) {
  return activeLoans().filter(
    transaction => transaction.bookId === String(bookId)
  ).length;
}

function availableCopies(book) {
  return Math.max(0, Number(book.copies) - activeLoanCount(book.id));
}

function todayString() {
  const date = new Date();

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function addDays(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  date.setDate(date.getDate() + days);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function formatDate(value) {
  if (!value) return "—";

  const [year, month, day] = value.split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString("en-IN");
}

function overdueDays(transaction) {
  const end = transaction.returnDate || todayString();

  const [year1, month1, day1] = transaction.dueDate.split("-").map(Number);
  const [year2, month2, day2] = end.split("-").map(Number);

  return Math.max(
    0,
    Math.floor(
      (
        Date.UTC(year2, month2 - 1, day2) -
        Date.UTC(year1, month1 - 1, day1)
      ) / 86400000
    )
  );
}

function calculateFine(transaction) {
  return overdueDays(transaction) * FINE_PER_DAY;
}

function money(value) {
  return "₹" + Number(value || 0).toFixed(2);
}

function bookName(id) {
  return getBook(id)?.title || "Deleted book";
}

function memberName(id) {
  return getMember(id)?.name || "Deleted member";
}

function showNotice(message, isError = false) {
  const notice = document.getElementById("notice");
  if (!notice) return;

  clearTimeout(noticeTimer);

  notice.textContent = message;
  notice.classList.toggle("error", isError);
  notice.hidden = false;

  noticeTimer = setTimeout(() => {
    notice.hidden = true;
  }, 4500);
}

function showMessage(id, message, success = false) {
  const element = document.getElementById(id);

  element.textContent = message;
  element.classList.toggle("success", success);
}

function addCell(row, value) {
  const cell = document.createElement("td");

  cell.textContent = String(value ?? "");
  row.appendChild(cell);

  return cell;
}

function addBadge(row, text, kind) {
  const cell = document.createElement("td");
  const badge = document.createElement("span");

  badge.className = "status " + kind;
  badge.textContent = text;

  cell.appendChild(badge);
  row.appendChild(cell);
}

function addAction(row, label, kind, callback) {
  let cell = row.querySelector(".actions-cell");

  if (!cell) {
    cell = document.createElement("td");
    cell.className = "actions-cell";

    const wrapper = document.createElement("div");
    wrapper.className = "actions";

    cell.appendChild(wrapper);
    row.appendChild(cell);
  }

  const button = document.createElement("button");

  button.type = "button";
  button.className =
    "action-btn" + (kind === "delete" ? " delete" : "");
  button.textContent = label;

  button.addEventListener("click", callback);
  cell.firstElementChild.appendChild(button);
}

function showEmptyRow(tbody, message, columnCount) {
  const row = tbody.insertRow();
  const cell = row.insertCell();

  cell.colSpan = columnCount;
  cell.textContent = message;
  cell.className = "empty-cell";
}

/* Authentication */

const authPage = document.getElementById("authPage");
const adminApp = document.getElementById("adminApp");
const memberPortal = document.getElementById("memberPortal");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");

function switchAuthTab(tab) {
  const isLogin = tab === "login";

  loginForm.hidden = !isLogin;
  signupForm.hidden = isLogin;

  document.getElementById("loginTab").classList.toggle("active", isLogin);
  document.getElementById("signupTab").classList.toggle("active", !isLogin);

  document.getElementById("authTitle").textContent = isLogin
    ? "Welcome back"
    : "Create your account";

  document.getElementById("authSubtitle").textContent = isLogin
    ? "Sign in to continue to your library."
    : "Join the library in just a few steps.";

  showMessage("loginMessage", "");
  showMessage("signupMessage", "");
}

document.getElementById("loginTab").addEventListener("click", () => {
  switchAuthTab("login");
});

document.getElementById("signupTab").addEventListener("click", () => {
  switchAuthTab("signup");
});

function showAuth() {
  authPage.hidden = false;
  adminApp.hidden = true;
  memberPortal.hidden = true;
  currentMemberId = null;

  switchAuthTab("login");
}

function openAdmin() {
  authPage.hidden = true;
  memberPortal.hidden = true;
  adminApp.hidden = false;
  currentMemberId = null;

  showSection("dashboard");
  renderAll();
}

function openMember(member) {
  if (!member) {
    showAuth();
    return;
  }

  authPage.hidden = true;
  adminApp.hidden = true;
  memberPortal.hidden = false;
  currentMemberId = member.id;

  document.getElementById("memberWelcome").textContent =
    "Welcome, " + member.name + "!";

  document.getElementById("memberHeaderName").textContent = member.name;

  renderPublicBooks();
  renderMyLoans();
}

function setSession(session) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return true;
  } catch (error) {
    showNotice("Could not start the session.", true);
    return false;
  }
}

loginForm.addEventListener("submit", event => {
  event.preventDefault();

  const role = document.getElementById("loginRole").value;
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (role === "admin") {
    if (email === "admin" && password === "admin123") {
      if (setSession({ role: "admin" })) {
        loginForm.reset();
        openAdmin();
      }
    } else {
      showMessage("loginMessage", "Incorrect admin username or password.");
    }

    return;
  }

  const member = data.members.find(
    item =>
      item.email.toLowerCase() === email.toLowerCase() &&
      item.password &&
      item.password === password
  );

  if (!member) {
    showMessage(
      "loginMessage",
      "Invalid email or password. Create an account if you are new."
    );
    return;
  }

  if (setSession({ role: "member", memberId: member.id })) {
    loginForm.reset();
    openMember(member);
  }
});

signupForm.addEventListener("submit", event => {
  event.preventDefault();

  const name = document.getElementById("signupName").value.trim();
  const email = document.getElementById("signupEmail").value.trim();
  const phone = document.getElementById("signupPhone").value.trim();
  const password = document.getElementById("signupPassword").value;

  if (!name || !email || !phone || password.length < 8) {
    showMessage(
      "signupMessage",
      "Fill in all fields and use at least 8 password characters."
    );
    return;
  }

  const existing = data.members.find(
    member => member.email.toLowerCase() === email.toLowerCase()
  );

  if (existing && existing.password) {
    showMessage(
      "signupMessage",
      "This email already has an account. Please sign in."
    );
    return;
  }

  const oldData = data;

  if (existing) {
    data = {
      ...data,
      members: data.members.map(member =>
        member.id === existing.id
          ? { ...member, name, email, phone, password }
          : member
      )
    };
  } else {
    const member = {
      id: makeId("M", data.nextMemberId),
      name,
      email,
      phone,
      password
    };

    data = {
      ...data,
      members: [...data.members, member],
      nextMemberId: data.nextMemberId + 1
    };
  }

  if (
    !saveData(
      existing ? "MEMBER_ACCOUNT_ACTIVATED" : "MEMBER_REGISTERED",
      email
    )
  ) {
    data = oldData;
    return;
  }

  signupForm.reset();

  document.getElementById("loginRole").value = "member";
  document.getElementById("loginEmail").value = email;

  switchAuthTab("login");

  showMessage(
    "loginMessage",
    "Account created. Sign in with your email and password.",
    true
  );
});

function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  loginForm.reset();
  signupForm.reset();
  showAuth();
}

document.getElementById("adminLogout").addEventListener("click", logout);
document.getElementById("memberLogout").addEventListener("click", logout);

/* Navigation */

const pageTitles = {
  dashboard: "Dashboard",
  books: "Book inventory",
  members: "Members",
  transactions: "Issue & return",
  reports: "Reports & backup"
};

function showSection(id) {
  if (!pageTitles[id]) return;

  document.querySelectorAll("#adminApp .page").forEach(page => {
    page.hidden = page.id !== id;
  });

  document.querySelectorAll("#adminApp .nav-btn").forEach(button => {
    button.classList.toggle("active", button.dataset.page === id);
  });

  document.getElementById("pageTitle").textContent = pageTitles[id];
}

document.querySelectorAll(".nav-btn").forEach(button => {
  button.addEventListener("click", () => {
    showSection(button.dataset.page);
  });
});

document.querySelectorAll("[data-go]").forEach(button => {
  button.addEventListener("click", () => {
    showSection(button.dataset.go);
  });
});

document.getElementById("brandHome").addEventListener("click", event => {
  event.preventDefault();
  showSection("dashboard");
});

document.getElementById("memberBrand").addEventListener("click", event => {
  event.preventDefault();

  if (currentMemberId) {
    openMember(getMember(currentMemberId));
  }
});

/* Book management */

function resetBookForm() {
  editingBookId = null;

  document.getElementById("bookForm").reset();
  document.getElementById("bookFormHeading").textContent = "Add a new book";
  document.getElementById("saveBookBtn").textContent = "＋ Add book";
  document.getElementById("cancelBookEdit").hidden = true;
}

document.getElementById("cancelBookEdit").addEventListener("click", resetBookForm);

document.getElementById("bookForm").addEventListener("submit", event => {
  event.preventDefault();

  const title = document.getElementById("bookTitle").value.trim();
  const author = document.getElementById("bookAuthor").value.trim();
  const category = document.getElementById("bookCategory").value.trim();
  const copies = Number(document.getElementById("bookCopies").value);
  const isbn = document.getElementById("bookIsbn").value.trim();
  const publisher = document.getElementById("bookPublisher").value.trim();
  const year = document.getElementById("bookYear").value.trim();
  const shelf = document.getElementById("bookShelf").value.trim();

  if (
    !title ||
    !author ||
    !category ||
    !Number.isSafeInteger(copies) ||
    copies < 1 ||
    copies > 10000
  ) {
    showNotice("Enter valid book details and a whole number of copies.", true);
    return;
  }

  if (
    year &&
    (
      !Number.isInteger(Number(year)) ||
      Number(year) < 1000 ||
      Number(year) > 2100
    )
  ) {
    showNotice("Enter a valid publication year.", true);
    return;
  }

  const oldData = data;
  const wasEditing = editingBookId !== null;
  let action = "BOOK_CREATED";

  if (wasEditing) {
    const book = getBook(editingBookId);

    if (!book) {
      showNotice("Book not found.", true);
      resetBookForm();
      return;
    }

    if (copies < activeLoanCount(book.id)) {
      showNotice(
        "Total copies cannot be less than the number currently issued.",
        true
      );
      return;
    }

    action = "BOOK_UPDATED";

    data = {
      ...data,
      books: data.books.map(item =>
        item.id === book.id
          ? {
              ...item,
              title,
              author,
              category,
              copies,
              isbn,
              publisher,
              year,
              shelf
            }
          : item
      )
    };
  } else {
    const book = {
      id: makeId("B", data.nextBookId),
      title,
      author,
      category,
      copies,
      isbn,
      publisher,
      year,
      shelf
    };

    data = {
      ...data,
      books: [...data.books, book],
      nextBookId: data.nextBookId + 1
    };
  }

  if (!saveData(action, title)) {
    data = oldData;
    return;
  }

  resetBookForm();
  renderAll();

  showNotice(
    wasEditing ? "Book updated successfully." : "Book added successfully."
  );
});

function editBook(id) {
  const book = getBook(id);
  if (!book) return;

  editingBookId = book.id;

  const values = {
    bookTitle: book.title,
    bookAuthor: book.author,
    bookCategory: book.category,
    bookCopies: book.copies,
    bookIsbn: book.isbn || "",
    bookPublisher: book.publisher || "",
    bookYear: book.year || "",
    bookShelf: book.shelf || ""
  };

  Object.entries(values).forEach(([field, value]) => {
    document.getElementById(field).value = value;
  });

  document.getElementById("bookFormHeading").textContent = "Edit book";
  document.getElementById("saveBookBtn").textContent = "Save changes";
  document.getElementById("cancelBookEdit").hidden = false;

  document.getElementById("bookForm").scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

function deleteBook(id) {
  const book = getBook(id);
  if (!book) return;

  if (activeLoanCount(id) > 0) {
    showNotice("Return all copies before deleting this book.", true);
    return;
  }

  if (!confirm('Delete "' + book.title + '"?')) return;

  const oldData = data;

  data = {
    ...data,
    books: data.books.filter(item => item.id !== id)
  };

  if (!saveData("BOOK_DELETED", book.title)) {
    data = oldData;
    return;
  }

  renderAll();
  showNotice("Book deleted.");
}

function renderBooks() {
  const list = document.getElementById("bookList");
  const query = document.getElementById("bookSearch").value.trim().toLowerCase();

  list.replaceChildren();

  const books = data.books.filter(book =>
    [
      book.id,
      book.title,
      book.author,
      book.category,
      book.isbn,
      book.publisher,
      book.year,
      book.shelf
    ].some(value => String(value || "").toLowerCase().includes(query))
  );

  document.getElementById("bookSummary").textContent =
    books.length + " matching book entries";

  if (!books.length) {
    showEmptyRow(list, "No books found. Add your first book above.", 9);
    return;
  }

  books.forEach(book => {
    const row = list.insertRow();

    addCell(row, book.id);
    addCell(row, book.title);
    addCell(row, book.author);
    addCell(row, book.category);
    addCell(row, book.isbn || "—");
    addCell(row, book.shelf || "—");
    addCell(row, Number(book.copies));

    addBadge(
      row,
      String(availableCopies(book)),
      availableCopies(book) > 0 ? "available" : "unavailable"
    );

    addAction(row, "Edit", "edit", () => editBook(book.id));
    addAction(row, "Delete", "delete", () => deleteBook(book.id));
  });
}

document.getElementById("bookSearch").addEventListener("input", renderBooks);

/* Member management */

function resetMemberForm() {
  editingMemberId = null;

  document.getElementById("memberForm").reset();
  document.getElementById("memberFormHeading").textContent = "Register a member";
  document.getElementById("saveMemberBtn").textContent = "＋ Register member";
  document.getElementById("cancelMemberEdit").hidden = true;
}

document.getElementById("cancelMemberEdit").addEventListener(
  "click",
  resetMemberForm
);

document.getElementById("memberForm").addEventListener("submit", event => {
  event.preventDefault();

  const name = document.getElementById("memberName").value.trim();
  const email = document.getElementById("memberEmail").value.trim();
  const phone = document.getElementById("memberPhone").value.trim();

  if (!name || !email || !phone) {
    showNotice("Fill in all member fields.", true);
    return;
  }

  if (
    data.members.some(
      member =>
        member.email.toLowerCase() === email.toLowerCase() &&
        member.id !== editingMemberId
    )
  ) {
    showNotice("This email is already registered.", true);
    return;
  }

  const oldData = data;
  const wasEditing = editingMemberId !== null;
  let action = "MEMBER_REGISTERED";

  if (wasEditing) {
    action = "MEMBER_UPDATED";

    data = {
      ...data,
      members: data.members.map(member =>
        member.id === editingMemberId
          ? { ...member, name, email, phone }
          : member
      )
    };
  } else {
    const member = {
      id: makeId("M", data.nextMemberId),
      name,
      email,
      phone,
      password: ""
    };

    data = {
      ...data,
      members: [...data.members, member],
      nextMemberId: data.nextMemberId + 1
    };
  }

  if (!saveData(action, name)) {
    data = oldData;
    return;
  }

  resetMemberForm();
  renderAll();

  showNotice(
    wasEditing
      ? "Member updated successfully."
      : "Member registered. They can activate their account through Create account."
  );
});

function editMember(id) {
  const member = getMember(id);
  if (!member) return;

  editingMemberId = member.id;

  document.getElementById("memberName").value = member.name;
  document.getElementById("memberEmail").value = member.email;
  document.getElementById("memberPhone").value = member.phone;

  document.getElementById("memberFormHeading").textContent = "Edit member";
  document.getElementById("saveMemberBtn").textContent = "Save changes";
  document.getElementById("cancelMemberEdit").hidden = false;

  document.getElementById("memberForm").scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

function deleteMember(id) {
  const member = getMember(id);
  if (!member) return;

  if (activeLoans().some(transaction => transaction.memberId === id)) {
    showNotice("This member must return all books before deletion.", true);
    return;
  }

  if (!confirm('Delete member "' + member.name + '"?')) return;

  const oldData = data;

  data = {
    ...data,
    members: data.members.filter(item => item.id !== id)
  };

  if (!saveData("MEMBER_DELETED", member.name)) {
    data = oldData;
    return;
  }

  renderAll();
  showNotice("Member deleted.");
}

function renderMembers() {
  const list = document.getElementById("memberList");
  const query = document.getElementById("memberSearch").value.trim().toLowerCase();

  list.replaceChildren();

  const members = data.members.filter(member =>
    [member.id, member.name, member.email, member.phone].some(value =>
      String(value).toLowerCase().includes(query)
    )
  );

  document.getElementById("memberSummary").textContent =
    members.length + " matching members";

  if (!members.length) {
    showEmptyRow(list, "No members found.", 5);
    return;
  }

  members.forEach(member => {
    const row = list.insertRow();

    addCell(row, member.id);
    addCell(row, member.name);
    addCell(row, member.email);
    addCell(row, member.phone);

    addAction(row, "Edit", "edit", () => editMember(member.id));
    addAction(row, "Delete", "delete", () => deleteMember(member.id));
  });
}

document.getElementById("memberSearch").addEventListener("input", renderMembers);

/* Issue and return books */

document.getElementById("issueForm").addEventListener("submit", event => {
  event.preventDefault();

  const bookId = document.getElementById("issueBook").value;
  const memberId = document.getElementById("issueMember").value;

  const book = getBook(bookId);
  const member = getMember(memberId);

  if (!book || !member) {
    showNotice("Select a valid book and member.", true);
    return;
  }

  if (availableCopies(book) < 1) {
    showNotice("No copies of this book are available.", true);
    return;
  }

  if (
    activeLoans().filter(transaction => transaction.memberId === memberId)
      .length >= 3
  ) {
    showNotice("A member can borrow a maximum of 3 books at a time.", true);
    return;
  }

  const oldData = data;
  const today = todayString();

  const transaction = {
    id: makeId("T", data.nextTransactionId),
    bookId,
    memberId,
    issueDate: today,
    dueDate: addDays(today, LOAN_DAYS),
    returnDate: null,
    fine: 0
  };

  data = {
    ...data,
    transactions: [...data.transactions, transaction],
    nextTransactionId: data.nextTransactionId + 1
  };

  if (!saveData("BOOK_ISSUED", book.title + " to " + member.name)) {
    data = oldData;
    return;
  }

  event.target.reset();
  renderAll();

  showNotice("Book issued successfully. Due: " + formatDate(transaction.dueDate));
});

function returnBook(id) {
  const transaction = data.transactions.find(item => item.id === id);

  if (!transaction || transaction.returnDate) {
    showNotice("This book has already been returned.", true);
    return;
  }

  const fine = calculateFine(transaction);

  const message =
    fine > 0
      ? "Return this book? Late fee: " +
        money(fine) +
        " for " +
        overdueDays(transaction) +
        " overdue day(s)."
      : "Confirm that this book has been returned?";

  if (!confirm(message)) return;

  const oldData = data;
  const returnDate = todayString();

  data = {
    ...data,
    transactions: data.transactions.map(item =>
      item.id === id
        ? {
            ...item,
            returnDate,
            fine: calculateFine({ ...item, returnDate })
          }
        : item
    )
  };

  if (
    !saveData(
      "BOOK_RETURNED",
      bookName(transaction.bookId) +
        " returned by " +
        memberName(transaction.memberId)
    )
  ) {
    data = oldData;
    return;
  }

  renderAll();
  showNotice("Book returned. Late fee: " + money(fine));
}

function renderTransactions() {
  const list = document.getElementById("transactionList");
  const query = document.getElementById("transactionSearch").value.trim().toLowerCase();

  list.replaceChildren();

  const transactions = [...data.transactions]
    .reverse()
    .filter(transaction =>
      [
        transaction.id,
        bookName(transaction.bookId),
        memberName(transaction.memberId),
        transaction.issueDate,
        transaction.dueDate,
        transaction.returnDate || ""
      ].some(value => String(value).toLowerCase().includes(query))
    );

  if (!transactions.length) {
    showEmptyRow(list, "No transactions found.", 8);
    return;
  }

  transactions.forEach(transaction => {
    const row = list.insertRow();

    addCell(row, transaction.id);
    addCell(row, bookName(transaction.bookId));
    addCell(row, memberName(transaction.memberId));
    addCell(row, formatDate(transaction.issueDate));
    addCell(row, formatDate(transaction.dueDate));
    addCell(row, formatDate(transaction.returnDate));

    addCell(
      row,
      money(
        transaction.returnDate
          ? transaction.fine
          : calculateFine(transaction)
      )
    );

    if (transaction.returnDate) {
      addBadge(row, "Returned", "returned");
    } else {
      addAction(
        row,
        overdueDays(transaction) > 0 ? "Overdue · Return" : "Return book",
        "edit",
        () => returnBook(transaction.id)
      );
    }
  });
}

document.getElementById("transactionSearch").addEventListener(
  "input",
  renderTransactions
);

function renderSelectMenus() {
  const bookSelect = document.getElementById("issueBook");
  const memberSelect = document.getElementById("issueMember");

  const previousBook = bookSelect.value;
  const previousMember = memberSelect.value;

  bookSelect.replaceChildren(new Option("Select a book", ""));
  memberSelect.replaceChildren(new Option("Select a member", ""));

  data.books.forEach(book => {
    const count = availableCopies(book);

    if (count > 0) {
      bookSelect.add(
        new Option(book.title + " (" + count + " available)", book.id)
      );
    }
  });

  data.members.forEach(member => {
    memberSelect.add(
      new Option(member.name + " (" + member.id + ")", member.id)
    );
  });

  if ([...bookSelect.options].some(option => option.value === previousBook)) {
    bookSelect.value = previousBook;
  }

  if (
    [...memberSelect.options].some(option => option.value === previousMember)
  ) {
    memberSelect.value = previousMember;
  }
}

/* Dashboard and member portal */

function renderDashboard() {
  document.getElementById("statTitles").textContent = data.books.length;

  document.getElementById("statCopies").textContent = data.books.reduce(
    (sum, book) => sum + Number(book.copies || 0),
    0
  );

  document.getElementById("statMembers").textContent = data.members.length;
  document.getElementById("statIssued").textContent = activeLoans().length;

  const list = document.getElementById("recentTransactions");
  list.replaceChildren();

  const recent = [...data.transactions].reverse().slice(0, 5);

  if (!recent.length) {
    showEmptyRow(list, "No transactions yet.", 4);
    return;
  }

  recent.forEach(transaction => {
    const row = list.insertRow();

    addCell(row, bookName(transaction.bookId));
    addCell(row, memberName(transaction.memberId));
    addCell(row, formatDate(transaction.dueDate));

    if (transaction.returnDate) {
      addBadge(row, "Returned", "returned");
    } else if (overdueDays(transaction) > 0) {
      addBadge(row, "Overdue", "overdue");
    } else {
      addBadge(row, "Issued", "issued");
    }
  });
}

function renderPublicBooks() {
  const list = document.getElementById("publicBookList");
  const query = document.getElementById("publicBookSearch").value.trim().toLowerCase();

  list.replaceChildren();

  const books = data.books.filter(
    book =>
      availableCopies(book) > 0 &&
      [book.title, book.author, book.category, book.isbn].some(value =>
        String(value || "").toLowerCase().includes(query)
      )
  );

  if (!books.length) {
    showEmptyRow(list, "No available books found.", 4);
    return;
  }

  books.forEach(book => {
    const row = list.insertRow();

    addCell(row, book.title);
    addCell(row, book.author);
    addCell(row, book.category);
    addBadge(row, String(availableCopies(book)), "available");
  });
}

function renderMyLoans() {
  const list = document.getElementById("myLoans");
  list.replaceChildren();

  const loans = data.transactions.filter(
    transaction => transaction.memberId === currentMemberId
  );

  document.getElementById("myActiveCount").textContent =
    loans.filter(transaction => !transaction.returnDate).length;

  document.getElementById("myOverdueCount").textContent =
    loans.filter(
      transaction => !transaction.returnDate && overdueDays(transaction) > 0
    ).length;

  if (!loans.length) {
    showEmptyRow(list, "You have no borrowing history yet.", 6);
    return;
  }

  [...loans].reverse().forEach(transaction => {
    const row = list.insertRow();

    addCell(row, bookName(transaction.bookId));
    addCell(row, formatDate(transaction.issueDate));
    addCell(row, formatDate(transaction.dueDate));
    addCell(row, formatDate(transaction.returnDate));

    addCell(
      row,
      money(
        transaction.returnDate
          ? transaction.fine
          : calculateFine(transaction)
      )
    );

    if (transaction.returnDate) {
      addBadge(row, "Returned", "returned");
    } else if (overdueDays(transaction) > 0) {
      addBadge(row, "Overdue", "overdue");
    } else {
      addBadge(row, "Issued", "issued");
    }
  });
}

document.getElementById("publicBookSearch").addEventListener(
  "input",
  renderPublicBooks
);

/* CSV exports, JSON backup/restore and audit history */

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value) {
  let text = String(value ?? "");

  if (/^[\s]*[=+\-@]/.test(text)) {
    text = "'" + text;
  }

  return '"' + text.replace(/"/g, '""') + '"';
}

function exportCSV(filename, headers, rows) {
  const csv = [headers, ...rows]
    .map(row => row.map(csvCell).join(","))
    .join("\r\n");

  downloadFile(
    filename,
    "\uFEFF" + csv,
    "text/csv;charset=utf-8"
  );

  showNotice(filename + " downloaded.");
}

function exportBooksCSV() {
  exportCSV(
    "libradesk-books.csv",
    [
      "ID",
      "Title",
      "Author",
      "Category",
      "Copies",
      "Available",
      "ISBN",
      "Publisher",
      "Year",
      "Shelf"
    ],
    data.books.map(book => [
      book.id,
      book.title,
      book.author,
      book.category,
      book.copies,
      availableCopies(book),
      book.isbn,
      book.publisher,
      book.year,
      book.shelf
    ])
  );
}

function exportMembersCSV() {
  exportCSV(
    "libradesk-members.csv",
    ["Member ID", "Name", "Email", "Phone"],
    data.members.map(member => [
      member.id,
      member.name,
      member.email,
      member.phone
    ])
  );
}

function exportTransactionsCSV() {
  exportCSV(
    "libradesk-transactions.csv",
    [
      "Transaction ID",
      "Book",
      "Member",
      "Issue Date",
      "Due Date",
      "Return Date",
      "Fine",
      "Status"
    ],
    data.transactions.map(transaction => [
      transaction.id,
      bookName(transaction.bookId),
      memberName(transaction.memberId),
      transaction.issueDate,
      transaction.dueDate,
      transaction.returnDate || "",
      transaction.returnDate
        ? transaction.fine
        : calculateFine(transaction),
      transaction.returnDate
        ? "Returned"
        : overdueDays(transaction) > 0
          ? "Overdue"
          : "Issued"
    ])
  );
}

function downloadBackup() {
  const backup = {
    application: "LibraDesk",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    data
  };

  downloadFile(
    "libradesk-backup-" + todayString() + ".json",
    JSON.stringify(backup, null, 2),
    "application/json"
  );

  showNotice("Backup downloaded. Keep it in a safe location.");
}

function renderAudit() {
  const list = document.getElementById("auditList");
  if (!list) return;

  list.replaceChildren();

  const events = [...(data.audit || [])].reverse().slice(0, 100);

  if (!events.length) {
    showEmptyRow(list, "No audit events recorded yet.", 3);
    return;
  }

  events.forEach(event => {
    const row = list.insertRow();

    addCell(
      row,
      event.time ? new Date(event.time).toLocaleString("en-IN") : "—"
    );

    addCell(row, event.action);
    addCell(row, event.details);
  });
}

function renderReports() {
  document.getElementById("reportBookCount").textContent = data.books.length;
  document.getElementById("reportMemberCount").textContent = data.members.length;
  document.getElementById("reportTransactionCount").textContent =
    data.transactions.length;
  document.getElementById("reportAuditCount").textContent =
    (data.audit || []).length;

  renderAudit();
}

function restoreBackupFile(file) {
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    let storageBefore = null;

    try {
      const parsed = JSON.parse(reader.result);
      const incoming = parsed?.data;

      if (
        parsed?.application !== "LibraDesk" ||
        !incoming ||
        !Array.isArray(incoming.books) ||
        !Array.isArray(incoming.members) ||
        !Array.isArray(incoming.transactions)
      ) {
        throw new Error("This is not a valid LibraDesk backup.");
      }

      if (
        !confirm(
          "Restoring replaces the current books, members, transactions and " +
          "audit history in this browser. Download your current backup first. " +
          "Continue?"
        )
      ) {
        return;
      }

      storageBefore = localStorage.getItem(STORAGE_KEY);

      const oldData = data;

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(incoming));

        const validated = loadData();

        if (
          validated.books.length !== incoming.books.length ||
          validated.members.length !== incoming.members.length ||
          validated.transactions.length !== incoming.transactions.length
        ) {
          throw new Error("Some records failed validation.");
        }

        data = validated;

        recordAudit(
          "BACKUP_RESTORED",
          "Restored backup exported at " + String(parsed.exportedAt || "unknown time")
        );

        if (!saveData()) {
          throw new Error("Could not save restored data.");
        }

        renderAll();
        showNotice("Backup restored successfully.");
      } catch (error) {
        if (storageBefore === null) {
          localStorage.removeItem(STORAGE_KEY);
        } else {
          localStorage.setItem(STORAGE_KEY, storageBefore);
        }

        data = oldData;
        renderAll();

        throw error;
      }
    } catch (error) {
      console.error("Backup restore failed:", error);
      showNotice("Restore failed: " + error.message, true);
    } finally {
      document.getElementById("backupFile").value = "";
    }
  };

  reader.onerror = () => {
    showNotice("Could not read the selected backup file.", true);
  };

  reader.readAsText(file);
}

document.getElementById("exportBooksBtn").addEventListener(
  "click",
  exportBooksCSV
);

document.getElementById("exportMembersBtn").addEventListener(
  "click",
  exportMembersCSV
);

document.getElementById("exportTransactionsBtn").addEventListener(
  "click",
  exportTransactionsCSV
);

document.getElementById("backupBtn").addEventListener(
  "click",
  downloadBackup
);

document.getElementById("restoreBtn").addEventListener("click", () => {
  document.getElementById("backupFile").click();
});

document.getElementById("backupFile").addEventListener("change", event => {
  restoreBackupFile(event.target.files[0]);
});

/* Render and restore session */

function renderAll() {
  renderBooks();
  renderMembers();
  renderSelectMenus();
  renderTransactions();
  renderDashboard();
  renderReports();

  if (currentMemberId && !memberPortal.hidden) {
    renderPublicBooks();
    renderMyLoans();
  }
}

function restoreSession() {
  let session = null;

  try {
    session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
  } catch {
    session = null;
  }

  if (session?.role === "admin") {
    openAdmin();
    return;
  }

  if (session?.role === "member") {
    const member = getMember(session.memberId);

    if (member && member.password) {
      openMember(member);
      return;
    }
  }

  showAuth();
}

showSection("dashboard");
restoreSession();