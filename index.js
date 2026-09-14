/* ===================================================================
   FIREBASE SETUP
   ===================================================================
   1. Go to https://console.firebase.google.com, create a free project.
   2. In the project, add a "Web app" (</> icon) - it'll give you a
      firebaseConfig object. Paste your real values in below.
   3. In the Firebase console, go to Firestore Database -> Create database.
      Start in TEST MODE to get running quickly, then see the security
      rules note at the bottom of this file before you launch publicly.
   4. Go to Build -> Authentication -> Get started -> Sign-in method,
      and enable the "Anonymous" provider. This gives each browser a
      real, server-verified identity (no login screen for visitors)
      that security rules can trust - unlike a plain localStorage id,
      which anyone could fake.
   =================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
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
const auth = getAuth(app);
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

/* ===================== Real per-browser identity (Firebase Auth) ===================== */
// currentUid is the server-verified id for this browser, used both to tag
// messages on send and to check ownership when deciding whether to show
// the delete button. Unlike a localStorage string, this can't be faked -
// Firestore security rules check request.auth.uid, which only Firebase
// itself can set.
let currentUid = null;

function displayName(uid){
  return 'User-' + uid.slice(0, 6).toUpperCase();
}

onAuthStateChanged(auth, (user) => {
  currentUid = user ? user.uid : null;
  // Delete-button visibility depends on ownership, so re-render once we
  // actually know who "we" are.
  if (feedbackPanel.classList.contains('show')) {
    renderFeedback();
  }
});

signInAnonymously(auth).catch((err) => {
  console.error('Could not sign in anonymously:', err);
});

/* ===================== Draft persistence for unsent text ===================== */
// Saves whatever's currently typed (but not yet sent) so an accidental
// refresh doesn't lose it. This is separate from clearing the textarea
// after a successful send, which still happens immediately.
const DRAFT_KEY = 'doWithWonda:feedbackDraft:v1';

function loadDraft(){
  try {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) feedbackTextarea.value = saved;
  } catch (e) {
    console.error('Could not load saved draft:', e);
  }
}

function saveDraft(){
  try {
    localStorage.setItem(DRAFT_KEY, feedbackTextarea.value);
  } catch (e) {
    console.error('Could not save draft:', e);
  }
}

function clearDraft(){
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch (e) {
    console.error('Could not clear draft:', e);
  }
}

if (feedbackTextarea) {
  loadDraft();
  feedbackTextarea.addEventListener('input', saveDraft);
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

    if (!currentUid) {
      showAlert("Still connecting - try again in a moment.", true);
      return;
    }

    // Clear right away so the textarea never lingers with the sent text,
    // regardless of how long the write takes or whether it succeeds.
    feedbackTextarea.value = '';
    clearDraft();

    const submitBtn = contactForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      await addDoc(feedbackCollection, {
        ownerUid: currentUid,
        userId: displayName(currentUid),
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
let hasLoadedFeedback = false; // true once the first Firestore response arrives

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

  if (!hasLoadedFeedback) {
    const loading = document.createElement('p');
    loading.className = 'feedbackEmpty';
    loading.textContent = 'Loading messages...';
    feedbackList.appendChild(loading);
    return;
  }

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

    const isOwner = !!(currentUid && item.ownerUid && item.ownerUid === currentUid);

    el.innerHTML = `
      <div class="feedbackMeta">
        <span class="feedbackUser">${escapeHtml(item.userId)}</span>
        <span class="feedbackMetaRight">
          <span class="feedbackTime">${formatTime(item.timestamp)}</span>
          ${isOwner ? '<button type="button" class="feedbackDeleteBtn" title="Delete message">&times;</button>' : ''}
        </span>
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

    if (isOwner) {
      el.querySelector('.feedbackDeleteBtn').addEventListener('click', async () => {
        const confirmed = confirm('Delete this message? This cannot be undone.');
        if (!confirmed) return;

        const btn = el.querySelector('.feedbackDeleteBtn');
        btn.disabled = true;

        try {
          await deleteDoc(doc(db, 'feedback', item.id));
          // onSnapshot picks up the removal and re-renders automatically.
        } catch (err) {
          console.error('Could not delete message:', err);
          btn.disabled = false;
        }
      });
    }

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
  hasLoadedFeedback = true;

  if (feedbackPanel.classList.contains('show')) {
    renderFeedback();
  }
}, (err) => {
  console.error('Could not load feedback:', err);
  hasLoadedFeedback = true;

  if (feedbackPanel.classList.contains('show')) {
    feedbackList.innerHTML = '';
    const errorMsg = document.createElement('p');
    errorMsg.className = 'feedbackEmpty';
    errorMsg.textContent = 'Could not load messages - check your connection or Firebase setup.';
    feedbackList.appendChild(errorMsg);
  }
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
         allow create: if request.auth != null
                       && request.resource.data.ownerUid == request.auth.uid
                       && request.resource.data.keys().hasAll(['ownerUid', 'userId', 'message', 'timestamp', 'reply'])
                       && request.resource.data.message is string
                       && request.resource.data.message.size() < 2000;
         allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly(['reply']);
         allow delete: if request.auth != null && request.auth.uid == resource.data.ownerUid;
       }
     }
   }

   This requires the visitor to be signed in (anonymously - see the setup
   note at the top of this file) to send a message, and stamps that real,
   server-verified uid onto the message as ownerUid. Only that same uid
   can later delete it - unlike a plain localStorage string, this can't
   be spoofed by editing values in DevTools, since request.auth.uid is
   set by Firebase itself, not sent by the client.

   Replies stay open to anyone (any visitor can reply to any message,
   not just the owner) - that's intentional so the site owner or other
   visitors can respond. Restrict "allow update" further if you only
   want specific people replying.
   =================================================================== */