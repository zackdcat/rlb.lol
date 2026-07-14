const input = document.getElementById("num");
const minus = document.getElementById("minus");
const plus = document.getElementById("plus");
const banner = document.getElementById("cookie-banner");
const params = new URLSearchParams(window.location.search);

let step = 0;
let shownrows = 50;
const shownamount = 50;

async function openLoginSettings() {
    requireCookies(async () => {
        const res = await fetch('/me');
        const data = await res.json();

        if (data.user) {
            document.getElementById('UserIndicator').textContent = data.user;

            const pfpRes = await fetch('/me-full');
            const pfpData = await pfpRes.json();

            if (pfpData.pfp) {
                document.getElementById('settings-pfp').src = '/pfps/' + pfpData.pfp;
            } else {
                document.getElementById('settings-pfp').src = '/images/account.svg';
            }

            document.getElementById('settings-popup').classList.add('active');
            document.getElementById('background').classList.add('active');
        } else {
            document.getElementById('signup-id').classList.remove('active');
            document.getElementById('login-id').classList.add('active');
            document.getElementById('background').classList.add('active');
        }
    });
}

function closeMenu() {
	document.getElementById('profile-modal').classList.remove('active');
    document.getElementById('login-id').classList.remove('active');
    document.getElementById('signup-id').classList.remove('active');
    document.getElementById('info-modal').classList.remove('active');
    document.getElementById('settings-popup').classList.remove('active');
    document.getElementById('token-popup').classList.remove('active');
    document.getElementById('background').classList.remove('active');
}

function openSignin() {
    requireCookies(async () => {
        document.getElementById('login-id').classList.remove('active');
        document.getElementById('signup-id').classList.add('active');
        document.getElementById('background').classList.add('active');
    })
}

function openInfo() {
    document.getElementById('info-modal').classList.add('active');
    document.getElementById('background').classList.add('active');
}

function cookiesAccepted() {
    return localStorage.getItem("cookiesAccepted") === "true";
}

function acceptCookies() {
    localStorage.setItem("cookiesAccepted", "true");
    banner.style.display = "none";
}

function requireCookies(fn) {
    if (!cookiesAccepted()) {
        showToast("Accept cookies first.", "error");
        return;
    }
    fn();
}


function finish() {
    document.getElementById("onboarding-modal").style.display = "none";
    localStorage.setItem("rlb_seen", "true");
}

// init
window.onload = function () {
    if (!localStorage.getItem("rlb_seen")) {
        document.getElementById("onboarding-modal").style.display = "flex";
    }
};

function openTokenPurchase() {
    requireCookies(async () => {
        const res = await fetch('/me');
        const data = await res.json();

        if (data.user) {
            document.getElementById('token-popup').classList.add('active');
            document.getElementById('background').classList.add('active');
        } else {
            showToast('Log in first!', 'error');
        }
    });
}

function showToast(message, type = 'default') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = '';
    toast.classList.add('show');
    if (type !== 'default') toast.classList.add(type);
    setTimeout(() => toast.classList.remove('show'), 3000);
}

async function SUBMITLOGIN() {
    requireCookies(async () => {
        const username = document.getElementById("login-username").value;
        const password = document.getElementById("login-password").value;

        const res = await fetch("/submitlogin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (data.success) {
            const icon = document.getElementById('login-icon');
            icon.src = '/images/settings.svg';
            showToast('Logged in!', 'success');
            closeMenu();
            loadLeaderboard();
        } else {
            showToast(data.message, 'error');
        }
    });
}

function logout() {
    fetch("/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
    }).then(res => res.json()).then(data => {
        if (data.success) {
            const icon = document.getElementById('login-icon');
            icon.src = '/images/login-icon.svg';
			closeMenu()
			showToast('Logged out!', 'success');
        }
    });
}

async function SUBMITSIGNUP() {
    requireCookies(async () => {
        const username = document.getElementById("signin-username").value;
        const password = document.getElementById("signin-password").value;

        const res = await fetch("/submitsignup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (data.success) {
            showToast('Account created!', 'success');
            closeMenu();
            loadLeaderboard();
        } else {
            showToast(data.message, 'error');
        }
    });
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenu();
});

async function giveTokens() {
    requireCookies(async () => {
        const res = await fetch('/me');
        const userData = await res.json();
        if (!userData.user) {
            showToast('Log in first!', 'error');
            return;
        }
        
        const tokens = Number(document.getElementById("num").value);
        try {
            const giveRes = await fetch('/give', {
                method: 'POST',
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tokens })
            });
            const data = await giveRes.json();
            
            if (data.url) {
                window.location.href = data.url;
            } else {
                showToast(data.message || 'Error', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Server error', 'error');
        }
    });
}

if (params.get("payment") === "success") {
    showToast("Payment successful!", "success");
    params.delete("payment");
    const newUrl = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
    window.history.replaceState({}, "", newUrl);
}

if (params.get("payment") === "cancel") {
    showToast("Payment failed.", "error");
    params.delete("payment");
    const newUrl = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
    window.history.replaceState({}, "", newUrl);
}


function loadLeaderboard() {
    fetch('/leaderboard').then(res => res.json()).then(data => {
        const tbody = document.getElementById('leaderboard');
        tbody.innerHTML = '';
        data.forEach((user, index) => {
            const rank = index + 1;
            const colorClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
            const row = document.createElement('tr');
            row.className = colorClass;
            row.innerHTML = `
                <td>${rank === 1 ? '<img src="/images/crown.png" style="width:25px; height:25px; object-fit:contain; vertical-align:middle;">' : '#' + rank}</td>
				<td>
					<img src="${user.Pfp ? '/pfps/' + user.Pfp : '/images/account.svg'}" loading="lazy" style="width:24px; height:24px; border-radius:50%; object-fit:cover; vertical-align:middle; margin-right:8px;">
					<span style="cursor:pointer" onclick="openProfile('${user.Username}')">${user.Username}</span>
					${user.id === 1 ? '<span style="color: #b000ff; font-size: 11px;">[DEV]</span>' : ''}
				</td>
                <td>${user.Tokens}</td>
            `;
            tbody.appendChild(row);
        });
    });
}

async function openProfile(username) {
    if (!username) return;
    
    // Ensure lowercase for matching
    const cleanName = username.toLowerCase();
    
    const res = await fetch('/user/' + cleanName);
    const data = await res.json();

    if (!data.success) return;

    const rank = await fetch('/leaderboard').then(r => r.json()).then(lb => lb.findIndex(u => u.Username === cleanName) + 1);
    const rankColor = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? '#cd7f32' : '';

    document.getElementById('profile-modal-pfp').src = data.user.Pfp ? '/pfps/' + data.user.Pfp : '/images/account.svg';
    document.getElementById('profile-modal-username').innerHTML = `<span style="color:${rankColor}">${data.user.Username}</span> ` + (data.user.id === 1 ? '<span style="color: #b000ff; font-size: 13px;">[DEV]</span>' : '');
	document.getElementById('profile-bio').textContent = data.user.Bio || '';
    document.getElementById('profile-stats').textContent = '#' + rank + " - " + data.user.Tokens + " Tokens";
    document.getElementById('profile-member-since').textContent = 'Member since ' + new Date(data.user.Created_at).toLocaleDateString('en-GB', { year: 'numeric', month: 'long' });

    const shareBtn = document.getElementById('share-profile-btn');
    shareBtn.onclick = () => copyProfileLink(data.user.Username);

    document.getElementById('profile-modal').classList.add('active');
    document.getElementById('background').classList.add('active');
}

function copyProfileLink(username) {
    const link = window.location.origin + "?user=" + username;
    navigator.clipboard.writeText(link).then(() => {
        showToast("Profile link copied!", "success");
    }).catch(err => {
        console.error('Could not copy text: ', err);
        showToast("Failed to copy link", "error");
    });
}

async function myProfile() {
    const res = await fetch('/me');
    const data = await res.json();
    document.getElementById('settings-popup').classList.remove('active');
    openProfile(data.user);
}

function previewPfp(input) {
    const file = input.files[0];
    if (!file) return;
    document.getElementById('settings-pfp').src = URL.createObjectURL(file);
}

async function saveSettings() {
    const newUsername = document.getElementById('new-username').value;
    const newPassword = document.getElementById('new-password').value;
    const newBiography = document.getElementById('new-biography').value;
    const currentPassword = document.getElementById('current-password').value;

    if (!currentPassword) {
        showToast('Enter current password to save', 'error');
        return;
    }

    const res = await fetch('/update-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername, newPassword, newBiography, currentPassword })
    });

    const data = await res.json();

    if (!data.success) {
        showToast(data.message, 'error');
        return;
    }

    const pfpInput = document.getElementById('pfp-input');
    if (pfpInput && pfpInput.files[0]) {
        await uploadPfp(pfpInput);
    }

    showToast('Settings saved!', 'success');
    setTimeout(() => location.reload(), 1500);
    
}

async function uploadPfp(input) {
    const file = input.files[0];
    const formData = new FormData();
    formData.append('pfp', file);

    const res = await fetch('/upload-pfp', { method: 'POST', body: formData });
    const data = await res.json();

    if (data.success) {
        document.getElementById('settings-pfp').src = '/pfps/' + data.filename;
        document.getElementById('login-icon').src = '/pfps/' + data.filename;
    } else {
        showToast(data.message || 'Upload failed', 'error');
    }
}

function Reload() {
    loadLeaderboard();
    showToast('Reloaded!');
}

function changeValue(amount) {
    let value = parseInt(input.value) || 0;
    value += amount;
    if (value < 0) value = 0;
    if (value > 999) value = 999;
    input.value = value;
}

document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
        const res = await fetch('/me');
        const data = await res.json();
        const icon = document.getElementById('login-icon');
        if (!data.user) {
            icon.src = '/images/login-icon.svg';
        }
    }
});

minus.addEventListener("click", () => changeValue(-1));
plus.addEventListener("click", () => changeValue(1));

// PAGE INITIALIZATION
window.addEventListener('DOMContentLoaded', async () => {
    if (cookiesAccepted()) {
        if (banner) banner.style.display = "none";
    }

    loadLeaderboard();

    document.getElementById("onboarding-modal").style.display = "none";

    const res = await fetch('/me');
    const data = await res.json();
    const icon = document.getElementById('login-icon');

    if (data.user) {
        const pfpRes = await fetch('/me-full');
        const pfpData = await pfpRes.json();
        icon.src = pfpData.pfp ? '/pfps/' + pfpData.pfp : '/images/settings.svg';
    } else {
        icon.src = '/images/login-icon.svg';
    }

    const userToOpen = params.get("user");
    if (userToOpen) {
        openProfile(userToOpen);
        params.delete("user");
        const newUrl = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
        window.history.replaceState({}, "", newUrl);
    }
});
