let currentUser = null;
let selectedPackageId = null;
let allPackages = [];

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
    bindLoginForm();
    bindRegisterForm();
    bindBookingForm();
    initDashboardPage();
    setTodayAsMinDate();
});

// ===================== STORAGE =====================
function saveUser(user) {
    const savedUser = {
        id: user.id,
        username: user.username,
        role: user.role || "customer"
    };

    localStorage.setItem("userId", savedUser.id);
    localStorage.setItem("userName", savedUser.username);
    localStorage.setItem("userRole", savedUser.role);

    // Backward compatibility with your old code
    localStorage.setItem("user", JSON.stringify(savedUser));
}

function getStoredUser() {
    let id = localStorage.getItem("userId");
    let username = localStorage.getItem("userName");
    let role = localStorage.getItem("userRole");

    // Support old localStorage format: localStorage.setItem("user", ...)
    if ((!id || !username || !role) && localStorage.getItem("user")) {
        try {
            const oldUser = JSON.parse(localStorage.getItem("user"));

            id = oldUser.id;
            username = oldUser.username;
            role = oldUser.role || "customer";

            if (id && username && role) {
                saveUser({ id, username, role });
            }
        } catch (err) {
            console.warn("Invalid old user data:", err);
        }
    }

    if (!id || !username || !role) return null;

    const numericId = Number(id);

    return {
        id: Number.isNaN(numericId) ? id : numericId,
        username,
        role
    };
}

function clearUser() {
    localStorage.removeItem("userId");
    localStorage.removeItem("userName");
    localStorage.removeItem("userRole");
    localStorage.removeItem("user");
}

// ===================== HELPERS =====================
async function readJson(response) {
    try {
        return await response.json();
    } catch {
        return {};
    }
}

async function postJSON(url, payload) {
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const data = await readJson(response);

    if (!response.ok || data.success === false) {
        throw new Error(data.error || "Request failed");
    }

    return data;
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#039;"
    }[char]));
}

function formatPeso(value) {
    const amount = Number(value || 0);

    return amount.toLocaleString("en-PH", {
        style: "currency",
        currency: "PHP"
    });
}

function formatDate(value) {
    if (!value) return "-";

    const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T00:00:00`)
        : new Date(value);

    if (Number.isNaN(date.getTime())) return value;

    return date.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

function getStatusClass(status) {
    return `status status-${String(status || "pending").toLowerCase()}`;
}

function setTodayAsMinDate() {
    const dateInput = $("eventDate");

    if (dateInput) {
        dateInput.min = new Date().toISOString().split("T")[0];
    }
}

// ===================== LOGIN =====================
function bindLoginForm() {
    const loginForm = $("loginForm");
    if (!loginForm) return;

    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const username = $("username").value.trim();
        const password = $("password").value;

        if (!username || !password) {
            alert("Please enter username and password.");
            return;
        }

        try {
            const data = await postJSON("/api/login", {
                username,
                password
            });

            saveUser({
                id: data.id,
                username: data.username,
                role: data.role
            });

            window.location.href = "index.html";
        } catch (err) {
            console.error("Login Error:", err);
            alert(err.message || "Cannot connect to server.");
        }
    });
}

// ===================== REGISTER =====================
function bindRegisterForm() {
    const registerForm = $("registerForm");
    if (!registerForm) return;

    registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const username = $("regName").value.trim();
        const password = $("regPassword").value;
        const role = $("regRole") ? $("regRole").value : "customer";

        if (!username || !password) {
            alert("Please complete all fields.");
            return;
        }

        try {
            await postJSON("/api/register", {
                username,
                password,
                role
            });

            alert("Account created! Please login.");
            window.location.href = "login.html";
        } catch (err) {
            console.error("Register Error:", err);
            alert(err.message || "Registration failed.");
        }
    });
}

// ===================== DASHBOARD INIT =====================
function initDashboardPage() {
    const customerView = $("customer-view");
    const adminView = $("admin-view");

    // Not dashboard page
    if (!customerView && !adminView) return;

    currentUser = getStoredUser();

    if (!currentUser) {
        window.location.href = "auth.html";
        return;
    }

    const logoutBtn = $("nav-logout-btn");
    const bookBtn = $("nav-book-btn");
    const navUser = $("nav-user");
    const dateDisplay = $("date-display");

    if (logoutBtn) logoutBtn.style.display = "inline-flex";

    if (bookBtn) {
        bookBtn.style.display = currentUser.role === "admin" ? "none" : "inline-flex";
    }

    if (navUser) {
        navUser.textContent = `${currentUser.username} (${currentUser.role})`;
    }

    if (dateDisplay) {
        dateDisplay.textContent = new Date().toDateString();
    }

    if (currentUser.role === "admin") {
        if (customerView) customerView.hidden = true;
        if (adminView) adminView.hidden = false;
        showAdminDashboard();
    } else {
        if (adminView) adminView.hidden = true;
        if (customerView) customerView.hidden = false;
        showCustomerDashboard();
    }
}

// ===================== CUSTOMER DASHBOARD =====================
async function showCustomerDashboard() {
    const userDisplay = $("user-display");

    if (userDisplay) {
        userDisplay.textContent = currentUser.username;
    }

    await loadPackages();
    await loadMyBookings();
}

async function loadPackages() {
    const container = $("package-list");
    if (!container) return;

    container.innerHTML = `<div class="notice">Loading packages...</div>`;

    try {
        const response = await fetch("/api/packages");

        if (!response.ok) {
            throw new Error("Unable to load packages.");
        }

        const data = await response.json();
        allPackages = Array.isArray(data) ? data : data.packages || [];

        if (!allPackages.length) {
            container.innerHTML = `<div class="notice">No packages available.</div>`;
            return;
        }

        container.innerHTML = allPackages.map((p, index) => {
            const image = p.image || `images/p${index + 1}.jpg`;

            return `
                <article class="package-card" id="pkg-${Number(p.id)}">
                    <img 
                        src="${escapeHtml(image)}" 
                        alt="${escapeHtml(p.name)}"
                        onerror="this.src='https://via.placeholder.com/400x220?text=J-PRO+Package'"
                    >

                    <h3>${escapeHtml(p.name)}</h3>
                    <p>${escapeHtml(p.description)}</p>
                    <p class="package-price">${formatPeso(p.price)}</p>

                    <button class="btn btn-primary btn-block" onclick="selectPackage(${Number(p.id)})">
                        BOOK NOW
                    </button>
                </article>
            `;
        }).join("");
    } catch (err) {
        console.error(err);
        container.innerHTML = `<div class="notice">Cannot load packages. Make sure server.js is running.</div>`;
    }
}

// ===================== SELECT PACKAGE =====================
function selectPackage(id) {
    selectedPackageId = Number(id);

    document.querySelectorAll(".package-card").forEach((card) => {
        card.classList.remove("selected");
    });

    const selectedCard = $(`pkg-${selectedPackageId}`);
    if (selectedCard) selectedCard.classList.add("selected");

    const selectedPackage = allPackages.find((p) => Number(p.id) === selectedPackageId);
    const packageNameDisplay = $("selected-package-name");
    const bookingPanel = $("booking-panel");

    if (packageNameDisplay) {
        packageNameDisplay.textContent = selectedPackage
            ? selectedPackage.name
            : `Package #${selectedPackageId}`;
    }

    if (bookingPanel) {
        bookingPanel.classList.remove("hidden");
        bookingPanel.scrollIntoView({ behavior: "smooth", block: "center" });
    }
}

// ===================== CREATE BOOKING =====================
function bindBookingForm() {
    const bookingForm = $("bookingForm");
    if (!bookingForm) return;

    bookingForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (!currentUser) {
            currentUser = getStoredUser();
        }

        if (!currentUser) {
            alert("Please login first.");
            window.location.href = "login.html";
            return;
        }

        if (!selectedPackageId) {
            alert("Please select a package first.");
            return;
        }

        const eventDate = $("eventDate").value;
        const eventLocation = $("eventLocation").value.trim();
        const notes = $("bookingNotes").value.trim();

        if (!eventDate) {
            alert("Please select event date.");
            return;
        }

        try {
            await postJSON("/api/bookings", {
                user_id: currentUser.id,
                package_id: selectedPackageId,
                event_date: eventDate,
                event_location: eventLocation,
                notes
            });

            alert("Booking submitted successfully!");

            bookingForm.reset();
            selectedPackageId = null;

            document.querySelectorAll(".package-card").forEach((card) => {
                card.classList.remove("selected");
            });

            const bookingPanel = $("booking-panel");
            if (bookingPanel) bookingPanel.classList.add("hidden");

            await loadMyBookings();
        } catch (err) {
            console.error("Booking Error:", err);
            alert(err.message || "Booking failed.");
        }
    });
}

// ===================== CUSTOMER BOOKINGS =====================
async function loadMyBookings() {
    const tableBody = $("user-booking-rows");
    if (!tableBody || !currentUser) return;

    tableBody.innerHTML = `
        <tr>
            <td colspan="4">Loading your bookings...</td>
        </tr>
    `;

    try {
        const response = await fetch(`/api/bookings/${encodeURIComponent(currentUser.id)}`);

        if (!response.ok) {
            throw new Error("Unable to load bookings.");
        }

        const data = await response.json();
        const bookings = Array.isArray(data) ? data : data.bookings || [];

        if (!bookings.length) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="4">No bookings yet.</td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = bookings.map((b) => `
            <tr>
                <td>${escapeHtml(b.packageName || b.package_name || "Package")}</td>
                <td>${formatDate(b.event_date)}</td>
                <td>${escapeHtml(b.event_location || "-")}</td>
                <td>
                    <span class="${getStatusClass(b.status)}">
                        ${escapeHtml(b.status || "Pending")}
                    </span>
                </td>
            </tr>
        `).join("");
    } catch (err) {
        console.error(err);

        tableBody.innerHTML = `
            <tr>
                <td colspan="4">Cannot load your bookings.</td>
            </tr>
        `;
    }
}

// ===================== ADMIN DASHBOARD =====================
async function showAdminDashboard() {
    const tableBody = $("admin-rows");
    if (!tableBody) return;

    tableBody.innerHTML = `
        <tr>
            <td colspan="6">Loading bookings...</td>
        </tr>
    `;

    try {
        const response = await fetch("/api/admin/bookings");

        if (!response.ok) {
            throw new Error("Unable to load admin bookings.");
        }

        const data = await response.json();
        const bookings = Array.isArray(data) ? data : data.bookings || [];

        if (!bookings.length) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6">No bookings yet.</td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = bookings.map((b) => `
            <tr>
                <td>${escapeHtml(b.username || "Unknown")}</td>
                <td>${escapeHtml(b.packageName || b.package_name || "Package")}</td>
                <td>${formatDate(b.event_date)}</td>
                <td>${escapeHtml(b.event_location || "-")}</td>
                <td>
                    <span class="${getStatusClass(b.status)}">
                        ${escapeHtml(b.status || "Pending")}
                    </span>
                </td>
                <td class="actions">
                    <button class="btn btn-small btn-primary" onclick="updateStatus(${Number(b.id)}, 'Approved')">
                        Approve
                    </button>
                    <button class="btn btn-small btn-danger" onclick="updateStatus(${Number(b.id)}, 'Rejected')">
                        Reject
                    </button>
                </td>
            </tr>
        `).join("");
    } catch (err) {
        console.error(err);

        tableBody.innerHTML = `
            <tr>
                <td colspan="6">Cannot load bookings. Check your server.</td>
            </tr>
        `;
    }
}

// ===================== UPDATE STATUS =====================
async function updateStatus(bookingId, newStatus) {
    try {
        await postJSON("/api/admin/update-status", {
            booking_id: bookingId,
            status: newStatus
        });

        await showAdminDashboard();
    } catch (err) {
        console.error("Update Status Error:", err);
        alert(err.message || "Failed to update booking status.");
    }
}

// ===================== LOGOUT =====================
function logout() {
    clearUser();
    window.location.href = "auth.html";
}

// Make functions available for onclick=""
window.logout = logout;
window.selectPackage = selectPackage;
window.updateStatus = updateStatus;