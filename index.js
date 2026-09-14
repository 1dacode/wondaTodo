/* ===================================================================
   FIREBASE SETUP
   ===================================================================
   1. Go to https://console.firebase.google.com, create a free project.
   2. In the project, add a "Web app" (</> icon) - it'll give you a
      firebaseConfig object. Paste your real values in below.
   3. In the Firebase console, go to Firestore Database -> Create database.
      Start in TEST MODE to get running quickly, then see the security
      rules note at the bottom of this file before you launch publicly.
   =================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB42l7luT_0zSZf1HpYVTNKfeCzUi3CFQI",
  authDomain: "do-with-wonda.firebaseapp.com",
  projectId: "do-with-wonda",
  storageBucket: "do-with-wonda.firebasestorage.app",
  messagingSenderId: "1046905531401",
  appId: "1:1046905531401:web:298ddf3c10646656c55cd8"
};

if (firebaseConfig.apiKey === "YOUR_API_KEY") {
  console.warn(
    "Firebase isn't configured yet - replace the placeholder values in " +
    "firebaseConfig (index.js) with your real project config."
  );
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const feedbackCollection = collection(db, 'feedback');

/* ===================== Elements ===================== */
const contactForm       = document.getElementById('contactForm');
const feedbackTextarea  = document.getElementById('feedbackTextarea');
const sendAlert         = document.getElementById('sendAlert');

const viewFeedbackTrigger = document.getElementById('viewFeedbackTrigger');
const feedbackBackdrop    = document.getElementById('feedbackBackdrop');
const feedbackPanel       = document.getElementById('feedbackPanel');
const feedbackClose       = document.getElementById('feedbackClose');
const feedbackList        = document.getElementById('feedbackList');

/* ===================== Anonymous per-browser user id ===================== */
// This is just a label so messages can be grouped by sender - the messages
// themselves live in Firestore and are visible to every visitor, on every
// device/browser, not just the one that sent them.
const USER_ID_KEY = 'doWithWonda:userId:v1';

function getUserId(){
  try {
    let userId = localStorage.getItem(USER_ID_KEY);
    if (!userId) {
      userId = 'User-' + Math.random().toString(36).slice(2, 8).toUpperCase();
      localStorage.setItem(USER_ID_KEY, userId);
    }
    return userId;
  } catch (e) {
    // localStorage unavailable (private browsing, etc.) - fall back to a
    // one-off id that just won't persist across a refresh.
    return 'User-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  }
}

/* ===================== Helpers ===================== */
function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(timestamp){
  // Firestore serverTimestamp() is null for a brief moment right after a
  // write, before it syncs back down - show something reasonable meanwhile.
  if (!timestamp) return 'Just now';
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}

/* ===================== Sending a message ===================== */
let alertTimeout = null;

function showAlert(text, isError){
  sendAlert.textContent = text;
  sendAlert.classList.toggle('error', !!isError);
  sendAlert.classList.add('show');

  clearTimeout(alertTimeout);
  alertTimeout = setTimeout(() => {
    sendAlert.classList.remove('show');
  }, 3000);
}

if (contactForm) {
  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const text = feedbackTextarea.value.trim();
    if (!text) return;

    // Clear right away so the textarea never lingers with the sent text,
    // regardless of how long the write takes or whether it succeeds.
    feedbackTextarea.value = '';

    const submitBtn = contactForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      await addDoc(feedbackCollection, {
        userId: getUserId(),
        message: text,
        timestamp: serverTimestamp(),
        reply: null
      });

      showAlert('Message sent!');
    } catch (err) {
      console.error('Could not send message:', err);
      showAlert("Something went wrong sending your message.", true);
    } finally {
      submitBtn.disabled = false;
    }
  });
}

/* ===================== Feedback panel ===================== */
let feedback = [];

function openFeedbackPanel(){
  renderFeedback();
  feedbackPanel.classList.add('show');
  feedbackBackdrop.classList.add('show');
}

function closeFeedbackPanel(){
  feedbackPanel.classList.remove('show');
  feedbackBackdrop.classList.remove('show');
}

if (viewFeedbackTrigger) {
  viewFeedbackTrigger.addEventListener('click', openFeedbackPanel);
}
if (feedbackClose) {
  feedbackClose.addEventListener('click', closeFeedbackPanel);
}
if (feedbackBackdrop) {
  feedbackBackdrop.addEventListener('click', closeFeedbackPanel);
}

function renderFeedback(){
  feedbackList.innerHTML = '';

  if (feedback.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'feedbackEmpty';
    empty.textContent = 'No messages yet.';
    feedbackList.appendChild(empty);
    return;
  }

  feedback.forEach(item => {
    const el = document.createElement('div');
    el.className = 'feedbackItem';

    el.innerHTML = `
      <div class="feedbackMeta">
        <span class="feedbackUser">${escapeHtml(item.userId)}</span>
        <span class="feedbackTime">${formatTime(item.timestamp)}</span>
      </div>
      <p class="feedbackMessage">${escapeHtml(item.message)}</p>
      ${item.reply ? `<p class="feedbackReplyText"><strong>Reply:</strong> ${escapeHtml(item.reply)}</p>` : ''}
      <div class="feedbackReplyForm">
        <textarea class="feedbackReplyInput" placeholder="${item.reply ? 'Edit reply...' : 'Write a reply...'}">${item.reply ? escapeHtml(item.reply) : ''}</textarea>
        <button type="button" class="feedbackReplyBtn">${item.reply ? 'Update' : 'Reply'}</button>
      </div>
    `;

    el.querySelector('.feedbackReplyBtn').addEventListener('click', async () => {
      const input = el.querySelector('.feedbackReplyInput');
      const replyText = input.value.trim();
      if (!replyText) return;

      const btn = el.querySelector('.feedbackReplyBtn');
      btn.disabled = true;

      try {
        await updateDoc(doc(db, 'feedback', item.id), { reply: replyText });
        // no need to manually re-render - the onSnapshot listener below
        // picks up the change and refreshes the panel automatically.
      } catch (err) {
        console.error('Could not save reply:', err);
        btn.disabled = false;
      }
    });

    feedbackList.appendChild(el);
  });
}

/* ===================== Live sync from Firestore ===================== */
// Keeps `feedback` up to date in real time - if the panel is open when a
// new message or reply comes in (from any visitor, any device), it
// re-renders immediately.
const feedbackQuery = query(feedbackCollection, orderBy('timestamp', 'desc'));

onSnapshot(feedbackQuery, (snapshot) => {
  feedback = snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    ...docSnap.data()
  }));

  if (feedbackPanel.classList.contains('show')) {
    renderFeedback();
  }
}, (err) => {
  console.error('Could not load feedback:', err);
});

/* ===================================================================
   FIRESTORE SECURITY RULES
   ===================================================================
   Test mode (Firebase's default for 30 days) allows anyone to read/write
   anything, which is fine for getting this running but not for a live
   site. Once it's working, go to Firestore Database -> Rules and use
   something like:

   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /feedback/{messageId} {
         allow read: if true;
         allow create: if request.resource.data.keys().hasAll(['userId', 'message', 'timestamp', 'reply'])
                       && request.resource.data.message is string
                       && request.resource.data.message.size() < 2000;
         allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly(['reply']);
         allow delete: if false;
       }
     }
   }

   This lets anyone read and send messages, but only ever change the
   "reply" field on an existing message (not the original text), and
   nobody can delete anything via the client.
   =================================================================== */