# 🛡️ AI Permission Abuse Detector — Chrome Extension

> **Know before you allow.** This extension watches every permission request on every website and instantly tells you whether it's safe, suspicious, or a red flag — in plain English.

---

## What Does It Do?

Every time a website asks for your **camera, microphone, location, clipboard, or notifications**, this extension intercepts it *before* you decide, analyzes it using AI, and shows you a clear warning like:

```
🚨 CRITICAL RISK  —  Camera requested on randomnewssite.com
"News websites have no legitimate reason to access your camera.
 This is a strong indicator of surveillance or misuse."
                                          [ Block ]  [ Allow ]  [ ✕ ]
```

No more blindly clicking "Allow" and hoping for the best.

---

## Installation (Step by Step)

### Step 1 — Download the Extension

Download the `ai-permission-detector.zip` file and unzip it anywhere on your computer — for example:


You will see two folders inside:
- 📁 `extension/` — this is the Chrome extension
- 📁 `backend/` — this is the optional AI server (for enhanced analysis)

---

### Step 2 — Load the Extension into Chrome

1. Open **Google Chrome**
2. In the address bar, type: `chrome://extensions/` and press **Enter**
3. In the top-right corner, turn on **Developer Mode**

   ![Developer Mode toggle in top right]

4. Click **"Load unpacked"** (appears on the top left after enabling Developer Mode)
5. In the file picker, navigate to the unzipped folder and select the **`extension/`** folder
6. Click **"Select Folder"**

The extension is now installed. You will see the 🛡️ shield icon appear in your Chrome toolbar.

> **Pinning the icon (recommended):** Click the 🧩 puzzle piece icon in the toolbar → find "AI Permission Detector" → click the 📌 pin icon so it's always visible.

---

## How to Use the Extension

### The Warning Banner

Whenever a website requests a permission, a banner slides in from the top of the page:

| What You See | What It Means |
|---|---|
| ✅ **LOW RISK** (green) | Normal for this type of site. Safe to allow. |
| ⚡ **MEDIUM RISK** (orange) | Somewhat unusual. Think before allowing. |
| ⚠️ **HIGH RISK** (red) | Not expected for this site type. Recommend blocking. |
| 🚨 **CRITICAL RISK** (purple) | Almost certainly suspicious. Block immediately. |

**Banner buttons:**
- **Block** — records your decision and dismisses the banner
- **Allow** — dismisses the banner (browser will still ask you separately)
- **✕** — closes the banner without recording a decision

---

### The Extension Popup

Click the 🛡️ icon in your toolbar to open the popup. It has 4 tabs:

#### Alerts Tab
Shows every permission request that was detected, from newest to oldest. For each alert you can see:
- Which permission was requested and by which site
- The risk level and AI explanation
- **Allow Once**, **Block**, and **Trust Site** buttons to record your decision

#### Stats Tab
Shows your overall detection history:
- Total alerts detected
- How many were high/critical risk
- How many unique sites were analyzed
- A bar chart of risk distribution
- Top requested permissions across all sites

#### Current Site Tab
Shows live information about the tab you currently have open:
- Site category (e.g. "e commerce", "news", "social media")
- Total alerts for this domain
- All permissions this site has ever requested
- Number of decisions you've made for this site

#### Settings Tab
Configure how the extension behaves:

| Setting | What It Does |
|---|---|
| Auto-block high risk | Automatically denies critical permission requests without asking |
| Alert on High risk | Shows a Chrome notification for high/critical detections |
| Alert on Medium risk | Shows a Chrome notification for medium risk detections |
| Enable learning | Sends your block/allow decisions to improve the AI model |
| Backend Server URL | Address of your local FastAPI backend `https://ai-permission-abuse-detector.onrender.com/docs#/` |

---



## Optional: Run the AI Backend

The extension works fully offline with its built-in rule engine. If you want enhanced ML-powered analysis and persistent alert history, you can run the local backend:

### Requirements
- Python 3.9 or higher
- Windows Terminal / Command Prompt / PowerShell

### Setup

Open a terminal, navigate to the `backend/` folder, and run:

**On Windows:**
```cmd
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

**On Mac/Linux:**
```bash
cd backend
chmod +x setup.sh
./setup.sh
source venv/bin/activate
python main.py
```

The server starts at `https://ai-permission-abuse-detector.onrender.com/`. You can verify it's running by visiting that URL in your browser — you should see a JSON response.

Once the backend is running, go to the extension **Settings tab** and make sure the Backend Server URL is set to `https://ai-permission-abuse-detector.onrender.com/docs#/`. The extension will automatically use the AI backend for all future analyses.



---

## Frequently Asked Questions

**The banner isn't showing — what's wrong?**
After installing or updating the extension, always do a hard refresh on the page you're testing (`Ctrl + Shift + R`). Also make sure you clicked "Load unpacked" and selected the `extension/` subfolder, not the outer zip folder.

**It shows LOW RISK on webcamtests.com — is that correct?**
Yes! Webcamtests.com is a legitimate camera testing website, so camera access is expected there. Low risk means the extension is working correctly and judged it as safe.

**Does this extension actually block permissions?**
The banner's Block button records your decision and dismisses the warning. The actual browser permission prompt (Chrome's built-in one) is separate. For true automatic blocking, enable "Auto-block high risk" in Settings — this requires the backend to be running.

**Does it slow down my browser?**
No. The content script is lightweight and only activates when a permission API is called. The local analysis runs in milliseconds.

**Do I need the backend to use the extension?**
No. The extension has a full built-in analysis engine that works without any server. The backend adds enhanced ML classification and saves your alert history to a local database.

**Is my data sent anywhere?**
Never. Everything runs locally — on your machine. The extension stores data in Chrome's local storage. The backend uses a SQLite database file on your computer.

**Can I use this on Firefox?**
Not yet. This version is built for Chrome (Manifest V3). Firefox support is planned as a future enhancement.


